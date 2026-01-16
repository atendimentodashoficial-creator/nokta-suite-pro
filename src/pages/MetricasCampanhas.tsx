import { useState, useEffect } from "react";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { DateRangeCalendars } from "@/components/filters/CalendarWithMonthSelect";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  nowInBrasilia, 
  startOfDayBrasilia, 
  endOfDayBrasilia, 
  startOfWeekBrasilia, 
  endOfWeekBrasilia, 
  startOfMonthBrasilia, 
  endOfMonthBrasilia 
} from "@/utils/timezone";
import { 
  RefreshCw, 
  CalendarIcon,
  Eye,
  MousePointerClick,
  DollarSign,
  Users,
  Target,
  AlertCircle,
  Settings2,
  LayoutGrid,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Brain,
  Wallet,
  BarChart3,
  TrendingDown
} from "lucide-react";
import { MetaIcon } from "@/components/icons/MetaIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  PresetManagerDialog, 
  type ColumnKey, 
  type Preset, 
  ALL_COLUMNS 
} from "@/components/metricas/PresetManagerDialog";
import { 
  MetricCardSelectorDialog, 
  type MetricCardKey,
  ALL_METRIC_CARDS,
  DEFAULT_VISIBLE_CARDS
} from "@/components/metricas/MetricCardSelectorDialog";
import { CampaignRow } from "@/components/metricas/CampaignRow";
import { AIReportsTab } from "@/components/metricas/AIReportsTab";
import { ContaAnunciosTab } from "@/components/metricas/ContaAnunciosTab";
import { FunilConversaoTab } from "@/components/metricas/FunilConversaoTab";
import { useMetricasPreferencias } from "@/hooks/useMetricasPreferencias";

// Default presets that are always available
const DEFAULT_PRESETS: Preset[] = [
  {
    id: "default",
    name: "Padrão",
    columns: ["status", "impressions", "clicks", "ctr", "spend"],
  },
  {
    id: "complete",
    name: "Completo",
    columns: ["status", "impressions", "clicks", "ctr", "cpc", "cpm", "reach", "results", "cost_per_result", "spend"],
  },
];

interface CampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  cost_per_result: number;
  daily_budget?: number;
}

interface LinkedAccount {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  currency_type: string | null;
}

