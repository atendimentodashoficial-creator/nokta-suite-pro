import { Users, Calendar, CheckCircle, DollarSign, TrendingUp, Target, CalendarCheck, UserCheck, UserX, Award, ShoppingBag, Package, Receipt, Loader2, Wallet, RefreshCcw, CreditCard, Megaphone, CircleDollarSign, Clock } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLeads, useLeadStats } from "@/hooks/useLeads";
import { useDespesasTotal, useDespesasRelatorio } from "@/hooks/useDespesas";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, addMonths, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useFaturas } from "@/hooks/useFaturas";
import { useAllFaturaPagamentos } from "@/hooks/useFaturaPagamentos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetaIcon } from "@/components/icons/MetaIcon";
import GoogleAdsIcon from "@/components/icons/GoogleAdsIcon";
import {
  toZonedBrasilia
} from "@/utils/timezone";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";

export default function Dashboard() {
  const { user } = useAuth();
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd } = usePeriodFilter("this_month");
  
  const { data: allLeads, isLoading: allLeadsLoading } = useLeads();
  const { data: clientes, isLoading: clientesLoading } = useLeads("cliente");
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const { data: despesasTotal, isLoading: despesasTotalLoading } = useDespesasTotal();
  const { data: despesas, isLoading: despesasLoading } = useDespesasRelatorio();
  const { data: agendamentos, isLoading: agendamentosLoading } = useAgendamentos();
  const { data: faturas, isLoading: faturasLoading } = useFaturas();
  const { data: allPagamentos } = useAllFaturaPagamentos();

  // Estado para despesas de anúncios Meta
  const [adsSpend, setAdsSpend] = useState<number>(0);
  const [adsSpendLoading, setAdsSpendLoading] = useState(false);
  const [hasAdsConfig, setHasAdsConfig] = useState(false);

  // Estado para despesas de anúncios Google Ads
  const [googleAdsSpend, setGoogleAdsSpend] = useState<number>(0);
  const [googleAdsSpendLoading, setGoogleAdsSpendLoading] = useState(false);
  const [hasGoogleAdsConfig, setHasGoogleAdsConfig] = useState(false);

  // O usePeriodFilter já gerencia as datas automaticamente

  // Filtrar dados por período
  const dadosFiltrados = useMemo(() => {
    // Normalizar as datas do filtro para início e fim do dia
    const startOfPeriod = new Date(
      dateStart.getFullYear(),
      dateStart.getMonth(),
      dateStart.getDate(),
      0, 0, 0, 0
    );
    const endOfPeriod = new Date(
      dateEnd.getFullYear(),
      dateEnd.getMonth(),
      dateEnd.getDate(),
      23, 59, 59, 999
    );

    const leads = allLeads?.filter(lead => {
      const leadDate = toZonedBrasilia(new Date(lead.created_at));
      if (leadDate < startOfPeriod) return false;
      if (leadDate > endOfPeriod) return false;
      return true;
    }) || [];

    const clientesFiltrados = clientes?.filter(cliente => {
      const clienteDate = toZonedBrasilia(new Date(cliente.created_at));
      if (clienteDate < startOfPeriod) return false;
      if (clienteDate > endOfPeriod) return false;
      return true;
    }) || [];

    const fats = faturas?.filter(fat => {
      // Usar data_fatura se preenchida, senão fallback para created_at
      // Para data_fatura (campo date YYYY-MM-DD), criar data no timezone local
      let fatDate: Date;
      if (fat.data_fatura) {
        // Se for data pura (YYYY-MM-DD), criar no timezone local
        if (/^\d{4}-\d{2}-\d{2}$/.test(fat.data_fatura)) {
          const [year, month, day] = fat.data_fatura.split('-').map(Number);
          fatDate = new Date(year, month - 1, day, 12, 0, 0, 0); // Meio-dia local
        } else {
          fatDate = new Date(fat.data_fatura);
        }
      } else {
        fatDate = new Date(fat.created_at);
      }
      if (fatDate < startOfPeriod) return false;
      if (fatDate > endOfPeriod) return false;
      return true;
    }) || [];

    // Criar set de IDs de leads não-excluídos (allLeads já filtra deleted_at)
    // Precisamos usar allLeads + clientes pois ambos são leads válidos
    const leadsNaoExcluidosIds = new Set<string>();
    allLeads?.forEach(l => leadsNaoExcluidosIds.add(l.id));
    clientes?.forEach(l => leadsNaoExcluidosIds.add(l.id));

    // IDs de agendamentos que têm fatura vinculada
    // IMPORTANTE: este vínculo NÃO pode depender do filtro de período, senão um agendamento registrado hoje
    // pode sumir do relatório se a fatura estiver com data_fatura em outro dia.
    const agendamentoIdsComFatura = new Set<string>();
    (faturas || []).forEach((f: any) => {
      if (f.status !== "negociacao" && f.status !== "fechado") return;
      (f.fatura_agendamentos || []).forEach((fa: any) => {
        if (fa.agendamento_id) agendamentoIdsComFatura.add(fa.agendamento_id);
      });
    });

    // Função para verificar se agendamento é visível no app (usada para métricas detalhadas)
    const isAgendamentoVisivel = (ag: any) => {
      // Ignorar agendamentos de leads excluídos
      if (!leadsNaoExcluidosIds.has(ag.cliente_id)) return false;
      return true;
    };

    // Filtrar agendamentos REGISTRADOS por created_at (quando o agendamento foi criado)
    // Isso mostra quantos agendamentos foram feitos no período, independente da data da consulta
    const agendsRegistrados = agendamentos?.filter(ag => {
      if (!isAgendamentoVisivel(ag)) return false;
      const createdDate = toZonedBrasilia(new Date(ag.created_at));
      if (createdDate < startOfPeriod) return false;
      if (createdDate > endOfPeriod) return false;
      return true;
    }) || [];

    // Filtrar agendamentos por data_agendamento (quando foi REALIZADO/marcado para acontecer)
    const agendsRealizados = agendamentos?.filter(ag => {
      if (!isAgendamentoVisivel(ag)) return false;
      const agDate = toZonedBrasilia(new Date(ag.data_agendamento));
      if (agDate < startOfPeriod) return false;
      if (agDate > endOfPeriod) return false;
      return true;
    }) || [];

    // Helper function to calculate expense occurrences in period
    const calcularOcorrenciasDespesa = (d: typeof despesas extends (infer T)[] | undefined ? T : never): number => {
      if (d.recorrente) {
        // For recurring: count how many months overlap
        const dataInicioStr = d.data_despesa || d.created_at;
        if (!dataInicioStr) return 0;
        
        let dataInicio: Date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataInicioStr)) {
          const [year, month, day] = dataInicioStr.split('-').map(Number);
          dataInicio = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataInicio = new Date(dataInicioStr);
        }
        
        let dataFim: Date | null = null;
        if (d.data_fim) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_fim)) {
            const [year, month, day] = d.data_fim.split('-').map(Number);
            dataFim = new Date(year, month - 1, day, 12, 0, 0, 0);
          } else {
            dataFim = new Date(d.data_fim);
          }
        }
        
        // Effective start is the later of despesa start or period start
        const effectiveStart = isBefore(dataInicio, startOfPeriod) ? startOfPeriod : dataInicio;
        // Effective end is the earlier of despesa end (or period end if no end) and period end
        const effectiveEnd = dataFim && isBefore(dataFim, endOfPeriod) ? dataFim : endOfPeriod;
        
        if (isBefore(effectiveEnd, effectiveStart)) return 0;
        
        // Count months between effective start and end (inclusive)
        let count = 0;
        let currentMonth = startOfMonth(effectiveStart);
        const lastMonth = startOfMonth(effectiveEnd);
        
        while (!isAfter(currentMonth, lastMonth)) {
          count++;
          currentMonth = addMonths(currentMonth, 1);
        }
        
        return count;
      } else if (d.parcelada && d.data_inicio && d.data_fim) {
        // For installments: count how many installments fall within period
        let dataInicio: Date;
        let dataFim: Date;
        
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_inicio)) {
          const [year, month, day] = d.data_inicio.split('-').map(Number);
          dataInicio = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataInicio = new Date(d.data_inicio);
        }
        
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_fim)) {
          const [year, month, day] = d.data_fim.split('-').map(Number);
          dataFim = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataFim = new Date(d.data_fim);
        }
        
        // Effective start is the later of despesa start or period start
        const effectiveStart = isBefore(dataInicio, startOfPeriod) ? startOfPeriod : dataInicio;
        // Effective end is the earlier of despesa end and period end
        const effectiveEnd = isBefore(dataFim, endOfPeriod) ? dataFim : endOfPeriod;
        
        if (isBefore(effectiveEnd, effectiveStart)) return 0;
        
        // Count months between effective start and end (inclusive)
        let count = 0;
        let currentMonth = startOfMonth(effectiveStart);
        const lastMonth = startOfMonth(effectiveEnd);
        
        while (!isAfter(currentMonth, lastMonth)) {
          count++;
          currentMonth = addMonths(currentMonth, 1);
        }
        
        return count;
      }
      
      // For single expenses, always 1
      return 1;
    };

    // Filtrar despesas por período com cálculo de ocorrências
    const despesasFiltradas = despesas?.map(d => {
      const ocorrencias = calcularOcorrenciasDespesa(d);
      return { ...d, ocorrencias };
    }).filter(d => {
      // Filter out items with no occurrences
      if (d.ocorrencias === 0) return false;
      
      // For recurring expenses, check if they overlap with period
      if (d.recorrente) {
        const dataInicioStr = d.data_despesa || d.created_at;
        if (!dataInicioStr) return false;
        
        let dataInicio: Date;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataInicioStr)) {
          const [year, month, day] = dataInicioStr.split('-').map(Number);
          dataInicio = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataInicio = new Date(dataInicioStr);
        }
        
        // Check if started before period end
        if (dataInicio > endOfPeriod) return false;
        
        // Check if ended before period start
        if (d.data_fim) {
          let dataFim: Date;
          if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_fim)) {
            const [year, month, day] = d.data_fim.split('-').map(Number);
            dataFim = new Date(year, month - 1, day, 12, 0, 0, 0);
          } else {
            dataFim = new Date(d.data_fim);
          }
          if (dataFim < startOfPeriod) return false;
        }
        
        return true;
      }
      
      // For installments, check if they overlap with period
      if (d.parcelada && d.data_inicio && d.data_fim) {
        let dataInicio: Date;
        let dataFim: Date;
        
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_inicio)) {
          const [year, month, day] = d.data_inicio.split('-').map(Number);
          dataInicio = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataInicio = new Date(d.data_inicio);
        }
        
        if (/^\d{4}-\d{2}-\d{2}$/.test(d.data_fim)) {
          const [year, month, day] = d.data_fim.split('-').map(Number);
          dataFim = new Date(year, month - 1, day, 12, 0, 0, 0);
        } else {
          dataFim = new Date(d.data_fim);
        }
        
        // Check if overlaps with period
        if (dataFim < startOfPeriod || dataInicio > endOfPeriod) return false;
        return true;
      }
      
      // For variable/single expenses, use original logic
      const despesaDateStr = d.data_despesa || d.data_inicio || d.created_at;
      if (!despesaDateStr) return false;
      
      let despesaDate: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(despesaDateStr)) {
        const [year, month, day] = despesaDateStr.split('-').map(Number);
        despesaDate = new Date(year, month - 1, day, 12, 0, 0, 0);
      } else {
        despesaDate = new Date(despesaDateStr);
      }
      
      if (despesaDate < startOfPeriod) return false;
      if (despesaDate > endOfPeriod) return false;
      return true;
    }) || [];

    return { 
      leads, 
      clientes: clientesFiltrados, 
      agendamentos: agendsRegistrados, 
      agendamentosRealizados: agendsRealizados, 
      faturas: fats,
      despesas: despesasFiltradas
    };
  }, [allLeads, clientes, agendamentos, faturas, despesas, dateStart, dateEnd]);

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
        const dateStartStr = format(dateStart, "yyyy-MM-dd");
        const dateEndStr = format(dateEnd, "yyyy-MM-dd");

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
  }, [user, dateStart, dateEnd]);

  // Buscar gasto de anúncios Google Ads do período
  useEffect(() => {
    const fetchGoogleAdsSpend = async () => {
      if (!user) return;

      try {
        // Verificar se tem configuração Google Ads
        const { data: configData } = await supabase
          .from("google_ads_config")
          .select("id, is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!configData?.is_active) {
          setHasGoogleAdsConfig(false);
          return;
        }

        // Verificar se tem contas vinculadas
        const { data: accountsData } = await supabase
          .from("google_ads_accounts")
          .select("customer_id")
          .eq("user_id", user.id);

        if (!accountsData || accountsData.length === 0) {
          setHasGoogleAdsConfig(false);
          return;
        }

        setHasGoogleAdsConfig(true);
        setGoogleAdsSpendLoading(true);

        // Buscar gasto de todas as contas
        const dateStartStr = format(dateStart, "yyyy-MM-dd");
        const dateEndStr = format(dateEnd, "yyyy-MM-dd");

        let totalSpend = 0;

        for (const account of accountsData) {
          try {
            const { data: session } = await supabase.auth.getSession();
            const response = await supabase.functions.invoke("google-ads-api", {
              body: {
                action: "get_campaign_metrics",
                customer_id: account.customer_id,
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
            console.error("Error fetching Google Ads spend for account:", account.customer_id, err);
          }
        }

        setGoogleAdsSpend(totalSpend);
      } catch (error) {
        console.error("Error fetching Google Ads config:", error);
      } finally {
        setGoogleAdsSpendLoading(false);
      }
    };

    fetchGoogleAdsSpend();
  }, [user, dateStart, dateEnd]);

  // Calcular métricas
  // LEADS (igual à aba Leads): contar leads gerados no período, deduplicados (useLeads já vem deduplicado)

  const isWhatsAppOrigin = (origem: string | null | undefined) => {
    const o = (origem || "").toLowerCase();
    return o === "" || o === "whatsapp";
  };

  const isDisparosOrigin = (origem: string | null | undefined) => {
    return (origem || "").toLowerCase() === "disparos";
  };

  // Leads separados por origem (gerados no período)
  const leadsWhatsApp = dadosFiltrados.leads.filter((l) => isWhatsAppOrigin(l.origem)).length;
  const leadsDisparos = dadosFiltrados.leads.filter((l) => isDisparosOrigin(l.origem)).length;

  // Mantém a métrica auxiliar (não exibida nos cards atuais) caso seja usada futuramente
  const clientesComAgendamento = new Set(dadosFiltrados.agendamentos.map((a) => a.cliente_id));
  const leadsAtuais = dadosFiltrados.leads.filter((l) => l.status === "lead" && !clientesComAgendamento.has(l.id)).length;

  const leadsFollowUp = dadosFiltrados.leads.filter(l => l.status === "follow_up").length;

  // Total de clientes no período = clientes únicos com agendamento no período,
  // excluindo quem já era cliente (status "cliente") antes do início do período
  const clienteIdsNoPeriodo = new Set<string>();
  const clientesJaExistentes = new Set<string>();
  
  // Identificar clientes que já tinham status "cliente" antes do período
  const periodStart = toZonedBrasilia(dateStart);
  periodStart.setHours(0, 0, 0, 0);
  clientes?.forEach(c => {
    const clienteDate = toZonedBrasilia(new Date(c.created_at));
    if (clienteDate < periodStart) {
      clientesJaExistentes.add(c.id);
    }
  });
  
  // Contar clientes únicos dos agendamentos do período, excluindo os já existentes
  dadosFiltrados.agendamentos.forEach((ag: any) => {
    if (ag.cliente_id && !clientesJaExistentes.has(ag.cliente_id)) {
      clienteIdsNoPeriodo.add(ag.cliente_id);
    }
  });
  const totalClientes = clienteIdsNoPeriodo.size;
  
  // AGENDAMENTOS
  // 
  // "Agendamentos Registrados" = Total de agendamentos CRIADOS no período (created_at)
  // "Agendamentos Realizados" = Total de agendamentos MARCADOS para o período (data_agendamento)
  // Detalhamento:
  // - Compareceu = agendamentos com fatura vinculada (cliente fechou/está negociando)
  // - Não Compareceu = status "cancelado" sem fatura
  
  // Identificar agendamentos que têm fatura vinculada (para ambos os cálculos)
  const agendamentoIdsComFatura = new Set(
    (dadosFiltrados.faturas || []).flatMap((f: any) =>
      (f.fatura_agendamentos || []).map((fa: any) => fa.agendamento_id)
    )
  );

  // === AGENDAMENTOS REGISTRADOS (por created_at) ===
  const numeroAgendamentosRegistrados = dadosFiltrados.agendamentos.length;
  
  const agendamentosRegistradosCompareceu = dadosFiltrados.agendamentos.filter((a: any) =>
    agendamentoIdsComFatura.has(a.id)
  ).length;
  
  // "% Não Compareceu" = cancelados com data_agendamento no período (mesma lógica da aba)
  const agendamentosRegistradosNaoCompareceu = dadosFiltrados.agendamentosRealizados.filter(
    (a: any) => a.status === "cancelado"
  ).length;

  // === AGENDAMENTOS REALIZADOS = faturas (fechadas + negociação) + retornos no período ===
  const faturasFechadasCount = dadosFiltrados.faturas.filter(f => f.status === "fechado").length;
  const faturasNegociacaoCount = dadosFiltrados.faturas.filter(f => f.status === "negociacao").length;
  const retornosCount = dadosFiltrados.agendamentos.filter((a: any) => a.retorno_fatura_id).length;
  const numeroAgendamentosRealizados = faturasFechadasCount + faturasNegociacaoCount + retornosCount;

  // Agendamentos registrados (created_at) no período mas com data_agendamento fora do período
  const agendamentosParaOutroMes = dadosFiltrados.agendamentos.filter((ag: any) => {
    const agDate = toZonedBrasilia(new Date(ag.data_agendamento));
    const startOfPeriod = new Date(dateStart.getFullYear(), dateStart.getMonth(), dateStart.getDate(), 0, 0, 0, 0);
    const endOfPeriod = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), dateEnd.getDate(), 23, 59, 59, 999);
    return agDate > endOfPeriod || agDate < startOfPeriod;
  }).length;

  // Faturas realizadas no período mas cujos agendamentos são de outro período
  const startOfPeriodFat = new Date(dateStart.getFullYear(), dateStart.getMonth(), dateStart.getDate(), 0, 0, 0, 0);
  const endOfPeriodFat = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), dateEnd.getDate(), 23, 59, 59, 999);
  const faturasDeAgendamentosOutroPeriodo = dadosFiltrados.faturas
    .filter((f: any) => f.status === "fechado" || f.status === "negociacao")
    .filter((fat: any) => {
      const agendamentos = fat.fatura_agendamentos || [];
      if (agendamentos.length === 0) return false;
      return agendamentos.some((fa: any) => {
        if (!fa.agendamentos?.data_agendamento) return false;
        const agDate = toZonedBrasilia(new Date(fa.agendamentos.data_agendamento));
        return agDate < startOfPeriodFat || agDate > endOfPeriodFat;
      });
    }).length;

  // Variáveis legadas para compatibilidade com outras partes do código
  const numeroAgendamentos = numeroAgendamentosRegistrados;
  const agendamentosRealizados = agendamentosRegistradosCompareceu;
  const agendamentosNaoCompareceu = agendamentosRegistradosNaoCompareceu;
  
  // RECEITAS
  const receitaAtual = dadosFiltrados.faturas.filter(f => f.status === "fechado").reduce((sum, f) => sum + Number(f.valor), 0);
  const faturasFechadas = dadosFiltrados.faturas.filter(f => f.status === "fechado").length;
  const faturasEmNegociacao = dadosFiltrados.faturas.filter(f => f.status === "negociacao");
  const receitaEmNegociacao = faturasEmNegociacao.reduce((sum, f) => sum + Number(f.valor), 0);
  // Receita prevista = Fechadas + Negociação
  const receitaPrevista = receitaAtual + receitaEmNegociacao;

  // Pagamentos parciais - calcular total pago e pendente
  const totalPagoParciaisAll = useMemo(() => {
    if (!allPagamentos) return { pago: 0, pendente: 0 };
    const faturasFechadasIds = new Set(dadosFiltrados.faturas.filter(f => f.status === "fechado").map(f => f.id));
    let totalPago = 0;
    let totalValorFaturas = 0;
    dadosFiltrados.faturas.filter(f => f.status === "fechado").forEach(f => {
      totalValorFaturas += Number(f.valor);
      const pagamentos = allPagamentos[f.id] || [];
      totalPago += pagamentos.reduce((s, p) => s + Number(p.valor), 0);
    });
    return { pago: totalPago, pendente: Math.max(totalValorFaturas - totalPago, 0) };
  }, [dadosFiltrados.faturas, allPagamentos]);

  // DESPESAS (considerando ocorrências para recorrentes e parceladas)
  const despesasRecorrentes = dadosFiltrados.despesas.filter(d => d.recorrente);
  const despesasParceladas = dadosFiltrados.despesas.filter(d => d.parcelada);
  const despesasVariaveis = dadosFiltrados.despesas.filter(d => !d.recorrente && !d.parcelada);
  
  // Calcular totais considerando ocorrências
  const calcularValorComOcorrencias = (d: typeof dadosFiltrados.despesas[0]) => {
    const ocorrencias = d.ocorrencias || 1;
    return (d.recorrente || d.parcelada) ? Number(d.valor) * ocorrencias : Number(d.valor);
  };
  
  const totalDespesasPeriodo = dadosFiltrados.despesas.reduce((sum, d) => sum + calcularValorComOcorrencias(d), 0);
  const totalRecorrentes = despesasRecorrentes.reduce((sum, d) => sum + calcularValorComOcorrencias(d), 0);
  const totalParceladas = despesasParceladas.reduce((sum, d) => sum + calcularValorComOcorrencias(d), 0);
  const totalVariaveis = despesasVariaveis.reduce((sum, d) => sum + Number(d.valor), 0);

  // Despesas por categoria (considerando ocorrências)
  const despesasPorCategoria = useMemo(() => {
    const catMap: Record<string, { nome: string; cor: string | null; total: number; quantidade: number }> = {};
    
    dadosFiltrados.despesas.forEach(d => {
      const catId = d.categoria_id || "sem-categoria";
      const catNome = d.categorias_despesas?.nome || "Sem Categoria";
      const catCor = d.categorias_despesas?.cor || null;
      const valorComOcorrencias = calcularValorComOcorrencias(d);
      const ocorrencias = d.ocorrencias || 1;
      
      if (!catMap[catId]) {
        catMap[catId] = { nome: catNome, cor: catCor, total: 0, quantidade: 0 };
      }
      catMap[catId].total += valorComOcorrencias;
      catMap[catId].quantidade += ocorrencias;
    });
    
    return Object.values(catMap).sort((a, b) => b.total - a.total);
  }, [dadosFiltrados.despesas]);

  // Lucro líquido do período (considera Meta + Google Ads)
  const totalAdsSpend = adsSpend + googleAdsSpend;
  const lucroLiquidoPeriodo = receitaAtual - totalDespesasPeriodo - totalAdsSpend;

  // Desempenho por profissional
  const desempenhoProfissionais = useMemo(() => {
    const profMap: Record<string, { nome: string; agendamentos: number; realizados: number; faturas: number; valorTotal: number }> = {};

    const ensureProf = (profId: string, profNome: string) => {
      if (!profMap[profId]) {
        profMap[profId] = { nome: profNome, agendamentos: 0, realizados: 0, faturas: 0, valorTotal: 0 };
      }
    };

    // Agendamentos por profissional: contar TODOS do período
    dadosFiltrados.agendamentos.forEach((ag: any) => {
      const profId = ag.profissional_id || "sem-profissional";
      const profNome = (ag.profissionais as any)?.nome || "Sem Profissional";
      ensureProf(profId, profNome);
      profMap[profId].agendamentos++;
    });

    // Faturas (fechadas + negociação) por profissional
    dadosFiltrados.faturas
      .filter((f: any) => f.status === "fechado" || f.status === "negociacao")
      .forEach((fat: any) => {
        const profId = fat.profissional_id || "sem-profissional";
        const profNome = (fat.profissionais as any)?.nome || profMap[profId]?.nome || "Sem Profissional";
        ensureProf(profId, profNome);

        profMap[profId].realizados++;
        if (fat.status === "fechado") {
          profMap[profId].faturas++;
          profMap[profId].valorTotal += Number(fat.valor);
        }
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

    // Agendamentos por procedimento: contar TODOS do período
    dadosFiltrados.agendamentos.forEach((ag: any) => {
      const procId = ag.procedimento_id || "sem-procedimento";
      const procNome = (ag.procedimentos as any)?.nome || "Sem Procedimento";
      ensureProc(procId, procNome);
      procMap[procId].agendamentos++;
    });

    // Faturas (fechadas + negociação) por procedimento
    dadosFiltrados.faturas
      .filter((f: any) => f.status === "fechado" || f.status === "negociacao")
      .forEach((fat: any) => {
        const procId = fat.procedimento_id || "sem-procedimento";
        const procNome = (fat.procedimentos as any)?.nome || procMap[procId]?.nome || "Sem Procedimento";
        ensureProc(procId, procNome);

        procMap[procId].realizados++;
        if (fat.status === "fechado") {
          procMap[procId].faturas++;
          procMap[procId].valorTotal += Number(fat.valor);
        }
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

      {/* Filtros */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          <PeriodFilter
            showLabel
            value={periodFilter}
            onChange={setPeriodFilter}
            dateStart={dateStart}
            dateEnd={dateEnd}
            onDateStartChange={setDateStart}
            onDateEndChange={setDateEnd}
          />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Agendamentos Registrados"
                value={numeroAgendamentosRegistrados}
                change="No Período"
                changeType="neutral"
                icon={Calendar}
                extraInfo={agendamentosParaOutroMes > 0 ? `${agendamentosParaOutroMes} com consulta fora do período` : undefined}
                extraInfoType="neutral"
              />
              <StatsCard
                title="Agendamentos Realizados"
                value={numeroAgendamentosRealizados}
                change={`${faturasFechadasCount} Fechadas • ${faturasNegociacaoCount} Negociação • ${retornosCount} Retornos`}
                changeType="positive"
                icon={CalendarCheck}
              />
              <StatsCard
                title="% Não Compareceu"
                value={`${numeroAgendamentosRegistrados > 0 ? Math.round((agendamentosRegistradosNaoCompareceu / numeroAgendamentosRegistrados) * 100) : 0}%`}
                change={`${agendamentosRegistradosNaoCompareceu}/${numeroAgendamentosRegistrados}`}
                changeType={agendamentosRegistradosNaoCompareceu > 0 ? "negative" : "positive"}
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
                change={`${faturasFechadas} Faturas Fechadas`}
                changeType="positive"
                icon={DollarSign}
                gradient
              />
              <StatsCard
                title="Negociação"
                value={`R$ ${receitaEmNegociacao.toLocaleString("pt-BR")}`}
                change={`${faturasEmNegociacao.length} Faturas em Negociação`}
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
            {/* Paid vs Pending */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatsCard
                title="Recebido"
                value={`R$ ${totalPagoParciaisAll.pago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change="Pagamentos Registrados"
                changeType="positive"
                icon={CircleDollarSign}
              />
              <StatsCard
                title="Pendente"
                value={`R$ ${totalPagoParciaisAll.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change="Aguardando Pagamento"
                changeType={totalPagoParciaisAll.pendente > 0 ? "negative" : "positive"}
                icon={Clock}
              />
            </div>
          </div>

          {/* DESPESAS */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Despesas
            </h2>
            {/* Primeira linha: 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Total Despesas"
                value={`R$ ${totalDespesasPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change={`${dadosFiltrados.despesas.length} Despesas no Período`}
                changeType="negative"
                icon={Wallet}
                gradient
              />
              <StatsCard
                title="Recorrentes"
                value={`R$ ${totalRecorrentes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change={`${despesasRecorrentes.length} Despesas`}
                changeType="negative"
                icon={RefreshCcw}
              />
              <StatsCard
                title="Parceladas"
                value={`R$ ${totalParceladas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change={`${despesasParceladas.length} Despesas`}
                changeType="negative"
                icon={CreditCard}
              />
            </div>

            {/* Segunda linha: Variáveis + Anúncios */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatsCard
                title="Variáveis"
                value={`R$ ${totalVariaveis.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                change={`${despesasVariaveis.length} Despesas`}
                changeType="negative"
                icon={Receipt}
              />

              {/* Meta Ads */}
              {hasAdsConfig ? (
                <Card className="p-6 shadow-card transition-all hover:shadow-elegant animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Gasto Meta Ads</p>
                      {adsSpendLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Carregando...</span>
                        </div>
                      ) : (
                        <p className="text-3xl font-bold text-foreground">
                          R$ {adsSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <p className="text-sm font-medium text-destructive">No período</p>
                    </div>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
                      <MetaIcon className="h-6 w-6 text-primary-foreground" />
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 shadow-card transition-all hover:shadow-elegant animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Gasto Meta Ads</p>
                      <p className="text-3xl font-bold text-foreground">--</p>
                      <p className="text-sm font-medium text-muted-foreground">Configure em Métricas</p>
                    </div>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
                      <MetaIcon className="h-6 w-6 text-primary-foreground" />
                    </div>
                  </div>
                </Card>
              )}

              {/* Google Ads */}
              {hasGoogleAdsConfig ? (
                <Card className="p-6 shadow-card transition-all hover:shadow-elegant animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Gasto Google Ads</p>
                      {googleAdsSpendLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Carregando...</span>
                        </div>
                      ) : (
                        <p className="text-3xl font-bold text-foreground">
                          R$ {googleAdsSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <p className="text-sm font-medium text-destructive">No período</p>
                    </div>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary text-primary-foreground">
                      <GoogleAdsIcon size={24} />
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 shadow-card transition-all hover:shadow-elegant animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Gasto Google Ads</p>
                      <p className="text-3xl font-bold text-foreground">--</p>
                      <p className="text-sm font-medium text-muted-foreground">Configure em Métricas</p>
                    </div>
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary text-primary-foreground">
                      <GoogleAdsIcon size={24} />
                    </div>
                  </div>
                </Card>
              )}
            </div>

            {/* Lucro Líquido */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className={cn(
                "p-6 shadow-card",
                lucroLiquidoPeriodo >= 0 ? "bg-green-500/10 border-green-500/20" : "bg-destructive/10 border-destructive/20"
              )}>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center",
                    lucroLiquidoPeriodo >= 0 ? "bg-green-500/20" : "bg-destructive/20"
                  )}>
                    <TrendingUp className={cn(
                      "h-6 w-6",
                      lucroLiquidoPeriodo >= 0 ? "text-green-600" : "text-destructive"
                    )} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Lucro Líquido</p>
                    <p className={cn(
                      "text-2xl font-bold",
                      lucroLiquidoPeriodo >= 0 ? "text-green-600" : "text-destructive"
                    )}>
                      R$ {lucroLiquidoPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Receita - Despesas - Anúncios
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Despesas por Categoria */}
            {despesasPorCategoria.length > 0 && (
              <Card className="p-6 shadow-card">
                <h3 className="text-lg font-semibold mb-4">Por Categoria</h3>
                <div className="space-y-3">
                  {despesasPorCategoria.map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        {cat.cor && (
                          <div 
                            className="h-4 w-4 rounded-full" 
                            style={{ backgroundColor: cat.cor }}
                          />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{cat.nome}</p>
                          <p className="text-xs text-muted-foreground">{cat.quantidade} despesas</p>
                        </div>
                      </div>
                      <p className="font-bold text-destructive text-sm sm:text-base whitespace-nowrap">
                        R$ {cat.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
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
