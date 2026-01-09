import { Users, Calendar, CheckCircle, DollarSign, TrendingUp, Target, CalendarCheck, UserCheck, UserX, Award, ShoppingBag, Package, Receipt, Loader2 } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLeads, useLeadStats } from "@/hooks/useLeads";
import { useDespesasTotal } from "@/hooks/useDespesas";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useFaturas } from "@/hooks/useFaturas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetaIcon } from "@/components/icons/MetaIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Dashboard() {
  const { user } = useAuth();
  const [periodFilter, setPeriodFilter] = useState("this_month");
  const [dataInicial, setDataInicial] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dataFinal, setDataFinal] = useState<Date | undefined>(endOfMonth(new Date()));
  
  const { data: allLeads, isLoading: allLeadsLoading } = useLeads();
  const { data: clientes, isLoading: clientesLoading } = useLeads("cliente");
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: despesasTotal, isLoading: despesasLoading } = useDespesasTotal();
  const { data: agendamentos, isLoading: agendamentosLoading } = useAgendamentos();
  const { data: faturas, isLoading: faturasLoading } = useFaturas();

  // Estado para despesas de anúncios
  const [adsSpend, setAdsSpend] = useState<number>(0);
  const [adsSpendLoading, setAdsSpendLoading] = useState(false);
  const [hasAdsConfig, setHasAdsConfig] = useState(false);

  // Atualizar datas quando o período mudar
  useEffect(() => {
    const now = new Date();
    switch (periodFilter) {
      case "today":
        setDataInicial(startOfDay(now));
        setDataFinal(endOfDay(now));
        break;
      case "yesterday":
        const yesterday = subDays(now, 1);
        setDataInicial(startOfDay(yesterday));
        setDataFinal(endOfDay(yesterday));
        break;
      case "last_7_days":
        setDataInicial(startOfDay(subDays(now, 6)));
        setDataFinal(endOfDay(now));
        break;
      case "last_30_days":
        setDataInicial(startOfDay(subDays(now, 29)));
        setDataFinal(endOfDay(now));
        break;
      case "this_week":
        setDataInicial(startOfWeek(now, { weekStartsOn: 0 }));
        setDataFinal(endOfWeek(now, { weekStartsOn: 0 }));
        break;
      case "last_week":
        const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 0 });
        setDataInicial(lastWeekStart);
        setDataFinal(endOfWeek(lastWeekStart, { weekStartsOn: 0 }));
        break;
      case "this_month":
        setDataInicial(startOfMonth(now));
        setDataFinal(endOfMonth(now));
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDataInicial(startOfMonth(lastMonth));
        setDataFinal(endOfMonth(lastMonth));
        break;
      case "custom":
        break;
    }
  }, [periodFilter]);

  // Filtrar dados por período
  const dadosFiltrados = useMemo(() => {
    const leads = allLeads?.filter(lead => {
      if (!dataInicial && !dataFinal) return true;
      const leadDate = new Date(lead.created_at);
      if (dataInicial && leadDate < dataInicial) return false;
      if (dataFinal && leadDate > dataFinal) return false;
      return true;
    }) || [];

    const clientesFiltrados = clientes?.filter(cliente => {
      if (!dataInicial && !dataFinal) return true;
      const clienteDate = new Date(cliente.created_at);
      if (dataInicial && clienteDate < dataInicial) return false;
      if (dataFinal && clienteDate > dataFinal) return false;
      return true;
    }) || [];

    const agends = agendamentos?.filter(ag => {
      if (!dataInicial && !dataFinal) return true;
      const agDate = new Date(ag.data_agendamento);
      if (dataInicial && agDate < dataInicial) return false;
      if (dataFinal && agDate > dataFinal) return false;
      return true;
    }) || [];

    const fats = faturas?.filter(fat => {
      if (!dataInicial && !dataFinal) return true;
      const fatDate = new Date(fat.created_at);
      if (dataInicial && fatDate < dataInicial) return false;
      if (dataFinal && fatDate > dataFinal) return false;
      return true;
    }) || [];

    return { leads, clientes: clientesFiltrados, agendamentos: agends, faturas: fats };
  }, [allLeads, clientes, agendamentos, faturas, dataInicial, dataFinal]);

  // Buscar gasto de anúncios do período
  useEffect(() => {
    const fetchAdsSpend = async () => {
      if (!user) return;

      try {
        // Verificar se tem token configurado
        const { data: configData } = await supabase
          .from("facebook_config")
          .select("access_token")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!configData?.access_token) {
          setHasAdsConfig(false);
          return;
        }

        // Verificar se tem contas vinculadas
        const { data: accountsData } = await supabase
          .from("facebook_ad_accounts")
          .select("ad_account_id")
          .eq("user_id", user.id);

        if (!accountsData || accountsData.length === 0) {
          setHasAdsConfig(false);
          return;
        }

        setHasAdsConfig(true);
        setAdsSpendLoading(true);

        // Buscar gasto de todas as contas
        const dateStartStr = dataInicial ? format(dataInicial, "yyyy-MM-dd") : format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
        const dateEndStr = dataFinal ? format(dataFinal, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

        let totalSpend = 0;

        for (const account of accountsData) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const response = await supabase.functions.invoke("facebook-ads-api", {
              body: {
                action: "get_campaign_metrics",
                ad_account_id: account.ad_account_id,
                date_start: dateStartStr,
                date_end: dateEndStr,
              },
              headers: {
                Authorization: `Bearer ${session.session?.access_token}`,
              },
            });

            if (response.data?.success && response.data?.campaigns) {
              const accountSpend = response.data.campaigns.reduce(
                (sum: number, c: { spend: number }) => sum + (c.spend || 0),
                0
              );
              totalSpend += accountSpend;
            }
          } catch (err) {
            console.error("Error fetching ads spend for account:", account.ad_account_id, err);
          }
        }

        setAdsSpend(totalSpend);
      } catch (error) {
        console.error("Error fetching ads config:", error);
      } finally {
        setAdsSpendLoading(false);
      }
    };

    fetchAdsSpend();
  }, [user, dataInicial, dataFinal]);

  // Calcular métricas
  // LEADS: considerar conversão como "teve ao menos 1 agendamento"
  const clientesComAgendamento = new Set(dadosFiltrados.agendamentos.map(a => a.cliente_id));

  // Leads atuais = ainda em status "lead" e ainda sem agendamento
  const leadsAtuais = dadosFiltrados.leads.filter(l => l.status === "lead" && !clientesComAgendamento.has(l.id)).length;

  // Leads separados por origem
  const leadsWhatsApp = dadosFiltrados.leads.filter(l => 
    l.status === "lead" && 
    !clientesComAgendamento.has(l.id) && 
    (l.origem === "WhatsApp" || !l.origem)
  ).length;
  
  const leadsDisparos = dadosFiltrados.leads.filter(l => 
    l.status === "lead" && 
    !clientesComAgendamento.has(l.id) && 
    l.origem === "Disparos"
  ).length;

  const leadsFollowUp = dadosFiltrados.leads.filter(l => l.status === "follow_up").length;

  // Total de clientes no período
  const totalClientes = dadosFiltrados.clientes.length;
  
  // AGENDAMENTOS
  // Observação: na Agenda, o fluxo de "Compareceu" passa por criar fatura.
  // Para as métricas de Relatórios, consideramos "realizado" apenas quando existe fatura vinculada ao agendamento.
  const agendamentoIdsComFatura = new Set(
    (dadosFiltrados.faturas || []).flatMap((f: any) =>
      (f.fatura_agendamentos || []).map((fa: any) => fa.agendamento_id)
    )
  );

  const agendamentosComFatura = dadosFiltrados.agendamentos.filter((a: any) =>
    agendamentoIdsComFatura.has(a.id)
  );

  const agendamentosNaoCompareceu = dadosFiltrados.agendamentos.filter((a: any) => a.status === "cancelado").length;
  const agendamentosRealizados = agendamentosComFatura.length;
  const numeroAgendamentos = agendamentosRealizados + agendamentosNaoCompareceu;

  const percentualComparecimento = numeroAgendamentos > 0
    ? Math.round((agendamentosRealizados / numeroAgendamentos) * 100)
    : 0;
  // RECEITAS
  // RECEITAS
  const receitaAtual = dadosFiltrados.faturas.filter(f => f.status === "fechado").reduce((sum, f) => sum + Number(f.valor), 0);
  const faturasFechadas = dadosFiltrados.faturas.filter(f => f.status === "fechado").length;
  const faturasEmNegociacao = dadosFiltrados.faturas.filter(f => f.status === "negociacao");
  const receitaEmNegociacao = faturasEmNegociacao.reduce((sum, f) => sum + Number(f.valor), 0);
  // Receita prevista = Fechadas + Em Negociação
  const receitaPrevista = receitaAtual + receitaEmNegociacao;

  // Desempenho por profissional
  const desempenhoProfissionais = useMemo(() => {
    const profMap: Record<string, { nome: string; agendamentos: number; realizados: number; faturas: number; valorTotal: number }> = {};

    const ensureProf = (profId: string, profNome: string) => {
      if (!profMap[profId]) {
        profMap[profId] = { nome: profNome, agendamentos: 0, realizados: 0, faturas: 0, valorTotal: 0 };
      }
    };

    // Agendamentos: contar realizados apenas quando existe fatura vinculada (mesma regra dos cards)
    dadosFiltrados.agendamentos.forEach((ag: any) => {
      const profId = ag.profissional_id || "sem-profissional";
      const profNome = (ag.profissionais as any)?.nome || "Sem Profissional";
      ensureProf(profId, profNome);

      // aqui tratamos apenas itens concluídos (compareceu + não compareceu)
      if (ag.status === "cancelado" || agendamentoIdsComFatura.has(ag.id)) {
        profMap[profId].agendamentos++;
      }

      if (agendamentoIdsComFatura.has(ag.id)) {
        profMap[profId].realizados++;
      }
    });

    // Faturas fechadas por profissional
    dadosFiltrados.faturas
      .filter((f: any) => f.status === "fechado")
      .forEach((fat: any) => {
        const profId = fat.profissional_id || "sem-profissional";
        const profNome = (fat.profissionais as any)?.nome || profMap[profId]?.nome || "Sem Profissional";
        ensureProf(profId, profNome);

        profMap[profId].faturas++;
        profMap[profId].valorTotal += Number(fat.valor);
      });

    return Object.values(profMap);
  }, [dadosFiltrados, agendamentoIdsComFatura]);

  // Desempenho por procedimento
  const desempenhoProcedimentos = useMemo(() => {
    const procMap: Record<string, { nome: string; agendamentos: number; realizados: number; faturas: number; valorTotal: number }> = {};

    const ensureProc = (procId: string, procNome: string) => {
      if (!procMap[procId]) {
        procMap[procId] = { nome: procNome, agendamentos: 0, realizados: 0, faturas: 0, valorTotal: 0 };
      }
    };

    dadosFiltrados.agendamentos.forEach((ag: any) => {
      const procId = ag.procedimento_id || "sem-procedimento";
      const procNome = (ag.procedimentos as any)?.nome || "Sem Procedimento";
      ensureProc(procId, procNome);

      if (ag.status === "cancelado" || agendamentoIdsComFatura.has(ag.id)) {
        procMap[procId].agendamentos++;
      }

      if (agendamentoIdsComFatura.has(ag.id)) {
        procMap[procId].realizados++;
      }
    });

    dadosFiltrados.faturas
      .filter((f: any) => f.status === "fechado")
      .forEach((fat: any) => {
        const procId = fat.procedimento_id || "sem-procedimento";
        const procNome = (fat.procedimentos as any)?.nome || procMap[procId]?.nome || "Sem Procedimento";
        ensureProc(procId, procNome);

        procMap[procId].faturas++;
        procMap[procId].valorTotal += Number(fat.valor);
      });

    return Object.values(procMap);
  }, [dadosFiltrados, agendamentoIdsComFatura]);

  // Desempenho de Produtos (upsells)
  const desempenhoProdutos = useMemo(() => {
    const prodMap: Record<string, { nome: string; quantidade: number; valorTotal: number }> = {};
    
    dadosFiltrados.faturas.filter(f => f.status === "fechado").forEach(fat => {
      const upsells = (fat as any).fatura_upsells || [];
      upsells.forEach((upsell: any) => {
        if (upsell.tipo === "produto") {
          const prodId = upsell.produto_id || upsell.descricao;
          if (!prodMap[prodId]) {
            prodMap[prodId] = { nome: upsell.descricao, quantidade: 0, valorTotal: 0 };
          }
          prodMap[prodId].quantidade++;
          prodMap[prodId].valorTotal += Number(upsell.valor);
        }
      });
    });

    return Object.values(prodMap).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [dadosFiltrados]);

  // Totais de produtos
  const totalProdutosVendidos = desempenhoProdutos.reduce((sum, p) => sum + p.quantidade, 0);
  const receitaProdutos = desempenhoProdutos.reduce((sum, p) => sum + p.valorTotal, 0);

  const lucroLiquido = stats && despesasTotal ? stats.receitaTotal - despesasTotal : 0;
  const margemLucro = stats?.receitaTotal ? Math.round((lucroLiquido / stats.receitaTotal) * 100) : 0;

  const statusLabels: Record<string, string> = {
    lead: "Novo Lead",
    follow_up: "Follow-up",
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Relatórios</h1>
        </div>
      </div>

      {/* Filtros de Data */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <span className="text-sm font-medium">Período:</span>
          
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Selecione o período" />
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
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {periodFilter === "custom" && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full md:w-auto justify-start text-left font-normal",
                      !dataInicial && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataInicial ? format(dataInicial, "dd/MM/yyyy", { locale: ptBR }) : "Data inicial"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataInicial}
                    onSelect={setDataInicial}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground text-center md:text-left">até</span>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full md:w-auto justify-start text-left font-normal",
                      !dataFinal && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataFinal ? format(dataFinal, "dd/MM/yyyy", { locale: ptBR }) : "Data final"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dataFinal}
                    onSelect={setDataFinal}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </>
          )}

          {periodFilter !== "custom" && dataInicial && dataFinal && (
            <span className="text-sm text-muted-foreground">
              {format(dataInicial, "dd/MM/yyyy", { locale: ptBR })} - {format(dataFinal, "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
      </Card>

      {/* Métricas Segmentadas */}
      {statsLoading || despesasLoading || agendamentosLoading || faturasLoading || clientesLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* LEADS */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5" />
              Leads
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Leads WhatsApp"
                value={leadsWhatsApp}
                change="Origem WhatsApp"
                changeType="positive"
                icon={Users}
              />
              <StatsCard
                title="Leads Disparos"
                value={leadsDisparos}
                change="Origem Disparos"
                changeType="positive"
                icon={Users}
              />
              <StatsCard
                title="Clientes"
                value={totalClientes}
                change="No período"
                changeType="positive"
                icon={UserCheck}
                gradient
              />
            </div>
          </div>

          {/* AGENDAMENTOS */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck className="w-5 h-5" />
              Agendamentos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatsCard
                title="Agendamentos Realizados"
                value={numeroAgendamentos}
                change={`${agendamentosRealizados} compareceram • ${agendamentosNaoCompareceu} não compareceram`}
                changeType="positive"
                icon={CalendarCheck}
              />
              <StatsCard
                title="% Não Compareceu"
                value={`${numeroAgendamentos > 0 ? Math.round((agendamentosNaoCompareceu / numeroAgendamentos) * 100) : 0}%`}
                change={`${agendamentosNaoCompareceu}/${numeroAgendamentos}`}
                changeType={agendamentosNaoCompareceu > 0 ? "negative" : "positive"}
                icon={UserX}
                gradient
              />
            </div>
          </div>

          {/* RECEITAS */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Receitas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Receita Atual"
                value={`R$ ${receitaAtual.toLocaleString("pt-BR")}`}
                change={`${faturasFechadas} faturas fechadas`}
                changeType="positive"
                icon={DollarSign}
                gradient
              />
              <StatsCard
                title="Em Negociação"
                value={`R$ ${receitaEmNegociacao.toLocaleString("pt-BR")}`}
                change={`${faturasEmNegociacao.length} faturas`}
                changeType="positive"
                icon={Target}
              />
              <StatsCard
                title="Receita Prevista"
                value={`R$ ${receitaPrevista.toLocaleString("pt-BR")}`}
                change={`${faturasFechadas} Fechadas + ${faturasEmNegociacao.length} Negociação`}
                changeType="positive"
                icon={TrendingUp}
              />
            </div>
          </div>

          {/* DESPESAS */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Despesas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {hasAdsConfig ? (
                <Card className="p-6 shadow-card">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
                      <MetaIcon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Gasto em Anúncios</p>
                      {adsSpendLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Carregando...</span>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold text-red-600">
                          R$ {adsSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Meta Ads no período</p>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 shadow-card">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-muted">
                      <MetaIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Gasto em Anúncios</p>
                      <p className="text-sm text-muted-foreground">Configure o Meta Ads em Métricas para visualizar</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DESEMPENHO */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Award className="w-5 h-5" />
          Desempenho
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Desempenho por Profissional */}
          <Card className="p-6 shadow-card">
            <h3 className="text-lg font-semibold mb-4">Por Profissional</h3>
            {agendamentosLoading || faturasLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : desempenhoProfissionais.length > 0 ? (
              <div className="space-y-4">
                {desempenhoProfissionais.map((prof, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <h4 className="font-semibold text-foreground">{prof.nome}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Agendamentos</p>
                        <p className="text-base font-bold text-foreground">{prof.agendamentos}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Realizados</p>
                        <p className="text-base font-bold text-green-600">{prof.realizados}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Faturas</p>
                        <p className="text-base font-bold text-primary">{prof.faturas}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Valor Total</p>
                        <p className="text-base font-bold text-primary">
                          R$ {prof.valorTotal.toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            )}
          </Card>

          {/* Desempenho por Procedimento */}
          <Card className="p-6 shadow-card">
            <h3 className="text-lg font-semibold mb-4">Por Procedimento</h3>
            {agendamentosLoading || faturasLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : desempenhoProcedimentos.length > 0 ? (
              <div className="space-y-4">
                {desempenhoProcedimentos.map((proc, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <h4 className="font-semibold text-foreground">{proc.nome}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Agendamentos</p>
                        <p className="text-base font-bold text-foreground">{proc.agendamentos}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Realizados</p>
                        <p className="text-base font-bold text-green-600">{proc.realizados}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Faturas</p>
                        <p className="text-base font-bold text-primary">{proc.faturas}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Valor Total</p>
                        <p className="text-base font-bold text-primary">
                          R$ {proc.valorTotal.toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            )}
          </Card>
        </div>
      </div>

      {/* PRODUTOS VENDIDOS */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-5 h-5" />
          Produtos Vendidos
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatsCard
            title="Total de Produtos Vendidos"
            value={totalProdutosVendidos}
            change="Unidades vendidas"
            changeType="positive"
            icon={Package}
          />
          <StatsCard
            title="Receita de Produtos"
            value={`R$ ${receitaProdutos.toLocaleString("pt-BR")}`}
            change={`${desempenhoProdutos.length} produtos diferentes`}
            changeType="positive"
            icon={DollarSign}
            gradient
          />
        </div>

        <Card className="p-6 shadow-card">
          <h3 className="text-lg font-semibold mb-4">Detalhamento por Produto</h3>
          {faturasLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : desempenhoProdutos.length > 0 ? (
            <div className="space-y-3">
              {desempenhoProdutos.map((prod, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-muted/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{prod.nome}</h4>
                      <p className="text-sm text-muted-foreground">{prod.quantidade} unidade{prod.quantidade !== 1 ? 's' : ''} vendida{prod.quantidade !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      R$ {prod.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Média: R$ {(prod.valorTotal / prod.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Nenhum produto vendido no período</p>
          )}
        </Card>
      </div>
    </div>
  );
}