export default function MetricasCampanhas() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Use the hook to manage preferences from database
  const { 
    presets: savedPresets, 
    visibleCards: savedVisibleCards,
    selectedPresetId,
    isLoading: prefsLoading,
    updatePresets,
    updateVisibleCards,
    updateSelectedPreset,
  } = useMetricasPreferencias();
  
  // Tab persistente
  const [activeMetaTab, setActiveMetaTab] = useTabPersistence("tab", "accounts");
  
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [totalActiveBudget, setTotalActiveBudget] = useState<number>(0);
  
  // Filtros de período
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateStart, setDateStart] = useState<Date>(new Date());
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const [calendarStartOpen, setCalendarStartOpen] = useState(false);
  const [calendarEndOpen, setCalendarEndOpen] = useState(false);

  // Colunas visíveis - derived from selected preset
  const getVisibleColumnsFromPreset = (presetId: string | null): ColumnKey[] => {
    if (!presetId) return ["status", "impressions", "clicks", "ctr", "cpc", "reach", "spend"];
    
    // Check default presets first
    const defaultPreset = DEFAULT_PRESETS.find(p => p.id === presetId);
    if (defaultPreset) return defaultPreset.columns;
    
    // Check custom presets
    const customPreset = savedPresets.find(p => p.id === presetId);
    if (customPreset) return customPreset.columns;
    
    return ["status", "impressions", "clicks", "ctr", "cpc", "reach", "spend"];
  };

  const visibleColumns = getVisibleColumnsFromPreset(selectedPresetId);
  const customPresets = savedPresets;
  const visibleMetricCards = savedVisibleCards;
  
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [metricCardDialogOpen, setMetricCardDialogOpen] = useState(false);

  // Ordenação
  const [sortColumn, setSortColumn] = useState<ColumnKey | "campaign_name" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Filtro de status - único toggle para todos os níveis
  const [filterActive, setFilterActive] = useState(true);

  // Modo foco: exibe apenas a campanha/conjunto expandido
  const [focusedCampaignId, setFocusedCampaignId] = useState<string | null>(null);
  const [focusedAdsetId, setFocusedAdsetId] = useState<string | null>(null);

  // Largura da coluna de nome (resizável)
  const [nameColumnWidth, setNameColumnWidth] = useState(200);

  // Handler for preset changes - save to database
  const handlePresetsChange = async (newPresets: Preset[]) => {
    await updatePresets(newPresets);
  };

  // Handler for applying a preset - save selection to database
  const handleApplyPreset = async (columns: ColumnKey[]) => {
    // Find which preset matches these columns
    const allPresets = [...DEFAULT_PRESETS, ...customPresets];
    const matchingPreset = allPresets.find(p => 
      JSON.stringify(p.columns) === JSON.stringify(columns)
    );
    
    if (matchingPreset) {
      await updateSelectedPreset(matchingPreset.id);
    }
  };

  // Handler for visible cards change - save to database
  const handleVisibleCardsChange = async (cards: MetricCardKey[]) => {
    await updateVisibleCards(cards);
  };

  // Campanhas filtradas e ordenadas
  const filteredAndSortedCampaigns = campaigns
    .filter((c) => !filterActive || c.status?.toUpperCase() === "ACTIVE")
    .sort((a, b) => {
      if (!sortColumn) return 0;
      
      let aVal: number | string;
      let bVal: number | string;
      
      if (sortColumn === "campaign_name") {
        aVal = a.campaign_name?.toLowerCase() || "";
        bVal = b.campaign_name?.toLowerCase() || "";
      } else if (sortColumn === "status") {
        aVal = a.status?.toLowerCase() || "";
        bVal = b.status?.toLowerCase() || "";
      } else {
        aVal = a[sortColumn] ?? 0;
        bVal = b[sortColumn] ?? 0;
      }
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === "asc" 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });

  // Totais e médias (usando campanhas filtradas)
  const summaryMetrics = (() => {
    const count = filteredAndSortedCampaigns.length;
    if (count === 0) {
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        reach: 0,
        results: 0,
        daily_budget: 0,
        active_budget: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        cost_per_result: 0,
      };
    }

    const sums = filteredAndSortedCampaigns.reduce(
      (acc, c) => ({
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        spend: acc.spend + c.spend,
        reach: acc.reach + c.reach,
        results: acc.results + c.results,
        daily_budget: acc.daily_budget + (c.daily_budget ?? 0),
      }),
      { impressions: 0, clicks: 0, spend: 0, reach: 0, results: 0, daily_budget: 0 }
    );

    // Calcular médias ponderadas corretamente
    const ctr = sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : 0;
    const cpc = sums.clicks > 0 ? sums.spend / sums.clicks : 0;
    const cpm = sums.impressions > 0 ? (sums.spend / sums.impressions) * 1000 : 0;
    const cost_per_result = sums.results > 0 ? sums.spend / sums.results : 0;

    return {
      ...sums,
      active_budget: totalActiveBudget, // Usa o valor calculado pela API (CBO + ABO)
      ctr,
      cpc,
      cpm,
      cost_per_result,
    };
  })();

  // Para os cards de resumo (usando os valores agregados)
  const totals = {
    impressions: summaryMetrics.impressions,
    clicks: summaryMetrics.clicks,
    spend: summaryMetrics.spend,
    reach: summaryMetrics.reach,
    results: summaryMetrics.results,
  };

  const handleSort = (column: ColumnKey | "campaign_name") => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortColumn(null);
        setSortDirection("desc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (column: ColumnKey | "campaign_name") => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />
  };

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  // Atualizar datas quando o período mudar
  useEffect(() => {
    const now = nowInBrasilia();
    switch (periodFilter) {
      case "today":
        setDateStart(now);
        setDateEnd(now);
        break;
      case "yesterday":
        const yesterday = subDays(now, 1);
        setDateStart(yesterday);
        setDateEnd(yesterday);
        break;
      case "last_7_days":
        setDateStart(subDays(now, 6));
        setDateEnd(now);
        break;
      case "last_30_days":
        setDateStart(subDays(now, 29));
        setDateEnd(now);
        break;
      case "this_week":
        setDateStart(startOfWeekBrasilia(now, { weekStartsOn: 0 }));
        setDateEnd(endOfWeekBrasilia(now, { weekStartsOn: 0 }));
        break;
      case "last_week":
        const lastWeekStart = startOfWeekBrasilia(subDays(now, 7), { weekStartsOn: 0 });
        setDateStart(lastWeekStart);
        setDateEnd(endOfWeekBrasilia(lastWeekStart, { weekStartsOn: 0 }));
        break;
      case "this_month":
        setDateStart(startOfMonthBrasilia(now));
        setDateEnd(endOfMonthBrasilia(now));
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDateStart(startOfMonthBrasilia(lastMonth));
        setDateEnd(endOfMonthBrasilia(lastMonth));
        break;
      case "max":
        // Facebook Ads API limita insights a ~37 meses, usar 3 anos como limite seguro
        setDateStart(subMonths(now, 36));
        setDateEnd(now);
        break;
      case "custom":
        break;
    }
  }, [periodFilter]);

  // Carregar métricas quando conta ou datas mudarem
  useEffect(() => {
    if (selectedAccount && hasToken) {
      fetchCampaignMetrics();
    }
  }, [selectedAccount, dateStart, dateEnd]);

  const loadConfig = async () => {
    try {
      const { data: configData, error: configError } = await supabase
        .from("facebook_config")
        .select("access_token")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!configError && configData?.access_token) {
        setHasToken(true);
        
        // Carregar contas vinculadas
        const { data: accountsData, error: accountsError } = await supabase
          .from("facebook_ad_accounts")
          .select("id, ad_account_id, account_name, currency_type")
          .eq("user_id", user?.id)
          .order("created_at", { ascending: false });

        if (!accountsError && accountsData && accountsData.length > 0) {
          setLinkedAccounts(accountsData);
          setSelectedAccount(accountsData[0].ad_account_id);
        }
      }
    } catch (error) {
      console.error("Error loading config:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignMetrics = async () => {
    if (!selectedAccount) return;
    
    setLoadingMetrics(true);
    // Reset focus mode when fetching new data
    setFocusedCampaignId(null);
    setFocusedAdsetId(null);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: { 
          action: "get_campaign_metrics",
          ad_account_id: selectedAccount,
          date_start: format(dateStart, "yyyy-MM-dd"),
          date_end: format(dateEnd, "yyyy-MM-dd")
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar métricas");
      }

      setCampaigns(response.data.campaigns || []);
      setTotalActiveBudget(response.data.total_active_budget || 0);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao buscar métricas";
      toast({
        title: "Erro ao carregar métricas",
        description: errorMessage,
        variant: "destructive",
      });
      setCampaigns([]);
      setTotalActiveBudget(0);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("pt-BR").format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return "bg-green-500/10 text-green-600 border-green-500/30";
      case "PAUSED":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "DELETED":
      case "ARCHIVED":
        return "bg-red-500/10 text-red-600 border-red-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return "Ativa";
      case "PAUSED":
        return "Pausada";
      case "DELETED":
        return "Deletada";
      case "ARCHIVED":
        return "Arquivada";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <MetaIcon className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Meta Ads</h1>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!hasToken || linkedAccounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <MetaIcon className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Meta Ads</h1>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              {!hasToken 
                ? "Configure o token do Facebook Ads para ver as métricas."
                : "Vincule uma conta de anúncios para ver as métricas."}
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/conta-anuncios"}>
              Ir para Conta de Anúncios
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <MetaIcon className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Meta Ads</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeMetaTab} onValueChange={setActiveMetaTab} className="space-y-6">
        <TabsList className="h-8">
          <TabsTrigger value="accounts" className="gap-1.5 text-xs px-3 h-7">
            <Wallet className="h-3.5 w-3.5" />
            Saldo
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5 text-xs px-3 h-7">
            <BarChart3 className="h-3.5 w-3.5" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="funnel" className="gap-1.5 text-xs px-3 h-7">
            <TrendingDown className="h-3.5 w-3.5" />
            Funil
          </TabsTrigger>
          <TabsTrigger value="ai-reports" className="gap-1.5 text-xs px-3 h-7">
            <Brain className="h-3.5 w-3.5" />
            Relatórios IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <ContaAnunciosTab />
        </TabsContent>

        <TabsContent value="metrics" className="space-y-6">
      {/* Filtros */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          {/* Conta de Anúncios */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Conta:</span>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[250px] bg-background">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                {linkedAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.ad_account_id}>
                    {account.account_name || account.ad_account_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Período */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Período:</span>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                <SelectItem value="this_week">Esta semana</SelectItem>
                <SelectItem value="last_week">Semana passada</SelectItem>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="max">Máximo</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodFilter === "custom" && (
            <DateRangeCalendars
              dateStart={dateStart}
              dateEnd={dateEnd}
              onDateStartChange={setDateStart}
              onDateEndChange={setDateEnd}
            />
          )}

          <Button
            variant="outline" 
            onClick={fetchCampaignMetrics}
            disabled={loadingMetrics}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingMetrics ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </Card>

      {/* Cards de Resumo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Métricas de Destaque</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setMetricCardDialogOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Personalizar</span>
          </Button>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleMetricCards.map((cardKey) => {
            const cardConfig = ALL_METRIC_CARDS.find((c) => c.key === cardKey);
            if (!cardConfig) return null;
            
            const IconComponent = cardConfig.icon;
            const value = cardKey === "cost_per_result" ? summaryMetrics.cost_per_result :
                          cardKey === "ctr" ? summaryMetrics.ctr :
                          cardKey === "cpc" ? summaryMetrics.cpc :
                          cardKey === "cpm" ? summaryMetrics.cpm :
                          cardKey === "active_budget" ? summaryMetrics.active_budget :
                          summaryMetrics[cardKey as keyof typeof summaryMetrics];
            
            const formattedValue = cardConfig.format === "currency" ? formatCurrency(value) :
                                   cardConfig.format === "percentage" ? formatPercentage(value) :
                                   formatNumber(value);
            
            const isHighlight = cardConfig.highlight || cardKey === "spend";
            
            return (
              <Card 
                key={cardKey}
                className={isHighlight ? "bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20" : ""}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{cardConfig.label}</CardTitle>
                  <IconComponent className={`h-4 w-4 ${isHighlight ? "text-primary" : "text-muted-foreground"}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isHighlight ? "text-primary" : ""}`}>{formattedValue}</div>
                  {cardConfig.subtitle && (
                    <p className="text-xs text-muted-foreground">{cardConfig.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dialog para personalizar métricas */}
      <MetricCardSelectorDialog
        open={metricCardDialogOpen}
        onOpenChange={setMetricCardDialogOpen}
        visibleCards={visibleMetricCards}
        onVisibleCardsChange={handleVisibleCardsChange}
      />

      {/* Tabela de Campanhas */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <CardTitle>Campanhas</CardTitle>
            <CardDescription>
              {filterActive 
                ? `${filteredAndSortedCampaigns.length} de ${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""} (apenas ativos)`
                : `${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""} encontrada${campaigns.length !== 1 ? "s" : ""}`
              }
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-nowrap overflow-x-auto md:flex-wrap md:justify-end -mt-2 md:mt-0">
            <Button 
              variant={filterActive ? "default" : "outline"}
              size="sm" 
              className="gap-2"
              onClick={() => setFilterActive(!filterActive)}
            >
              <Filter className="h-4 w-4" />
              Ativos
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setPresetDialogOpen(true)}
            >
              <LayoutGrid className="h-4 w-4" />
              Presets
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Settings2 className="h-4 w-4" />
                  Colunas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_COLUMNS.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={visibleColumns.includes(column.key)}
                    onCheckedChange={async (checked) => {
                      // When manually toggling columns, find or create a matching preset
                      const newColumns = checked 
                        ? [...visibleColumns, column.key]
                        : visibleColumns.filter((c) => c !== column.key);
                      
                      // Find if this matches an existing preset
                      const allPresets = [...DEFAULT_PRESETS, ...customPresets];
                      const matchingPreset = allPresets.find(p => 
                        JSON.stringify(p.columns.sort()) === JSON.stringify(newColumns.sort())
                      );
                      
                      if (matchingPreset) {
                        await updateSelectedPreset(matchingPreset.id);
                      } else {
                        // Create a temporary custom preset or clear selection
                        // For simplicity, we'll just clear the preset selection
                        // and the user can save it via the preset manager
                        await updateSelectedPreset(null);
                        // Save the columns as a new "custom" selection
                        const tempPreset: Preset = {
                          id: "temp_custom",
                          name: "Personalizado",
                          columns: newColumns,
                        };
                        // Update with temp preset
                        const existingWithoutTemp = customPresets.filter(p => p.id !== "temp_custom");
                        await updatePresets([...existingWithoutTemp, tempPreset]);
                        await updateSelectedPreset("temp_custom");
                      }
                    }}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => handleApplyPreset(ALL_COLUMNS.map(c => c.key))}
                  >
                    Todas
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 text-xs"
                    onClick={() => updateSelectedPreset("default")}
                  >
                    Padrão
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {loadingMetrics ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredAndSortedCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MetaIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {filterActive && campaigns.length > 0
                  ? "Nenhuma campanha ativa encontrada."
                  : "Nenhuma campanha encontrada para o período selecionado."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none relative group"
                      style={{ width: nameColumnWidth, minWidth: 120 }}
                      onClick={() => handleSort("campaign_name")}
                    >
                      <div className="flex items-center">
                        Campanha
                        {getSortIcon("campaign_name")}
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const startX = e.clientX;
                          const startWidth = nameColumnWidth;
                          
                          const handleMouseMove = (moveEvent: MouseEvent) => {
                            const diff = moveEvent.clientX - startX;
                            const newWidth = Math.max(120, startWidth + diff);
                            setNameColumnWidth(newWidth);
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener("mousemove", handleMouseMove);
                            document.removeEventListener("mouseup", handleMouseUp);
                          };
                          
                          document.addEventListener("mousemove", handleMouseMove);
                          document.addEventListener("mouseup", handleMouseUp);
                        }}
                      />
                    </TableHead>
                    {visibleColumns.map((columnKey) => {
                      const column = ALL_COLUMNS.find((c) => c.key === columnKey);
                      if (!column) return null;
                      return (
                        <TableHead 
                          key={columnKey} 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort(columnKey)}
                        >
                          <div className="flex items-center justify-center">
                            {column.label}
                            {getSortIcon(columnKey)}
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedCampaigns
                    .filter((c) => !focusedCampaignId || c.campaign_id === focusedCampaignId)
                    .map((campaign) => (
                    <CampaignRow
                      key={campaign.campaign_id}
                      campaign={campaign}
                      visibleColumns={visibleColumns}
                      dateStart={format(dateStart, "yyyy-MM-dd")}
                      dateEnd={format(dateEnd, "yyyy-MM-dd")}
                      formatNumber={formatNumber}
                      formatCurrency={formatCurrency}
                      formatPercentage={formatPercentage}
                      getStatusColor={getStatusColor}
                      getStatusLabel={getStatusLabel}
                      focusedAdsetId={focusedAdsetId}
                      filterActiveAdsets={filterActive}
                      filterActiveAds={filterActive}
                      nameColumnWidth={nameColumnWidth}
                      onCampaignExpand={(expanded) => {
                        setFocusedCampaignId(expanded ? campaign.campaign_id : null);
                        if (!expanded) setFocusedAdsetId(null);
                      }}
                      onAdsetExpand={(adsetId) => setFocusedAdsetId(adsetId)}
                    />
                  ))}
                  {/* Linha de Totais/Médias - só aparece quando não há foco em campanha */}
                  {!focusedCampaignId && (
                    <TableRow className="bg-muted/50 border-t-2">
                      <TableCell className="font-bold">Total / Média</TableCell>
                      {visibleColumns.map((columnKey) => {
                        const isAverageMetric = ["ctr", "cpc", "cpm", "cost_per_result"].includes(columnKey);
                        const textClass = isAverageMetric
                          ? "text-center font-bold text-primary"
                          : "text-center font-bold";

                        switch (columnKey) {
                          case "status":
                            return (
                              <TableCell key={columnKey} className="text-center text-sm text-muted-foreground">
                                {filteredAndSortedCampaigns.length} campanhas
                              </TableCell>
                            );
                          case "daily_budget":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatCurrency(summaryMetrics.daily_budget)}
                              </TableCell>
                            );
                          case "impressions":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatNumber(summaryMetrics.impressions)}
                              </TableCell>
                            );
                          case "clicks":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatNumber(summaryMetrics.clicks)}
                              </TableCell>
                            );
                          case "ctr":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatPercentage(summaryMetrics.ctr)}
                              </TableCell>
                            );
                          case "cpc":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatCurrency(summaryMetrics.cpc)}
                              </TableCell>
                            );
                          case "cpm":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatCurrency(summaryMetrics.cpm)}
                              </TableCell>
                            );
                          case "reach":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatNumber(summaryMetrics.reach)}
                              </TableCell>
                            );
                          case "results":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatNumber(summaryMetrics.results)}
                              </TableCell>
                            );
                          case "cost_per_result":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatCurrency(summaryMetrics.cost_per_result)}
                              </TableCell>
                            );
                          case "spend":
                            return (
                              <TableCell key={columnKey} className={textClass}>
                                {formatCurrency(summaryMetrics.spend)}
                              </TableCell>
                            );
                          default:
                            return (
                              <TableCell key={columnKey} className="text-center text-muted-foreground">
                                —
                              </TableCell>
                            );
                        }
                      })}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Presets */}
      <PresetManagerDialog
        open={presetDialogOpen}
        onOpenChange={setPresetDialogOpen}
        presets={customPresets}
        onPresetsChange={handlePresetsChange}
        onApplyPreset={handleApplyPreset}
      />
        </TabsContent>

        <TabsContent value="funnel">
          <FunilConversaoTab />
        </TabsContent>

        <TabsContent value="ai-reports">
          <AIReportsTab
            campaigns={campaigns}
            selectedAccount={selectedAccount}
            accountCurrency={linkedAccounts.find(a => a.ad_account_id === selectedAccount)?.currency_type}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
