import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CalendarIcon, 
  TrendingDown, 
  Users, 
  Calendar as CalendarIconSolid, 
  Handshake, 
  CheckCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Target,
  Loader2,
  BarChart3,
  Eye,
  UserX,
  UserCheck,
  TrendingUp,
  ArrowDownRight,
  Wallet,
  Receipt,
  Megaphone,
  HelpCircle
} from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { FunilVisualDialog } from "./FunilVisualDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FunnelData {
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  ad_id: string | null;
  leads: number;
  agendados: number;
  compareceu: number;
  nao_compareceu: number;
  em_negociacao: number;
  clientes: number;
  valor_fechado: number;
}

interface SpendData {
  campaign_name: string;
  spend: number;
}

interface SelectedFunnelData {
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  leads: number;
  agendados: number;
  compareceu: number;
  nao_compareceu: number;
  em_negociacao: number;
  clientes: number;
  valor_fechado: number;
  spend: number;
}

export function FunilConversaoTab() {
  const { user } = useAuth();
  const [periodFilter, setPeriodFilter] = useState("last_30_days");
  const [dateStart, setDateStart] = useState<Date>(subDays(new Date(), 29));
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const [calendarStartOpen, setCalendarStartOpen] = useState(false);
  const [calendarEndOpen, setCalendarEndOpen] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [viewLevel, setViewLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [selectedFunnel, setSelectedFunnel] = useState<SelectedFunnelData | null>(null);
  const [funnelDialogOpen, setFunnelDialogOpen] = useState(false);

  // Atualizar datas quando o período mudar
  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value);
    const now = new Date();
    switch (value) {
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
        setDateStart(startOfWeek(now, { weekStartsOn: 0 }));
        setDateEnd(endOfWeek(now, { weekStartsOn: 0 }));
        break;
      case "last_week":
        const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 0 });
        setDateStart(lastWeekStart);
        setDateEnd(endOfWeek(lastWeekStart, { weekStartsOn: 0 }));
        break;
      case "this_month":
        setDateStart(startOfMonth(now));
        setDateEnd(endOfMonth(now));
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDateStart(startOfMonth(lastMonth));
        setDateEnd(endOfMonth(lastMonth));
        break;
      case "max":
        setDateStart(new Date(2020, 0, 1));
        setDateEnd(now);
        break;
      case "custom":
        break;
    }
  };

  // Função para normalizar telefone (remover caracteres e garantir formato consistente)
  const normalizePhone = (phone: string): string => {
    const clean = phone.replace(/\D/g, "");
    // Se começa com 55 e tem 12-13 dígitos, está ok
    if (clean.startsWith("55") && clean.length >= 12) {
      return clean;
    }
    // Se tem 10-11 dígitos, adiciona 55
    if (clean.length >= 10 && clean.length <= 11) {
      return "55" + clean;
    }
    return clean;
  };

  // Buscar dados do funil
  const { data: funnelData, isLoading: loadingFunnel } = useQuery({
    queryKey: ["funnel-data", user?.id, dateStart, dateEnd, viewLevel],
    queryFn: async () => {
      if (!user?.id) return [];

      const startDate = format(dateStart, "yyyy-MM-dd");
      const endDate = format(dateEnd, "yyyy-MM-dd");

      // Buscar TODOS os leads do usuário para poder unificar por telefone
      const { data: allLeads, error } = await supabase
        .from("leads")
        .select(`
          id, 
          nome, 
          telefone,
          status, 
          fb_campaign_name, 
          fb_adset_name, 
          fb_ad_name, 
          fb_ad_id,
          created_at,
          valor_tratamento
        `)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) throw error;

      // Criar mapa de dados de campanha por telefone normalizado
      // Prioriza leads que têm dados de campanha
      const campaignDataByPhone: Record<string, {
        fb_campaign_name: string | null;
        fb_adset_name: string | null;
        fb_ad_name: string | null;
        fb_ad_id: string | null;
      }> = {};

      allLeads?.forEach(lead => {
        const normalizedPhone = normalizePhone(lead.telefone);
        // Se esse lead tem dados de campanha, salva no mapa
        if (lead.fb_campaign_name) {
          campaignDataByPhone[normalizedPhone] = {
            fb_campaign_name: lead.fb_campaign_name,
            fb_adset_name: lead.fb_adset_name,
            fb_ad_name: lead.fb_ad_name,
            fb_ad_id: lead.fb_ad_id,
          };
        }
      });

      // Criar mapa de todos os IDs de lead por telefone normalizado
      const leadIdsByPhone: Record<string, string[]> = {};
      allLeads?.forEach(lead => {
        const normalizedPhone = normalizePhone(lead.telefone);
        if (!leadIdsByPhone[normalizedPhone]) {
          leadIdsByPhone[normalizedPhone] = [];
        }
        leadIdsByPhone[normalizedPhone].push(lead.id);
      });

      // Filtrar leads pelo período
      const leads = allLeads?.filter(lead => {
        const createdAt = new Date(lead.created_at);
        const start = new Date(startDate);
        const end = new Date(endDate + "T23:59:59");
        return createdAt >= start && createdAt <= end;
      });

      // Buscar TODOS os agendamentos do usuário com status
      const { data: agendamentos, error: agendamentosError } = await supabase
        .from("agendamentos")
        .select("cliente_id, status, created_at")
        .eq("user_id", user.id);

      if (agendamentosError) throw agendamentosError;

      // Criar set de clientes com agendamento e mapa de status
      const clientesComAgendamento = new Set<string>();
      const clientesNaoCompareceram = new Set<string>();
      
      agendamentos?.forEach(a => {
        if (a.cliente_id) {
          clientesComAgendamento.add(a.cliente_id);
          // Status "cancelado" = não compareceu/desmarcou
          if (a.status === "cancelado") {
            clientesNaoCompareceram.add(a.cliente_id);
          }
        }
      });

      // Buscar faturas fechadas para calcular valor real
      const { data: faturas, error: faturasError } = await supabase
        .from("faturas")
        .select(`
          id,
          valor,
          status,
          cliente_id,
          created_at
        `)
        .eq("user_id", user.id)
        .eq("status", "fechado");

      if (faturasError) throw faturasError;

      // Criar mapa de valores de faturas por cliente
      const faturaPorCliente: Record<string, number> = {};
      faturas?.forEach(f => {
        if (f.cliente_id) {
          faturaPorCliente[f.cliente_id] = (faturaPorCliente[f.cliente_id] || 0) + f.valor;
        }
      });

      // Agrupar por campanha/conjunto/anúncio
      // Usar telefone normalizado para unificar leads duplicados
      const processedPhones = new Set<string>();
      const grouped: Record<string, FunnelData> = {};

      leads?.forEach(lead => {
        const normalizedPhone = normalizePhone(lead.telefone);
        
        // Pular se já processamos este telefone
        if (processedPhones.has(normalizedPhone)) return;
        processedPhones.add(normalizedPhone);

        // Obter dados de campanha do mapa (pode vir de outro registro do mesmo telefone)
        const campaignData = campaignDataByPhone[normalizedPhone];
        const campaignKey = campaignData?.fb_campaign_name || lead.fb_campaign_name || "Sem campanha";
        const adsetKey = campaignData?.fb_adset_name || lead.fb_adset_name || "Sem conjunto";
        const adKey = campaignData?.fb_ad_name || lead.fb_ad_name || "Sem anúncio";
        const adId = campaignData?.fb_ad_id || lead.fb_ad_id;
        
        // Chave única baseada no nível de visualização
        let key: string;
        if (viewLevel === "campaign") {
          key = campaignKey;
        } else if (viewLevel === "adset") {
          key = `${campaignKey}|||${adsetKey}`;
        } else {
          key = `${campaignKey}|||${adsetKey}|||${adKey}`;
        }

        if (!grouped[key]) {
          grouped[key] = {
            campaign_name: campaignKey,
            adset_name: viewLevel !== "campaign" ? adsetKey : null,
            ad_name: viewLevel === "ad" ? adKey : null,
            ad_id: adId,
            leads: 0,
            agendados: 0,
            compareceu: 0,
            nao_compareceu: 0,
            em_negociacao: 0,
            clientes: 0,
            valor_fechado: 0,
          };
        }

        grouped[key].leads++;
        
        // Pegar o melhor status entre todos os leads com este telefone
        const allLeadsWithPhone = allLeads?.filter(l => normalizePhone(l.telefone) === normalizedPhone) || [];
        const bestStatus = allLeadsWithPhone.find(l => l.status === "cliente")?.status ||
                          allLeadsWithPhone.find(l => l.status === "follow_up")?.status ||
                          lead.status;
        
        // Verificar se QUALQUER lead com este telefone tem agendamento
        const allLeadIds = leadIdsByPhone[normalizedPhone] || [lead.id];
        const hasAgendamento = allLeadIds.some(id => clientesComAgendamento.has(id));
        const naoCompareceu = allLeadIds.some(id => clientesNaoCompareceram.has(id));
        
        // Se está em negociação ou é cliente, obrigatoriamente passou pelo agendamento
        // Então conta como agendado mesmo se não tiver registro na tabela de agendamentos
        if (hasAgendamento || bestStatus === "follow_up" || bestStatus === "cliente") {
          grouped[key].agendados++;
          
          // Não compareceu = tinha agendamento mas cancelou/faltou
          // Só conta se não evoluiu para negociação ou cliente
          if (naoCompareceu && bestStatus !== "follow_up" && bestStatus !== "cliente") {
            grouped[key].nao_compareceu++;
          } else {
            // Compareceu = agendou e compareceu (está em negociação ou fechou, ou simplesmente não cancelou)
            grouped[key].compareceu++;
          }
        }
        
        // Em negociação = já agendou mas ainda NÃO fechou (apenas follow_up)
        if (bestStatus === "follow_up") {
          grouped[key].em_negociacao++;
        }
        
        if (bestStatus === "cliente") {
          grouped[key].clientes++;
          // Adicionar valor da fatura se existir (de qualquer lead com este telefone)
          let valorFechado = 0;
          allLeadIds.forEach(id => {
            if (faturaPorCliente[id]) {
              valorFechado += faturaPorCliente[id];
            }
          });
          if (valorFechado > 0) {
            grouped[key].valor_fechado += valorFechado;
          } else {
            // Fallback para valor_tratamento
            const valorTratamento = allLeadsWithPhone.find(l => l.valor_tratamento)?.valor_tratamento;
            if (valorTratamento) {
              grouped[key].valor_fechado += valorTratamento;
            }
          }
        }
      });

      return Object.values(grouped).sort((a, b) => b.leads - a.leads);
    },
    enabled: !!user?.id,
  });

  // Buscar gastos do Meta Ads
  const { data: spendData, isLoading: loadingSpend } = useQuery({
    queryKey: ["campaign-spend", user?.id, dateStart, dateEnd],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: session } = await supabase.auth.getSession();
      
      // Buscar conta de anúncios vinculada
      const { data: accounts } = await supabase
        .from("facebook_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) return [];

      const accountId = accounts[0].ad_account_id;

      try {
        const response = await supabase.functions.invoke("facebook-ads-api", {
          body: {
            action: "get_campaign_metrics",
            ad_account_id: accountId,
            date_start: format(dateStart, "yyyy-MM-dd"),
            date_end: format(dateEnd, "yyyy-MM-dd"),
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        });

        if (response.error || !response.data?.success) {
          console.error("Error fetching spend:", response.error);
          return [];
        }

        // Mapear nome da campanha para gasto
        return (response.data.campaigns || []).map((c: any) => ({
          campaign_name: c.campaign_name,
          spend: c.spend || 0,
        }));
      } catch (error) {
        console.error("Error fetching spend data:", error);
        return [];
      }
    },
    enabled: !!user?.id,
  });

  // Criar mapa de gastos por campanha
  const spendByCampaign = useMemo(() => {
    const map: Record<string, number> = {};
    spendData?.forEach(s => {
      map[s.campaign_name] = s.spend;
    });
    return map;
  }, [spendData]);

  // Calcular totais
  const totals = useMemo(() => {
    const defaultTotals = { 
      leads: 0, leadsTracked: 0, leadsUntracked: 0, 
      agendados: 0, agendadosTracked: 0, agendadosUntracked: 0,
      compareceu: 0, compareceuTracked: 0, compareceuUntracked: 0,
      nao_compareceu: 0, naoCompareceuTracked: 0, naoCompareceuUntracked: 0,
      em_negociacao: 0, emNegociacaoTracked: 0, emNegociacaoUntracked: 0,
      clientes: 0, clientesTracked: 0, clientesUntracked: 0,
      valor_fechado: 0, valorTracked: 0, valorUntracked: 0,
      spend: 0 
    };
    
    if (!funnelData) return defaultTotals;
    
    const totalSpend = Object.values(spendByCampaign).reduce((a, b) => a + b, 0);
    
    // Contar rastreados vs não rastreados
    const tracked = funnelData.filter(item => item.campaign_name !== "Sem campanha");
    const untracked = funnelData.find(item => item.campaign_name === "Sem campanha");
    
    const leadsTracked = tracked.reduce((sum, item) => sum + item.leads, 0);
    const leadsUntracked = untracked?.leads || 0;
    const agendadosTracked = tracked.reduce((sum, item) => sum + item.agendados, 0);
    const agendadosUntracked = untracked?.agendados || 0;
    const compareceuTracked = tracked.reduce((sum, item) => sum + item.compareceu, 0);
    const compareceuUntracked = untracked?.compareceu || 0;
    const naoCompareceuTracked = tracked.reduce((sum, item) => sum + item.nao_compareceu, 0);
    const naoCompareceuUntracked = untracked?.nao_compareceu || 0;
    const emNegociacaoTracked = tracked.reduce((sum, item) => sum + item.em_negociacao, 0);
    const emNegociacaoUntracked = untracked?.em_negociacao || 0;
    const clientesTracked = tracked.reduce((sum, item) => sum + item.clientes, 0);
    const clientesUntracked = untracked?.clientes || 0;
    const valorTracked = tracked.reduce((sum, item) => sum + item.valor_fechado, 0);
    const valorUntracked = untracked?.valor_fechado || 0;
    
    return funnelData.reduce((acc, item) => ({
      leads: acc.leads + item.leads,
      leadsTracked, leadsUntracked,
      agendados: acc.agendados + item.agendados,
      agendadosTracked, agendadosUntracked,
      compareceu: acc.compareceu + item.compareceu,
      compareceuTracked, compareceuUntracked,
      nao_compareceu: acc.nao_compareceu + item.nao_compareceu,
      naoCompareceuTracked, naoCompareceuUntracked,
      em_negociacao: acc.em_negociacao + item.em_negociacao,
      emNegociacaoTracked, emNegociacaoUntracked,
      clientes: acc.clientes + item.clientes,
      clientesTracked, clientesUntracked,
      valor_fechado: acc.valor_fechado + item.valor_fechado,
      valorTracked, valorUntracked,
      spend: totalSpend,
    }), { ...defaultTotals, spend: totalSpend });
  }, [funnelData, spendByCampaign]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("pt-BR").format(value);
  };

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return "0%";
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  // Calcular métricas adicionais
  const ticketMedio = totals.clientes > 0 ? totals.valor_fechado / totals.clientes : 0;
  
  // Calcular maior taxa de perda
  const taxas = [
    { etapa: "Lead → Agendado", taxa: totals.leads > 0 ? ((totals.leads - totals.agendados) / totals.leads) * 100 : 0, perdas: totals.leads - totals.agendados },
    { etapa: "Agendado → Compareceu", taxa: totals.agendados > 0 ? (totals.nao_compareceu / totals.agendados) * 100 : 0, perdas: totals.nao_compareceu },
    { etapa: "Compareceu → Fatura", taxa: totals.compareceu > 0 ? ((totals.compareceu - totals.clientes) / totals.compareceu) * 100 : 0, perdas: totals.compareceu - totals.clientes },
  ];
  const maiorPerda = taxas.reduce((max, item) => item.taxa > max.taxa ? item : max, taxas[0]);

  const isLoading = loadingFunnel || loadingSpend;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-5 w-5" />
            Filtros do Funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Período */}
            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={periodFilter} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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

            {/* Datas personalizadas */}
            {periodFilter === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Popover open={calendarStartOpen} onOpenChange={setCalendarStartOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal",
                          !dateStart && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateStart ? format(dateStart, "dd/MM/yyyy") : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateStart}
                        onSelect={(date) => {
                          if (date) setDateStart(date);
                          setCalendarStartOpen(false);
                        }}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Data Fim</Label>
                  <Popover open={calendarEndOpen} onOpenChange={setCalendarEndOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[140px] justify-start text-left font-normal",
                          !dateEnd && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateEnd ? format(dateEnd, "dd/MM/yyyy") : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateEnd}
                        onSelect={(date) => {
                          if (date) setDateEnd(date);
                          setCalendarEndOpen(false);
                        }}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Nível de visualização */}
            <div className="space-y-2">
              <Label>Agrupar por</Label>
              <Select value={viewLevel} onValueChange={(v) => setViewLevel(v as any)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">Campanha</SelectItem>
                  <SelectItem value="adset">Conjunto</SelectItem>
                  <SelectItem value="ad">Anúncio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Indicador de período selecionado */}
            <div className="text-sm text-muted-foreground ml-auto">
              {format(dateStart, "dd/MM/yyyy", { locale: ptBR })} - {format(dateEnd, "dd/MM/yyyy", { locale: ptBR })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de métricas principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Investimento */}
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investimento</CardTitle>
            <Wallet className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(totals.spend)}</div>
            <p className="text-xs text-muted-foreground">
              Gasto no período
            </p>
          </CardContent>
        </Card>

        {/* Faturamento */}
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.valor_fechado)}</div>
            <p className="text-xs text-muted-foreground">
              ROAS: {totals.spend > 0 ? `${(totals.valor_fechado / totals.spend).toFixed(2)}x` : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Ticket Médio */}
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <Receipt className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(ticketMedio)}</div>
            <p className="text-xs text-muted-foreground">
              Por cliente fechado
            </p>
          </CardContent>
        </Card>

        {/* Maior Perda */}
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maior Perda</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-red-600">{maiorPerda.etapa}</div>
            <p className="text-xs text-muted-foreground">
              {maiorPerda.taxa.toFixed(1)}% de perda ({maiorPerda.perdas} leads)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de resumo do funil */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads</CardTitle>
            <div className="flex items-center gap-1">
              <Megaphone className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">/</span>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.leads)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">{formatNumber(totals.leadsTracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Leads de anúncios (rastreados)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    <span>{formatNumber(totals.leadsUntracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Leads sem rastreamento</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agendados</CardTitle>
            <div className="flex items-center gap-1">
              <Megaphone className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">/</span>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.agendados)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">{formatNumber(totals.agendadosTracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Agendados de anúncios (rastreados)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    <span>{formatNumber(totals.agendadosUntracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Agendados sem rastreamento</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comparecimento</CardTitle>
            <div className="flex items-center gap-1">
              <UserCheck className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">/</span>
              <UserX className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1">
                <div className="text-lg font-bold text-green-600">{formatNumber(totals.compareceu)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(totals.compareceu, totals.agendados)}
                </p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="flex-1">
                <div className="text-lg font-bold text-red-600">{formatNumber(totals.nao_compareceu)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(totals.nao_compareceu, totals.agendados)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">{formatNumber(totals.compareceuTracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Comparecimentos de anúncios</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    <span>{formatNumber(totals.compareceuUntracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Comparecimentos sem rastreamento</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Negociação</CardTitle>
            <div className="flex items-center gap-1">
              <Megaphone className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">/</span>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.em_negociacao)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">{formatNumber(totals.emNegociacaoTracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Em negociação de anúncios</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    <span>{formatNumber(totals.emNegociacaoUntracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Em negociação sem rastreamento</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturas</CardTitle>
            <div className="flex items-center gap-1">
              <Megaphone className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">/</span>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.clientes)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <Megaphone className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">{formatNumber(totals.clientesTracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Faturas de anúncios (rastreados)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span>•</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    <span>{formatNumber(totals.clientesUntracked)}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Faturas sem rastreamento</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatPercentage(totals.clientes, totals.leads)}</div>
            <p className="text-xs text-muted-foreground">
              Lead → Fatura
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Funil por {viewLevel === "campaign" ? "Campanha" : viewLevel === "adset" ? "Conjunto" : "Anúncio"}
          </CardTitle>
          <CardDescription>
            Acompanhe a jornada dos leads desde o primeiro contato até o fechamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !funnelData || funnelData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum lead com dados de campanha encontrado no período.</p>
              <p className="text-sm mt-2">Os leads precisam ter origem de anúncios Click-to-WhatsApp para aparecer aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">
                      {viewLevel === "campaign" ? "Campanha" : viewLevel === "adset" ? "Conjunto" : "Anúncio"}
                    </TableHead>
                    <TableHead className="text-center">Gasto</TableHead>
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">CPL</TableHead>
                    <TableHead className="text-center">Agendados</TableHead>
                    <TableHead className="text-center">CPA Agend.</TableHead>
                    <TableHead className="text-center">Faltou</TableHead>
                    <TableHead className="text-center">Em Negoc.</TableHead>
                    <TableHead className="text-center">Faturas</TableHead>
                    <TableHead className="text-center">CAC</TableHead>
                    <TableHead className="text-center">Faturado</TableHead>
                    <TableHead className="text-center">ROAS</TableHead>
                    <TableHead className="text-center w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funnelData.map((row, idx) => {
                    const spend = spendByCampaign[row.campaign_name] || 0;
                    const cpl = row.leads > 0 ? spend / row.leads : 0;
                    const cpaAgendado = row.agendados > 0 ? spend / row.agendados : 0;
                    const cac = row.clientes > 0 ? spend / row.clientes : 0;
                    const roas = spend > 0 ? row.valor_fechado / spend : 0;

                    const handleRowClick = () => {
                      setSelectedFunnel({
                        campaign_name: row.campaign_name,
                        adset_name: row.adset_name,
                        ad_name: row.ad_name,
                        leads: row.leads,
                        agendados: row.agendados,
                        compareceu: row.compareceu,
                        nao_compareceu: row.nao_compareceu,
                        em_negociacao: row.em_negociacao,
                        clientes: row.clientes,
                        valor_fechado: row.valor_fechado,
                        spend,
                      });
                      setFunnelDialogOpen(true);
                    };

                    return (
                      <TableRow 
                        key={idx} 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={handleRowClick}
                      >
                        <TableCell className="font-medium">
                          <div className="max-w-[250px]">
                            <p className="truncate" title={row.campaign_name}>{row.campaign_name}</p>
                            {row.adset_name && (
                              <p className="text-xs text-muted-foreground truncate" title={row.adset_name}>
                                {row.adset_name}
                              </p>
                            )}
                            {row.ad_name && (
                              <p className="text-xs text-muted-foreground/70 truncate" title={row.ad_name}>
                                {row.ad_name}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {spend > 0 ? formatCurrency(spend) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{row.leads}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {cpl > 0 ? formatCurrency(cpl) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                            {row.agendados}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {cpaAgendado > 0 ? formatCurrency(cpaAgendado) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                            {row.nao_compareceu}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                            {row.em_negociacao}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                            {row.clientes}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {cac > 0 ? formatCurrency(cac) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium text-green-600">
                          {row.valor_fechado > 0 ? formatCurrency(row.valor_fechado) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {roas > 0 ? (
                            <Badge variant={roas >= 1 ? "default" : "destructive"}>
                              {roas.toFixed(2)}x
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ver funil visual</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Linha de totais */}
                  <TableRow className="bg-muted/50 border-t-2 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-center">{formatCurrency(totals.spend)}</TableCell>
                    <TableCell className="text-center">{totals.leads}</TableCell>
                    <TableCell className="text-center">
                      {totals.leads > 0 ? formatCurrency(totals.spend / totals.leads) : "—"}
                    </TableCell>
                    <TableCell className="text-center">{totals.agendados}</TableCell>
                    <TableCell className="text-center">
                      {totals.agendados > 0 ? formatCurrency(totals.spend / totals.agendados) : "—"}
                    </TableCell>
                    <TableCell className="text-center">{totals.nao_compareceu}</TableCell>
                    <TableCell className="text-center">{totals.em_negociacao}</TableCell>
                    <TableCell className="text-center">{totals.clientes}</TableCell>
                    <TableCell className="text-center">
                      {totals.clientes > 0 ? formatCurrency(totals.spend / totals.clientes) : "—"}
                    </TableCell>
                    <TableCell className="text-center text-green-600">
                      {formatCurrency(totals.valor_fechado)}
                    </TableCell>
                    <TableCell className="text-center">
                      {totals.spend > 0 ? `${(totals.valor_fechado / totals.spend).toFixed(2)}x` : "—"}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog do Funil Visual */}
      <FunilVisualDialog 
        open={funnelDialogOpen} 
        onOpenChange={setFunnelDialogOpen} 
        data={selectedFunnel} 
      />
    </div>
  );
}
