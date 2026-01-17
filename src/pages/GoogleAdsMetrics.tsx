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
  startOfWeekBrasilia, 
  endOfWeekBrasilia, 
  startOfMonthBrasilia, 
  endOfMonthBrasilia 
} from "@/utils/timezone";
import { 
  RefreshCw, 
  CalendarIcon,
  DollarSign,
  AlertCircle,
  Settings2,
  Wallet,
  BarChart3,
  Eye,
  MousePointerClick,
  Target,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import googleAdsIcon from "@/assets/google-ads-icon.png";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GoogleCampaignMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cost_per_conversion: number;
}

interface LinkedGoogleAccount {
  id: string;
  customer_id: string;
  account_name: string | null;
  currency: string | null;
  last_spend: number | null;
}

type SortColumn = "campaign_name" | "status" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "conversions" | "cost_per_conversion" | "spend";

export default function GoogleAdsMetrics() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Tab persistente
  const [activeGoogleTab, setActiveGoogleTab] = useTabPersistence("tab", "accounts");
  
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedGoogleAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [campaigns, setCampaigns] = useState<GoogleCampaignMetrics[]>([]);
  
  // Filtros de período
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateStart, setDateStart] = useState<Date>(new Date());
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const [calendarStartOpen, setCalendarStartOpen] = useState(false);
  const [calendarEndOpen, setCalendarEndOpen] = useState(false);

  // Ordenação
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Filtro de status
  const [filterActive, setFilterActive] = useState(true);

  // Campanhas filtradas e ordenadas
  const filteredAndSortedCampaigns = campaigns
    .filter((c) => !filterActive || c.status?.toUpperCase() === "ENABLED")
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

  // Totais e médias
  const summaryMetrics = (() => {
    const count = filteredAndSortedCampaigns.length;
    if (count === 0) {
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        cost_per_conversion: 0,
      };
    }

    const sums = filteredAndSortedCampaigns.reduce(
      (acc, c) => ({
        impressions: acc.impressions + c.impressions,
        clicks: acc.clicks + c.clicks,
        spend: acc.spend + c.spend,
        conversions: acc.conversions + c.conversions,
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
    );

    const ctr = sums.impressions > 0 ? (sums.clicks / sums.impressions) * 100 : 0;
    const cpc = sums.clicks > 0 ? sums.spend / sums.clicks : 0;
    const cpm = sums.impressions > 0 ? (sums.spend / sums.impressions) * 1000 : 0;
    const cost_per_conversion = sums.conversions > 0 ? sums.spend / sums.conversions : 0;

    return {
      ...sums,
      ctr,
      cpc,
      cpm,
      cost_per_conversion,
    };
  })();

  const handleSort = (column: SortColumn) => {
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

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
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
        setDateStart(new Date(2020, 0, 1));
        setDateEnd(now);
        break;
      case "custom":
        break;
    }
  }, [periodFilter]);

  // Carregar métricas quando conta ou datas mudarem
  useEffect(() => {
    if (selectedAccount && hasConfig) {
      fetchCampaignMetrics();
    }
  }, [selectedAccount, dateStart, dateEnd]);

  const loadConfig = async () => {
    try {
      const { data: configData, error: configError } = await supabase
        .from("google_ads_config")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!configError && configData) {
        setHasConfig(true);
        
        // Carregar contas vinculadas
        const { data: accountsData, error: accountsError } = await supabase
          .from("google_ads_accounts")
          .select("*")
          .eq("user_id", user?.id)
          .order("created_at", { ascending: false });

        if (!accountsError && accountsData && accountsData.length > 0) {
          setLinkedAccounts(accountsData);
          setSelectedAccount(accountsData[0].customer_id);
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
    
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: { 
          action: "get_campaigns",
          customer_id: selectedAccount,
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

      const campaignsData = (response.data.campaigns || []).map((c: any) => ({
        campaign_id: c.id,
        campaign_name: c.name,
        status: c.status,
        impressions: c.impressions || 0,
        clicks: c.clicks || 0,
        spend: c.spend || 0,
        conversions: c.conversions || 0,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
        cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
        cost_per_conversion: c.conversions > 0 ? c.spend / c.conversions : 0,
      }));

      setCampaigns(campaignsData);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao buscar métricas";
      toast({
        title: "Erro ao carregar métricas",
        description: errorMessage,
        variant: "destructive",
      });
      setCampaigns([]);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchAccountSpend = async () => {
    if (!selectedAccount) return;
    
    setLoadingMetrics(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-ads-api", {
        body: { 
          action: "get_spend",
          customer_id: selectedAccount,
          date_start: format(dateStart, "yyyy-MM-dd"),
          date_end: format(dateEnd, "yyyy-MM-dd")
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao buscar gastos");
      }

      // Update linked account with spend data
      setLinkedAccounts(prev => prev.map(acc => 
        acc.customer_id === selectedAccount 
          ? { ...acc, last_spend: response.data.metrics?.spend || 0 }
          : acc
      ));
    } catch (error: unknown) {
      console.error("Error fetching spend:", error);
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
      case "ENABLED":
        return "bg-green-500/10 text-green-600 border-green-500/30";
      case "PAUSED":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "REMOVED":
        return "bg-red-500/10 text-red-600 border-red-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ENABLED":
        return "Ativa";
      case "PAUSED":
        return "Pausada";
      case "REMOVED":
        return "Removida";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
      <div className="flex items-center gap-2">
          <img src={googleAdsIcon} alt="Google Ads" className="h-6 w-6 brightness-0 dark:invert" />
          <h1 className="text-2xl font-bold">Google Ads</h1>
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

  if (!hasConfig || linkedAccounts.length === 0) {
    return (
      <div className="space-y-6">
      <div className="flex items-center gap-2">
          <img src={googleAdsIcon} alt="Google Ads" className="h-6 w-6 brightness-0 dark:invert" />
          <h1 className="text-2xl font-bold">Google Ads</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center mb-4">
              {!hasConfig 
                ? "Configure as credenciais do Google Ads para ver as métricas."
                : "Vincule uma conta de anúncios para ver as métricas."}
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/configuracoes"}>
              Ir para Conexões
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
          <img src={googleAdsIcon} alt="Google Ads" className="h-6 w-6 brightness-0 dark:invert" />
          <h1 className="text-2xl font-bold">Google Ads</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeGoogleTab} onValueChange={setActiveGoogleTab} className="space-y-6">
        <TabsList className="h-8">
          <TabsTrigger value="accounts" className="gap-1.5 text-xs px-3 h-7">
            <Wallet className="h-3.5 w-3.5" />
            Gastos
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5 text-xs px-3 h-7">
            <BarChart3 className="h-3.5 w-3.5" />
            Campanhas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
          {/* Contas Vinculadas */}
          <Card>
            <CardHeader>
              <CardTitle>Contas Vinculadas</CardTitle>
              <CardDescription>
                Visualize os gastos das suas contas do Google Ads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Período */}
              <div className="flex flex-wrap items-center gap-4">
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
              </div>

              {/* Lista de Contas */}
              <div className="space-y-3">
                {linkedAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 border rounded-xl bg-card"
                  >
                    <div>
                      <p className="font-medium">{account.account_name || "Conta sem nome"}</p>
                      <p className="text-sm text-muted-foreground font-mono">{account.customer_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {account.last_spend !== null 
                          ? formatCurrency(account.last_spend, account.currency || "BRL")
                          : "—"
                        }
                      </p>
                      <p className="text-xs text-muted-foreground">Gasto no período</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                variant="outline" 
                onClick={fetchAccountSpend}
                disabled={loadingMetrics}
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingMetrics ? "animate-spin" : ""}`} />
                Atualizar Gastos
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
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
                      <SelectItem key={account.id} value={account.customer_id}>
                        {account.account_name || account.customer_id}
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
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Impressões</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(summaryMetrics.impressions)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Cliques</CardTitle>
                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(summaryMetrics.clicks)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversões</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(summaryMetrics.conversions)}</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Gasto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(summaryMetrics.spend)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Campanhas */}
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <CardTitle>Campanhas</CardTitle>
                <CardDescription>
                  {filterActive 
                    ? `${filteredAndSortedCampaigns.length} de ${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""} (apenas ativas)`
                    : `${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""} encontrada${campaigns.length !== 1 ? "s" : ""}`
                  }
                </CardDescription>
              </div>
              <Button 
                variant={filterActive ? "default" : "outline"}
                size="sm" 
                className="gap-2"
                onClick={() => setFilterActive(!filterActive)}
              >
                <TrendingUp className="h-4 w-4" />
                Ativas
              </Button>
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
                  <img src={googleAdsIcon} alt="Google Ads" className="h-12 w-12 mx-auto mb-4 opacity-50 brightness-0 dark:invert" />
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
                          className="cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("campaign_name")}
                        >
                          <div className="flex items-center">
                            Campanha
                            {getSortIcon("campaign_name")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("status")}
                        >
                          <div className="flex items-center justify-center">
                            Status
                            {getSortIcon("status")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("impressions")}
                        >
                          <div className="flex items-center justify-center">
                            Impressões
                            {getSortIcon("impressions")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("clicks")}
                        >
                          <div className="flex items-center justify-center">
                            Cliques
                            {getSortIcon("clicks")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("ctr")}
                        >
                          <div className="flex items-center justify-center">
                            CTR
                            {getSortIcon("ctr")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("cpc")}
                        >
                          <div className="flex items-center justify-center">
                            CPC
                            {getSortIcon("cpc")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("conversions")}
                        >
                          <div className="flex items-center justify-center">
                            Conversões
                            {getSortIcon("conversions")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none text-center"
                          onClick={() => handleSort("spend")}
                        >
                          <div className="flex items-center justify-center">
                            Gasto
                            {getSortIcon("spend")}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedCampaigns.map((campaign) => (
                        <TableRow key={campaign.campaign_id}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {campaign.campaign_name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={getStatusColor(campaign.status)}>
                              {getStatusLabel(campaign.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{formatNumber(campaign.impressions)}</TableCell>
                          <TableCell className="text-center">{formatNumber(campaign.clicks)}</TableCell>
                          <TableCell className="text-center">{formatPercentage(campaign.ctr)}</TableCell>
                          <TableCell className="text-center">{formatCurrency(campaign.cpc)}</TableCell>
                          <TableCell className="text-center">{formatNumber(campaign.conversions)}</TableCell>
                          <TableCell className="text-center font-medium">{formatCurrency(campaign.spend)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Linha de Totais/Médias */}
                      <TableRow className="bg-muted/50 border-t-2">
                        <TableCell className="font-bold">Total / Média</TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {filteredAndSortedCampaigns.length} campanhas
                        </TableCell>
                        <TableCell className="text-center font-bold">{formatNumber(summaryMetrics.impressions)}</TableCell>
                        <TableCell className="text-center font-bold">{formatNumber(summaryMetrics.clicks)}</TableCell>
                        <TableCell className="text-center font-bold text-primary">{formatPercentage(summaryMetrics.ctr)}</TableCell>
                        <TableCell className="text-center font-bold text-primary">{formatCurrency(summaryMetrics.cpc)}</TableCell>
                        <TableCell className="text-center font-bold">{formatNumber(summaryMetrics.conversions)}</TableCell>
                        <TableCell className="text-center font-bold">{formatCurrency(summaryMetrics.spend)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
