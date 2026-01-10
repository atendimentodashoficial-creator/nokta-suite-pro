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
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
  BarChart3
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

interface FunnelData {
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  ad_id: string | null;
  leads: number;
  agendados: number;
  em_negociacao: number;
  clientes: number;
  valor_fechado: number;
}

interface SpendData {
  campaign_name: string;
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

  // Atualizar datas quando o período mudar
  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value);
    const now = new Date();
    switch (value) {
      case "last_7_days":
        setDateStart(subDays(now, 6));
        setDateEnd(now);
        break;
      case "last_30_days":
        setDateStart(subDays(now, 29));
        setDateEnd(now);
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
      case "custom":
        break;
    }
  };

  // Buscar dados do funil
  const { data: funnelData, isLoading: loadingFunnel } = useQuery({
    queryKey: ["funnel-data", user?.id, dateStart, dateEnd],
    queryFn: async () => {
      if (!user?.id) return [];

      const startDate = format(dateStart, "yyyy-MM-dd");
      const endDate = format(dateEnd, "yyyy-MM-dd");

      // Buscar leads com dados de campanha
      const { data: leads, error } = await supabase
        .from("leads")
        .select(`
          id, 
          nome, 
          status, 
          fb_campaign_name, 
          fb_adset_name, 
          fb_ad_name, 
          fb_ad_id,
          created_at,
          valor_tratamento
        `)
        .eq("user_id", user.id)
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59")
        .is("deleted_at", null);

      if (error) throw error;

      // Buscar agendamentos para contar quantos leads têm agendamentos
      const { data: agendamentos, error: agendamentosError } = await supabase
        .from("agendamentos")
        .select("cliente_id, status")
        .eq("user_id", user.id)
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");

      if (agendamentosError) throw agendamentosError;

      // Criar set de clientes com agendamento
      const clientesComAgendamento = new Set<string>();
      agendamentos?.forEach(a => {
        if (a.cliente_id) {
          clientesComAgendamento.add(a.cliente_id);
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
        .eq("status", "fechado")
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59");

      if (faturasError) throw faturasError;

      // Criar mapa de valores de faturas por cliente
      const faturaPorCliente: Record<string, number> = {};
      faturas?.forEach(f => {
        if (f.cliente_id) {
          faturaPorCliente[f.cliente_id] = (faturaPorCliente[f.cliente_id] || 0) + f.valor;
        }
      });

      // Agrupar por campanha/conjunto/anúncio
      const grouped: Record<string, FunnelData> = {};

      leads?.forEach(lead => {
        const campaignKey = lead.fb_campaign_name || "Sem campanha";
        const adsetKey = lead.fb_adset_name || "Sem conjunto";
        const adKey = lead.fb_ad_name || "Sem anúncio";
        
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
            ad_id: lead.fb_ad_id,
            leads: 0,
            agendados: 0,
            em_negociacao: 0,
            clientes: 0,
            valor_fechado: 0,
          };
        }

        grouped[key].leads++;
        
        // Verificar se o lead tem agendamento
        if (clientesComAgendamento.has(lead.id)) {
          grouped[key].agendados++;
        }
        
        // Verificar status do lead (follow_up = em negociação)
        if (lead.status === "follow_up") {
          grouped[key].em_negociacao++;
        } else if (lead.status === "cliente") {
          grouped[key].clientes++;
          // Adicionar valor da fatura se existir
          if (faturaPorCliente[lead.id]) {
            grouped[key].valor_fechado += faturaPorCliente[lead.id];
          } else if (lead.valor_tratamento) {
            grouped[key].valor_fechado += lead.valor_tratamento;
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
    if (!funnelData) return { leads: 0, agendados: 0, em_negociacao: 0, clientes: 0, valor_fechado: 0, spend: 0 };
    
    const totalSpend = Object.values(spendByCampaign).reduce((a, b) => a + b, 0);
    
    return funnelData.reduce((acc, item) => ({
      leads: acc.leads + item.leads,
      agendados: acc.agendados + item.agendados,
      em_negociacao: acc.em_negociacao + item.em_negociacao,
      clientes: acc.clientes + item.clientes,
      valor_fechado: acc.valor_fechado + item.valor_fechado,
      spend: totalSpend,
    }), { leads: 0, agendados: 0, em_negociacao: 0, clientes: 0, valor_fechado: 0, spend: totalSpend });
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
                  <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                  <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                  <SelectItem value="this_month">Este mês</SelectItem>
                  <SelectItem value="last_month">Mês passado</SelectItem>
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
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo do funil */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.leads)}</div>
            <p className="text-xs text-muted-foreground">
              CPL: {totals.leads > 0 ? formatCurrency(totals.spend / totals.leads) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agendados</CardTitle>
            <CalendarIconSolid className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.agendados)}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(totals.agendados, totals.leads)} dos leads • CPA: {totals.agendados > 0 ? formatCurrency(totals.spend / totals.agendados) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Negociação</CardTitle>
            <Handshake className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.em_negociacao)}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(totals.em_negociacao, totals.leads)} dos leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.clientes)}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(totals.clientes, totals.leads)} dos leads • CAC: {totals.clientes > 0 ? formatCurrency(totals.spend / totals.clientes) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.valor_fechado)}</div>
            <p className="text-xs text-muted-foreground">
              ROAS: {totals.spend > 0 ? `${(totals.valor_fechado / totals.spend).toFixed(2)}x` : "—"}
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
                    <TableHead className="text-center">Em Negoc.</TableHead>
                    <TableHead className="text-center">Clientes</TableHead>
                    <TableHead className="text-center">CAC</TableHead>
                    <TableHead className="text-center">Faturado</TableHead>
                    <TableHead className="text-center">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funnelData.map((row, idx) => {
                    const spend = spendByCampaign[row.campaign_name] || 0;
                    const cpl = row.leads > 0 ? spend / row.leads : 0;
                    const cpaAgendado = row.agendados > 0 ? spend / row.agendados : 0;
                    const cac = row.clientes > 0 ? spend / row.clientes : 0;
                    const roas = spend > 0 ? row.valor_fechado / spend : 0;

                    return (
                      <TableRow key={idx}>
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
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
