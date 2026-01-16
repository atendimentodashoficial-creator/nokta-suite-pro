import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { 
  Brain, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Target,
  BarChart3,
  Layers,
  Megaphone,
  Loader2,
  Calendar,
  GitCompare,
  Clock,
  Trophy,
  ArrowRight,
  Download,
  Users,
  UserCheck,
  Handshake
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLeads } from "@/hooks/useLeads";
import { usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useFaturas } from "@/hooks/useFaturas";

interface BaseMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  cost_per_result: number;
}

interface CampaignData extends BaseMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string;
}

interface AdsetData extends BaseMetrics {
  adset_id: string;
  adset_name: string;
  status: string;
}

interface AdData extends BaseMetrics {
  ad_id: string;
  ad_name: string;
  status: string;
  thumbnail_url?: string | null;
}

interface AIReportsTabProps {
  campaigns: CampaignData[];
  selectedAccount: string;
  accountCurrency?: string | null;
}

interface ReportInsight {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
  metrics?: Record<string, string | number>;
}

interface TopPerformerItem {
  name: string;
  metric: string;
  value: string;
  spend?: number;
  campaign?: string;
  adset?: string;
}

interface TopPerformersByMetric {
  [metricKey: string]: {
    campaigns: TopPerformerItem[];
    adsets: TopPerformerItem[];
    ads: TopPerformerItem[];
  };
}

interface AIReport {
  summary: string;
  insights: ReportInsight[];
  recommendations: string[];
  score?: number;
  topPerformers?: {
    campaigns: TopPerformerItem[];
    adsets?: TopPerformerItem[];
    ads?: TopPerformerItem[];
  };
  topPerformersByMetric?: TopPerformersByMetric;
  comparison?: {
    summary: string;
    changes: Array<{
      type: "improvement" | "decline" | "neutral";
      title: string;
      description: string;
    }>;
  };
}

interface StoredReport {
  id: string;
  date_start: string;
  date_end: string;
  report: AIReport;
  campaigns_count: number;
  adsets_count: number;
  ads_count: number;
  created_at: string;
}

export function AIReportsTab({ campaigns, selectedAccount, accountCurrency }: AIReportsTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: allLeads } = useLeads();
  const { data: allAgendamentos } = useAgendamentos();
  const { data: allFaturas } = useFaturas();
  
  // Buscar TODOS os leads (incluindo clientes) para mapeamento correto de agendamentos
  const { data: allLeadsForMapping } = useQuery({
    queryKey: ["leads-all-for-funnel", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, origem, created_at, utm_campaign, fbclid, utm_source, fb_campaign_name, fb_adset_name, fb_ad_name")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
  
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [report, setReport] = useState<AIReport | null>(null);
  const [storedReport, setStoredReport] = useState<StoredReport | null>(null);
  const [previousReport, setPreviousReport] = useState<StoredReport | null>(null);
  const [checkingApiKey, setCheckingApiKey] = useState(true);
  const [loadingStoredReport, setLoadingStoredReport] = useState(true);
  
  // Period selection - use the same hook as Leads page for consistency
  // Use "max" as default to match Leads page default
  const { 
    periodFilter, 
    setPeriodFilter: setPeriodFilterHook, 
    dateStart, 
    setDateStart, 
    dateEnd, 
    setDateEnd,
    filterByPeriod 
  } = usePeriodFilter("max");
  
  // Comparison dialog
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  
  // Top performers level selection
  const [topPerformersLevel, setTopPerformersLevel] = useState<"all" | "campaigns" | "adsets" | "ads">("all");
  
  // Store ads spend data for cost per result calculations
  const [adsSpendData, setAdsSpendData] = useState<{
    adsets: AdsetData[];
    ads: AdData[];
  }>({ adsets: [], ads: [] });

  useEffect(() => {
    checkApiKeyStatus();
  }, []);

  useEffect(() => {
    if (selectedAccount && user) {
      loadStoredReport();
    }
  }, [selectedAccount, user]);

  // Note: The usePeriodFilter hook already handles period changes internally

  // Calculate funnel data for the selected period
  // Using the same logic as FunilConversaoTab for consistency
  const funnelData = useMemo(() => {
    if (!allLeads || !allLeadsForMapping) return null;

    // Use LOCAL timezone to match how dates are displayed in the UI
    // (same logic as PeriodFilter.filterByPeriod)
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

    // Helper: timestamp dentro do período
    const periodTs = (iso: string | null | undefined) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d >= startOfPeriod && d <= endOfPeriod ? d.getTime() : null;
    };

    // Helper especial para campos de data pura (sem hora) como data_fatura
    // Datas puras vêm no formato "YYYY-MM-DD" e devem ser comparadas 
    // como se fossem do timezone local (Brasília), não UTC
    const periodTsForDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return null;
      // Se for uma data pura (YYYY-MM-DD), criar a data no timezone local
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day, 12, 0, 0, 0); // Meio-dia local para evitar problemas
        if (Number.isNaN(d.getTime())) return null;
        return d >= startOfPeriod && d <= endOfPeriod ? d.getTime() : null;
      }
      // Para timestamps completos (como data_agendamento), extrair apenas a data
      // e comparar no timezone local para consistência com a UI
      const parsed = new Date(dateStr);
      if (Number.isNaN(parsed.getTime())) return null;
      // Criar data local baseada no dia que o timestamp representa em Brasília (UTC-3)
      const localDate = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        12, 0, 0, 0
      );
      return localDate >= startOfPeriod && localDate <= endOfPeriod ? localDate.getTime() : null;
    };

    // Normalize phone to last 8 digits
    const normalizePhone = (phone: string) => phone.replace(/\D/g, "").slice(-8);

    // IMPORTANTE: allLeads já vem DEDUPLICADO pelo hook useLeads (pelos últimos 8 dígitos do telefone)
    // Então usamos filterByPeriod exatamente como a aba Leads faz
    
    // Build phone -> lead mapping (allLeads já está deduplicado, mas precisamos do mapa)
    const leadsByPhone: Record<string, typeof allLeads[0]> = {};
    for (const lead of allLeads) {
      const phoneKey = normalizePhone(lead.telefone);
      leadsByPhone[phoneKey] = lead;
    }

    // Helper: check if lead is from WhatsApp (same logic as aba Leads)
    // Usa APENAS o campo 'origem' (não origem_tipo) para manter consistência
    const isWhatsAppLead = (origem: string | null) => {
      const o = (origem || "").toLowerCase();
      return o !== "disparos"; // Qualquer coisa que não seja "disparos" é WhatsApp
    };

    const isDisparosLead = (origem: string | null) => {
      const o = (origem || "").toLowerCase();
      return o === "disparos"; // Usa APENAS 'origem', não 'origem_tipo'
    };

    // USAR filterByPeriod idêntico à aba Leads (mesma lógica exata)
    // allLeads já vem DEDUPLICADO pelo hook useLeads (pelos últimos 8 dígitos do telefone)
    const leadsInPeriod = filterByPeriod(allLeads);

    // Separar leads por origem (igual à aba Leads - usa APENAS 'origem')
    const leadsWhatsApp = leadsInPeriod.filter(l => isWhatsAppLead(l.origem));
    const leadsDisparos = leadsInPeriod.filter(l => isDisparosLead(l.origem));

    // Contagem direta (igual à aba Leads)
    const phonesInPeriod = new Set<string>();
    const phonesTracked = new Set<string>();
    const phonesUntracked = new Set<string>();
    const phonesDisparos = new Set<string>();

    // Percorrer leads de WhatsApp no período
    for (const lead of leadsWhatsApp) {
      const phoneKey = normalizePhone(lead.telefone);
      phonesInPeriod.add(phoneKey);

      if (lead.utm_campaign || lead.fbclid || lead.utm_source || lead.fb_campaign_name) {
        phonesTracked.add(phoneKey);
      } else {
        phonesUntracked.add(phoneKey);
      }
    }

    // Percorrer leads de Disparos no período
    for (const lead of leadsDisparos) {
      const phoneKey = normalizePhone(lead.telefone);
      phonesDisparos.add(phoneKey);
    }

    // Build cliente_id -> phone mapping using ALL leads (including clientes)
    // Isso garante que agendamentos de clientes também sejam mapeados corretamente
    const clienteIdToPhone: Record<string, string> = {};
    for (const lead of allLeadsForMapping) {
      if (lead.id) {
        const phoneKey = normalizePhone(lead.telefone);
        clienteIdToPhone[lead.id] = phoneKey;
      }
    }
    
    // Also build leadsByPhone from allLeadsForMapping for attribution lookup
    // IMPORTANTE: Priorizar leads COM atribuição (origem = Disparos ou dados de rastreio)
    // Se existem múltiplos leads para o mesmo telefone, preferir aquele que tem dados de origem
    const leadsByPhoneAll: Record<string, typeof allLeadsForMapping[0]> = {};
    for (const lead of allLeadsForMapping) {
      const phoneKey = normalizePhone(lead.telefone);
      const existing = leadsByPhoneAll[phoneKey];
      
      if (!existing) {
        leadsByPhoneAll[phoneKey] = lead;
      } else {
        // Verificar se o novo lead tem atribuição melhor que o existente
        const existingHasAttribution = isDisparosLead(existing.origem) || existing.utm_campaign || existing.fbclid || existing.utm_source || existing.fb_campaign_name;
        const newHasAttribution = isDisparosLead(lead.origem) || lead.utm_campaign || lead.fbclid || lead.utm_source || lead.fb_campaign_name;
        
        // Se o novo tem atribuição e o existente não, usar o novo
        if (newHasAttribution && !existingHasAttribution) {
          leadsByPhoneAll[phoneKey] = lead;
        }
      }
    }

    // Create set of clientes with fatura (to validate "realizado" agendamentos)
    const clientesComFatura = new Set<string>();
    allFaturas?.forEach((f: any) => {
      if (f.cliente_id && (f.status === "negociacao" || f.status === "fechado")) {
        clientesComFatura.add(f.cliente_id);
      }
    });

    // Count agendamentos (same logic as FunilConversaoTab and Dashboard)
    // REGRA: Agendamentos "realizado" só contam se tiverem fatura vinculada
    // "Não Compareceu" = status "cancelado" sem fatura
    const phonesWithAgendamento = new Set<string>();
    const phonesWithNaoCompareceu = new Set<string>();
    const phonesWithCompareceu = new Set<string>(); // Agendamentos COM fatura vinculada
    const phonesAgendadosTracked = new Set<string>();
    const phonesAgendadosUntracked = new Set<string>();
    const phonesAgendadosDisparos = new Set<string>();
    const phonesNaoCompareceuTracked = new Set<string>();
    const phonesNaoCompareceuUntracked = new Set<string>();
    const phonesNaoCompareceuDisparos = new Set<string>();
    const phonesCompareceuAgendTracked = new Set<string>();
    const phonesCompareceuAgendUntracked = new Set<string>();
    const phonesCompareceuAgendDisparos = new Set<string>();

    // Build set of agendamento IDs with fatura
    const agendamentoIdsComFatura = new Set<string>();
    allFaturas?.forEach((f: any) => {
      if (f.fatura_agendamentos) {
        f.fatura_agendamentos.forEach((fa: any) => {
          if (fa.agendamento_id) {
            agendamentoIdsComFatura.add(fa.agendamento_id);
          }
        });
      }
    });

    allAgendamentos?.forEach((a: any) => {
      if (!a.cliente_id) return;

      // IMPORTANTE: Só contar agendamentos de leads que ainda existem (não foram excluídos)
      // Se o lead foi soft-deleted, o agendamento não está mais visível no app
      if (!clienteIdToPhone[a.cliente_id]) {
        return; // Ignorar agendamentos de leads excluídos
      }

      // IMPORTANTE: Agendamentos "realizado" só devem ser contados se tiverem fatura
      // vinculada diretamente a este agendamento específico (via fatura_agendamentos)
      // Agendamentos "realizado" sem vínculo direto não aparecem nas abas do app
      const agendamentoTemFatura = agendamentoIdsComFatura.has(a.id);
      if (a.status === "realizado" && !agendamentoTemFatura) {
        return; // Ignorar agendamentos "realizado" sem fatura vinculada diretamente
      }

      // Prefer telefone vindo do JOIN do próprio agendamento (mais robusto)
      const phone = a.leads?.telefone
        ? normalizePhone(String(a.leads.telefone))
        : clienteIdToPhone[a.cliente_id];
      if (!phone) return;

      // Attribution check - usar leadsByPhoneAll para incluir clientes
      const lead = leadsByPhoneAll[phone];
      const isDisparos = isDisparosLead(lead?.origem);
      const isTracked = !isDisparos && (lead?.utm_campaign || lead?.fbclid || lead?.utm_source || lead?.fb_campaign_name);

      // AGENDAMENTOS REGISTRADOS: usar created_at (data de criação)
      const tsCreated = periodTs(a.created_at);
      if (tsCreated !== null) {
        phonesWithAgendamento.add(phone);
        if (isDisparos) phonesAgendadosDisparos.add(phone);
        else if (isTracked) phonesAgendadosTracked.add(phone);
        else phonesAgendadosUntracked.add(phone);
      }

      // AGENDAMENTOS REALIZADOS: usar data_agendamento (data do serviço)
      // Para data_agendamento (campo date), usar periodTsForDate
      const tsAgendamento = periodTsForDate(a.data_agendamento);

      // Não Compareceu = cancelado (sem fatura = não fechou negócio após não comparecer)
      // Usar data_agendamento pois reflete quando deveria ter ocorrido
      if (a.status === "cancelado" && tsAgendamento !== null) {
        phonesWithNaoCompareceu.add(phone);
        if (isDisparos) phonesNaoCompareceuDisparos.add(phone);
        else if (isTracked) phonesNaoCompareceuTracked.add(phone);
        else phonesNaoCompareceuUntracked.add(phone);
      }

      // Compareceu (via agendamento) = has fatura linked diretamente
      // Usar data_agendamento pois reflete quando o serviço foi realizado
      if (a.status === "realizado" && agendamentoTemFatura && tsAgendamento !== null) {
        phonesWithCompareceu.add(phone);
        if (isDisparos) phonesCompareceuAgendDisparos.add(phone);
        else if (isTracked) phonesCompareceuAgendTracked.add(phone);
        else phonesCompareceuAgendUntracked.add(phone);
      }
    });

    // Count faturas (compareceu/negociação and conversão)
    const phonesCompareceu = new Set<string>();
    const phonesFechado = new Set<string>();
    const phonesCompareceuTracked = new Set<string>();
    const phonesCompareceuUntracked = new Set<string>();
    const phonesCompareceuDisparos = new Set<string>();
    const phonesFechadoTracked = new Set<string>();
    const phonesFechadoUntracked = new Set<string>();
    const phonesFechadoDisparos = new Set<string>();
    let valorTotal = 0;
    let valorTracked = 0;
    let valorUntracked = 0;
    let valorDisparos = 0;

    allFaturas?.forEach((f: any) => {
      if (!f.cliente_id) return;
      if (f.status === "cancelado" || f.status === "deletado") return;
      
      const phone = clienteIdToPhone[f.cliente_id];
      if (!phone) return;

      // Usar data_fatura se preenchida, senão fallback para created_at
      // Para data_fatura (campo date), usar periodTsForDate para tratar timezone corretamente
      const tsFatura = f.data_fatura 
        ? periodTsForDate(f.data_fatura) 
        : periodTs(f.created_at);

      const lead = leadsByPhoneAll[phone];
      const isDisparos = isDisparosLead(lead?.origem);
      const isTracked = !isDisparos && (lead?.utm_campaign || lead?.fbclid || lead?.utm_source || lead?.fb_campaign_name);

      // Negociação e Fechado usam data_fatura
      if ((f.status === "negociacao" || f.status === "fechado") && tsFatura !== null) {
        phonesCompareceu.add(phone);
        if (isDisparos) phonesCompareceuDisparos.add(phone);
        else if (isTracked) phonesCompareceuTracked.add(phone);
        else phonesCompareceuUntracked.add(phone);
      }

      // Fechado usa data_fatura
      if (f.status === "fechado" && tsFatura !== null) {
        phonesFechado.add(phone);
        valorTotal += f.valor || 0;
        
        if (isDisparos) {
          phonesFechadoDisparos.add(phone);
          valorDisparos += f.valor || 0;
        } else if (isTracked) {
          phonesFechadoTracked.add(phone);
          valorTracked += f.valor || 0;
        } else {
          phonesFechadoUntracked.add(phone);
          valorUntracked += f.valor || 0;
        }
      }
    });

    // Calculate totals - usar diretamente o tamanho do array filtrado (igual à aba Leads)
    const totalLeads = leadsWhatsApp.length; // Idêntico à contagem da aba Leads WhatsApp
    const trackedCount = phonesTracked.size;
    const untrackedCount = phonesUntracked.size;
    const disparosCount = leadsDisparos.length; // Idêntico à contagem da aba Leads Disparos

    // Agendados = TODOS que passaram pelo calendário no período
    const agendadosTotal = phonesWithAgendamento.size;
    const compareceuViaAgendamento = phonesWithCompareceu.size;
    const naoCompareceuTotal = phonesWithNaoCompareceu.size;
    
    const agendadosTracked = phonesAgendadosTracked.size;
    const agendadosUntracked = phonesAgendadosUntracked.size;
    const agendadosDisparos = phonesAgendadosDisparos.size;

    // Compareceu = faturas negociação ou fechadas (para exibição no funil)
    const compareceuTotal = phonesCompareceu.size;
    const compareceuTracked = phonesCompareceuTracked.size;
    const compareceuUntracked = phonesCompareceuUntracked.size;
    const compareceuDisparos = phonesCompareceuDisparos.size;

    const clientesTotal = phonesFechado.size;
    const clientesTracked = phonesFechadoTracked.size;
    const clientesUntracked = phonesFechadoUntracked.size;
    const clientesDisparos = phonesFechadoDisparos.size;

    // Negociação = compareceu - fechado
    const emNegociacao = compareceuTotal - clientesTotal;

    // Calculate conversion rates (igual ao Dashboard e Funil)
    const taxaAgendamento = totalLeads > 0 ? (agendadosTotal / totalLeads) * 100 : 0;
    // Taxa de comparecimento = compareceu / (compareceu + não compareceu)
    // Isso reflete a taxa real de comparecimento dos agendamentos concluídos
    const taxaComparecimento = agendadosTotal > 0 ? (compareceuViaAgendamento / agendadosTotal) * 100 : 0;
    const taxaFechamento = compareceuTotal > 0 ? (clientesTotal / compareceuTotal) * 100 : 0;
    const taxaConversaoGeral = totalLeads > 0 ? (clientesTotal / totalLeads) * 100 : 0;

    // Ticket médio
    const ticketMedio = clientesTotal > 0 ? valorTotal / clientesTotal : 0;

    // Group by campaign for analysis (using tracked leads only)
    const byCampaign: Record<string, {
      campaign: string;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    const byAdset: Record<string, {
      adset: string;
      campaign: string;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    const byAd: Record<string, {
      ad: string;
      adset: string;
      campaign: string;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    // Process tracked phones
    for (const phoneKey of phonesTracked) {
      const lead = leadsByPhone[phoneKey];
      if (!lead) continue;

      const campaign = lead.utm_campaign || lead.fb_campaign_name || 'Sem campanha';
      const adset = lead.fb_adset_name || 'Sem conjunto';
      const ad = lead.fb_ad_name || 'Sem anúncio';
      
      // Aggregate by campaign
      if (!byCampaign[campaign]) {
        byCampaign[campaign] = { campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
      }
      byCampaign[campaign].leads++;
      if (phonesAgendadosTracked.has(phoneKey)) byCampaign[campaign].agendados++;
      if (phonesCompareceuTracked.has(phoneKey)) byCampaign[campaign].compareceu++;
      if (phonesFechadoTracked.has(phoneKey)) {
        byCampaign[campaign].clientes++;
        // Get valor from fatura
        const fatura = allFaturas?.find((f: any) => {
          const fPhone = clienteIdToPhone[f.cliente_id];
          return fPhone === phoneKey && f.status === "fechado";
        });
        byCampaign[campaign].valor += fatura?.valor || 0;
      }

      // Aggregate by adset
      if (adset !== 'Sem conjunto') {
        const adsetKey = `${campaign}::${adset}`;
        if (!byAdset[adsetKey]) {
          byAdset[adsetKey] = { adset, campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
        }
        byAdset[adsetKey].leads++;
        if (phonesAgendadosTracked.has(phoneKey)) byAdset[adsetKey].agendados++;
        if (phonesCompareceuTracked.has(phoneKey)) byAdset[adsetKey].compareceu++;
        if (phonesFechadoTracked.has(phoneKey)) {
          byAdset[adsetKey].clientes++;
          const fatura = allFaturas?.find((f: any) => {
            const fPhone = clienteIdToPhone[f.cliente_id];
            return fPhone === phoneKey && f.status === "fechado";
          });
          byAdset[adsetKey].valor += fatura?.valor || 0;
        }
      }

      // Aggregate by ad
      if (ad !== 'Sem anúncio') {
        const adKey = `${campaign}::${adset}::${ad}`;
        if (!byAd[adKey]) {
          byAd[adKey] = { ad, adset, campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
        }
        byAd[adKey].leads++;
        if (phonesAgendadosTracked.has(phoneKey)) byAd[adKey].agendados++;
        if (phonesCompareceuTracked.has(phoneKey)) byAd[adKey].compareceu++;
        if (phonesFechadoTracked.has(phoneKey)) {
          byAd[adKey].clientes++;
          const fatura = allFaturas?.find((f: any) => {
            const fPhone = clienteIdToPhone[f.cliente_id];
            return fPhone === phoneKey && f.status === "fechado";
          });
          byAd[adKey].valor += fatura?.valor || 0;
        }
      }
    }

    return {
      totals: {
        leads: totalLeads,
        leadsTracked: trackedCount,
        leadsUntracked: untrackedCount,
        leadsDisparos: disparosCount,
        agendados: agendadosTotal,
        agendadosTracked,
        agendadosUntracked,
        agendadosDisparos,
        naoCompareceu: naoCompareceuTotal,
        compareceu: compareceuTotal,
        compareceuTracked,
        compareceuUntracked,
        compareceuDisparos,
        emNegociacao,
        clientes: clientesTotal,
        clientesTracked,
        clientesUntracked,
        clientesDisparos,
        valorTotal,
        valorTracked,
        valorUntracked,
        valorDisparos,
        ticketMedio,
      },
      taxas: {
        agendamento: taxaAgendamento,
        comparecimento: taxaComparecimento,
        fechamento: taxaFechamento,
        conversaoGeral: taxaConversaoGeral,
      },
      byCampaign: Object.values(byCampaign).sort((a, b) => b.leads - a.leads),
      byAdset: Object.values(byAdset).sort((a, b) => b.leads - a.leads),
      byAd: Object.values(byAd).sort((a, b) => b.leads - a.leads),
    };
  }, [allLeads, allLeadsForMapping, allAgendamentos, allFaturas, dateStart, dateEnd]);

  const normName = (v?: string | null) => (v ?? "").toString().trim().toLowerCase();

  const spendMaps = useMemo(() => {
    const adsetSpendByName = new Map<string, number>();
    const adSpendByName = new Map<string, number>();

    for (const a of adsSpendData.adsets) {
      const key = normName((a as any).adset_name);
      if (!key) continue;
      adsetSpendByName.set(key, (adsetSpendByName.get(key) ?? 0) + (a.spend ?? 0));
    }

    for (const a of adsSpendData.ads) {
      const key = normName((a as any).ad_name);
      if (!key) continue;
      adSpendByName.set(key, (adSpendByName.get(key) ?? 0) + (a.spend ?? 0));
    }

    return { adsetSpendByName, adSpendByName };
  }, [adsSpendData.adsets, adsSpendData.ads]);

  const currencySymbol = accountCurrency === 'USD' ? 'US$' : 'R$';
  const currencyCode = accountCurrency === 'USD' ? 'USD' : 'BRL';
  
  const formatCurrency = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: currencyCode });
  
  const formatBRL = formatCurrency; // Alias para compatibilidade

  const loadStoredReport = async () => {
    if (!selectedAccount || !user) return;
    
    setLoadingStoredReport(true);
    try {
      const { data, error } = await supabase
        .from('ai_ads_reports')
        .select('*')
        .eq('account_id', selectedAccount)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) {
        console.error("Error loading stored report:", error);
        return;
      }

      if (data && data.length > 0) {
        const latestReport = data[0] as unknown as StoredReport;
        setStoredReport(latestReport);
        setReport(latestReport.report);
        
        if (data.length > 1) {
          setPreviousReport(data[1] as unknown as StoredReport);
        }
        
        // Load spend data for cost per result calculations (in background)
        loadSpendDataForStoredReport(latestReport);
      }
    } catch (error) {
      console.error("Error loading stored report:", error);
    } finally {
      setLoadingStoredReport(false);
    }
  };
  
  const loadSpendDataForStoredReport = async (storedRpt: StoredReport) => {
    try {
      const formattedDateStart = storedRpt.date_start;
      const formattedDateEnd = storedRpt.date_end;
      
      // Fetch campaigns for the stored report period
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: { 
          action: "get_campaign_metrics",
          ad_account_id: selectedAccount,
          date_start: formattedDateStart,
          date_end: formattedDateEnd
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        console.error("Error fetching campaigns for spend data:", response.data?.error);
        return;
      }

      const campaignsForPeriod = response.data.campaigns || [];
      const campaignsWithData = campaignsForPeriod.filter((item: BaseMetrics) => 
        (item.impressions || 0) > 0 || (item.clicks || 0) > 0 || (item.spend || 0) > 0 || (item.results || 0) > 0
      );

      if (campaignsWithData.length === 0) return;

      // Fetch adsets and ads
      const allAdsets: AdsetData[] = [];
      const allAds: AdData[] = [];

      for (const campaign of campaignsWithData) {
        try {
          const { data } = await supabase.functions.invoke("facebook-ads-api", {
            body: {
              action: "get_adsets",
              campaign_id: campaign.campaign_id,
              date_start: formattedDateStart,
              date_end: formattedDateEnd,
            },
          });
          if (data?.success && data.adsets) {
            allAdsets.push(...data.adsets.map((adset: AdsetData) => ({
              ...adset,
              campaign_name: campaign.campaign_name,
              campaign_id: campaign.campaign_id,
            })));
          }
        } catch (e) {
          console.error(`Error fetching adsets for campaign ${campaign.campaign_id}:`, e);
        }
      }

      for (const adset of allAdsets) {
        try {
          const { data } = await supabase.functions.invoke("facebook-ads-api", {
            body: {
              action: "get_ads",
              adset_id: adset.adset_id,
              date_start: formattedDateStart,
              date_end: formattedDateEnd,
            },
          });
          if (data?.success && data.ads) {
            allAds.push(...data.ads.map((ad: AdData) => ({
              ...ad,
              adset_name: adset.adset_name,
              adset_id: adset.adset_id,
            })));
          }
        } catch (e) {
          console.error(`Error fetching ads for adset ${adset.adset_id}:`, e);
        }
      }

      const adsetsWithData = allAdsets.filter((item: BaseMetrics) => 
        (item.impressions || 0) > 0 || (item.clicks || 0) > 0 || (item.spend || 0) > 0 || (item.results || 0) > 0
      );
      const adsWithData = allAds.filter((item: BaseMetrics) => 
        (item.impressions || 0) > 0 || (item.clicks || 0) > 0 || (item.spend || 0) > 0 || (item.results || 0) > 0
      );

      setAdsSpendData({ adsets: adsetsWithData, ads: adsWithData });
    } catch (error) {
      console.error("Error loading spend data for stored report:", error);
    }
  };

  const checkApiKeyStatus = async () => {
    try {
      setCheckingApiKey(true);
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("ai-ads-report", {
        body: { action: "check_api_key" },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      setApiKeyConfigured(response.data?.configured === true);
    } catch (error) {
      console.error("Error checking API key:", error);
      setApiKeyConfigured(false);
    } finally {
      setCheckingApiKey(false);
    }
  };

  const fetchAllAdsetsAndAds = async (campaignsToFetch: CampaignData[]): Promise<{ adsets: AdsetData[]; ads: AdData[] }> => {
    const allAdsets: AdsetData[] = [];
    const allAds: AdData[] = [];
    
    const formattedDateStart = format(dateStart, "yyyy-MM-dd");
    const formattedDateEnd = format(dateEnd, "yyyy-MM-dd");

    // Fetch adsets for all campaigns
    setLoadingMessage("Carregando conjuntos de anúncios...");
    for (const campaign of campaignsToFetch) {
      try {
        const { data } = await supabase.functions.invoke("facebook-ads-api", {
          body: {
            action: "get_adsets",
            campaign_id: campaign.campaign_id,
            date_start: formattedDateStart,
            date_end: formattedDateEnd,
          },
        });
        if (data?.success && data.adsets) {
          allAdsets.push(...data.adsets.map((adset: AdsetData) => ({
            ...adset,
            campaign_name: campaign.campaign_name,
            campaign_id: campaign.campaign_id,
          })));
        }
      } catch (e) {
        console.error(`Error fetching adsets for campaign ${campaign.campaign_id}:`, e);
      }
    }

    // Fetch ads for all adsets
    setLoadingMessage(`Carregando anúncios de ${allAdsets.length} conjuntos...`);
    for (const adset of allAdsets) {
      try {
        const { data } = await supabase.functions.invoke("facebook-ads-api", {
          body: {
            action: "get_ads",
            adset_id: adset.adset_id,
            date_start: formattedDateStart,
            date_end: formattedDateEnd,
          },
        });
        if (data?.success && data.ads) {
          allAds.push(...data.ads.map((ad: AdData) => ({
            ...ad,
            adset_name: adset.adset_name,
            adset_id: adset.adset_id,
          })));
        }
      } catch (e) {
        console.error(`Error fetching ads for adset ${adset.adset_id}:`, e);
      }
    }

    return { adsets: allAdsets, ads: allAds };
  };

  const handleGenerateClick = () => {
    if (storedReport && previousReport) {
      setShowCompareDialog(true);
    } else {
      generateReport(false);
    }
  };

  // Helper function to check if an item has actual data (not all zeros)
  const hasActualData = (item: BaseMetrics): boolean => {
    return (
      (item.impressions || 0) > 0 ||
      (item.clicks || 0) > 0 ||
      (item.spend || 0) > 0 ||
      (item.results || 0) > 0 ||
      (item.reach || 0) > 0
    );
  };

  const fetchCampaignsForPeriod = async (): Promise<CampaignData[]> => {
    const formattedDateStart = format(dateStart, "yyyy-MM-dd");
    const formattedDateEnd = format(dateEnd, "yyyy-MM-dd");
    
    setLoadingMessage("Carregando campanhas do período...");
    
    const { data: session } = await supabase.auth.getSession();
    const response = await supabase.functions.invoke("facebook-ads-api", {
      body: { 
        action: "get_campaign_metrics",
        ad_account_id: selectedAccount,
        date_start: formattedDateStart,
        date_end: formattedDateEnd
      },
      headers: {
        Authorization: `Bearer ${session.session?.access_token}`,
      },
    });

    if (response.error || !response.data?.success) {
      throw new Error(response.data?.error || "Erro ao buscar campanhas");
    }

    return response.data.campaigns || [];
  };

  const generateReport = async (compare: boolean) => {
    setShowCompareDialog(false);
    
    if (!selectedAccount) {
      toast({
        title: "Conta não selecionada",
        description: "Selecione uma conta de anúncios primeiro.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Fetch campaigns with the local period filter (not from parent props)
      const campaignsForPeriod = await fetchCampaignsForPeriod();
      
      // Filter campaigns with actual data
      const campaignsWithData = campaignsForPeriod.filter(hasActualData);
      
      if (campaignsWithData.length === 0) {
        toast({
          title: "Dados insuficientes",
          description: "Nenhuma campanha com dados no período selecionado. Selecione um período diferente ou verifique se há campanhas ativas.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Fetch all adsets and ads using the campaignsWithData
      const { adsets, ads } = await fetchAllAdsetsAndAds(campaignsWithData);
      
      // Filter adsets and ads with actual data
      const adsetsWithData = adsets.filter(hasActualData);
      const adsWithData = ads.filter(hasActualData);
      
      // Store ads spend data for cost per result calculations
      setAdsSpendData({ adsets: adsetsWithData, ads: adsWithData });
      
      setLoadingMessage("Gerando análise com IA...");
      const { data: session } = await supabase.auth.getSession();
      
      const formattedDateStart = format(dateStart, "yyyy-MM-dd");
      const formattedDateEnd = format(dateEnd, "yyyy-MM-dd");
      
      console.log(`Sending to AI: ${campaignsWithData.length} campaigns, ${adsetsWithData.length} adsets, ${adsWithData.length} ads (filtered from ${campaignsForPeriod.length}, ${adsets.length}, ${ads.length})`);
      console.log(`Date range: ${formattedDateStart} to ${formattedDateEnd}`);
      
      const response = await supabase.functions.invoke("ai-ads-report", {
        body: { 
          action: "generate_report",
          campaigns: campaignsWithData,
          adsets: adsetsWithData,
          ads: adsWithData,
          dateStart: formattedDateStart,
          dateEnd: formattedDateEnd,
          accountId: selectedAccount,
          currency: accountCurrency || "BRL",
          compareWithPrevious: compare,
          previousReport: compare ? storedReport?.report : null,
          // Include funnel data for comprehensive analysis
          funnelData: funnelData ? {
            totals: funnelData.totals,
            taxas: funnelData.taxas,
            byCampaign: funnelData.byCampaign,
          } : null
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.data?.error || "Erro ao gerar relatório");
      }

      const newReport = response.data.report as AIReport;
      setReport(newReport);
      
      // Save to database
      const { error: saveError } = await supabase
        .from('ai_ads_reports')
        .insert([{
          user_id: user?.id,
          account_id: selectedAccount,
          date_start: formattedDateStart,
          date_end: formattedDateEnd,
          report: JSON.parse(JSON.stringify(newReport)) as Json,
          campaigns_count: campaignsWithData.length,
          adsets_count: adsetsWithData.length,
          ads_count: adsWithData.length
        }]);

      if (saveError) {
        console.error("Error saving report:", saveError);
      } else {
        // Reload stored reports
        await loadStoredReport();
      }
      
      toast({
        title: "Relatório gerado",
        description: `Análise completa: ${campaignsWithData.length} campanhas, ${adsetsWithData.length} conjuntos e ${adsWithData.length} anúncios.`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao gerar relatório";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "success":
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Sparkles className="h-5 w-5 text-blue-500" />;
    }
  };

  const getInsightBadgeVariant = (type: string) => {
    switch (type) {
      case "success":
        return "default";
      case "warning":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const exportToPDF = () => {
    if (!report || !storedReport) {
      toast({
        title: "Nenhum relatório disponível",
        description: "Gere um relatório antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let yPos = 20;

    const addText = (text: string, fontSize: number = 10, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setTextColor(color[0], color[1], color[2]);
      
      const lines = doc.splitTextToSize(text, contentWidth);
      const lineHeight = fontSize * 0.5;
      
      if (yPos + lines.length * lineHeight > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.text(lines, margin, yPos);
      yPos += lines.length * lineHeight + 4;
    };

    const addSection = (title: string) => {
      yPos += 6;
      if (yPos > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        yPos = 20;
      }
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;
      addText(title, 14, true, [59, 130, 246]);
    };

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório de IA - Meta Ads", margin, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${format(parseISO(storedReport.date_start), "dd/MM/yyyy")} a ${format(parseISO(storedReport.date_end), "dd/MM/yyyy")}`, margin, 28);
    
    yPos = 50;
    doc.setTextColor(0, 0, 0);

    // Score
    if (report.score !== undefined) {
      addSection("Score de Desempenho");
      const scoreColor: [number, number, number] = report.score >= 70 ? [34, 197, 94] : report.score >= 50 ? [234, 179, 8] : [239, 68, 68];
      addText(`${report.score}/100`, 24, true, scoreColor);
      const scoreText = report.score >= 70 ? "Excelente desempenho geral!" : report.score >= 50 ? "Desempenho moderado, há oportunidades de melhoria." : "Desempenho abaixo do esperado, ação necessária.";
      addText(scoreText, 10, false, [100, 100, 100]);
    }

    // Summary
    addSection("Resumo Executivo");
    addText(report.summary, 10);

    // Comparison
    if (report.comparison) {
      addSection("Comparação com Período Anterior");
      addText(report.comparison.summary, 10);
      yPos += 4;
      report.comparison.changes.forEach((change, index) => {
        const icon = change.type === "improvement" ? "↑" : change.type === "decline" ? "↓" : "→";
        const color: [number, number, number] = change.type === "improvement" ? [34, 197, 94] : change.type === "decline" ? [239, 68, 68] : [100, 100, 100];
        addText(`${icon} ${change.title}`, 11, true, color);
        addText(change.description, 9, false, [100, 100, 100]);
        yPos += 2;
      });
    }

    // Insights
    addSection("Insights");
    report.insights.forEach((insight, index) => {
      const icon = insight.type === "success" ? "✓" : insight.type === "warning" ? "⚠" : "ℹ";
      const color: [number, number, number] = insight.type === "success" ? [34, 197, 94] : insight.type === "warning" ? [234, 179, 8] : [59, 130, 246];
      addText(`${icon} ${insight.title}`, 11, true, color);
      addText(insight.description, 9, false, [60, 60, 60]);
      yPos += 3;
    });

    // Top Performers
    if (report.topPerformersByMetric) {
      addSection("Melhores Desempenhos por Métrica");
      const metricLabels: Record<string, string> = {
        results: "Mais Conversas",
        ctr: "Melhor CTR",
        cpc: "Menor CPC",
        cpm: "Menor CPM",
        cost_per_result: "Menor Custo/Conversa",
      };
      
      Object.entries(report.topPerformersByMetric as TopPerformersByMetric).forEach(([key, data]) => {
        const label = metricLabels[key] || key;
        addText(label, 12, true, [59, 130, 246]);
        
        if (data.campaigns?.length > 0) {
          addText("Campanhas:", 10, true);
          data.campaigns.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (${currencySymbol} ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
          });
        }
        
        if (data.adsets?.length > 0) {
          addText("Conjuntos:", 10, true);
          data.adsets.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (${currencySymbol} ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
          });
        }
        
        if (data.ads?.length > 0) {
          addText("Anúncios:", 10, true);
          data.ads.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (${currencySymbol} ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
          });
        }
        yPos += 4;
      });
    }

    // Recommendations
    addSection("Recomendações");
    report.recommendations.forEach((rec, index) => {
      addText(`${index + 1}. ${rec}`, 10);
      yPos += 2;
    });

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - Página ${i} de ${totalPages}`, margin, doc.internal.pageSize.getHeight() - 10);
    }

    // Save
    const fileName = `relatorio-ia-${format(parseISO(storedReport.date_start), "ddMMyyyy")}-${format(parseISO(storedReport.date_end), "ddMMyyyy")}.pdf`;
    doc.save(fileName);

    toast({
      title: "PDF exportado com sucesso!",
      description: `Arquivo: ${fileName}`,
    });
  };

  if (checkingApiKey || loadingStoredReport) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!apiKeyConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Configurar API OpenAI
          </CardTitle>
          <CardDescription>
            Para gerar relatórios com IA, é necessário configurar a chave da API OpenAI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">API Key não configurada</p>
              <p className="text-sm text-muted-foreground">
                A chave da API OpenAI precisa ser adicionada nas configurações do projeto pelo administrador.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={checkApiKeyStatus}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Verificar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com período e botão de gerar */}
      <Card>
        <CardHeader className="pb-4">
          {/* Desktop: Título à esquerda, Período à direita */}
          {/* Mobile: Título e período na mesma linha */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Relatório de IA</CardTitle>
                <CardDescription className="hidden sm:block">
                  Análise inteligente de campanhas, conjuntos e anúncios
                </CardDescription>
              </div>
            </div>
            
            {/* Desktop: Período no canto superior direito */}
            <div className="hidden lg:flex items-center gap-2">
              <Select value={periodFilter} onValueChange={(v) => setPeriodFilterHook(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Período" />
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
              
              {periodFilter === "custom" && (
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="min-w-[90px]">
                        {format(dateStart, "dd/MM/yy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateStart}
                        onSelect={(date) => date && setDateStart(date)}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground text-sm">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="min-w-[90px]">
                        {format(dateEnd, "dd/MM/yy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateEnd}
                        onSelect={(date) => date && setDateEnd(date)}
                        locale={ptBR}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>

          {/* Desktop: Badges + Botão na mesma linha */}
          <div className="hidden lg:flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                API Conectada
              </Badge>
              {funnelData && (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    Leads WhatsApp: {funnelData.totals.leads}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Layers className="h-3 w-3" />
                    Leads Disparos: {funnelData.totals.leadsDisparos}
                  </Badge>
                </>
              )}
            </div>
            
            <Button 
              onClick={handleGenerateClick} 
              disabled={loading || !selectedAccount}
              className="h-10 min-w-[180px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {loadingMessage || "Analisando..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Gerar Relatório
                </>
              )}
            </Button>
          </div>

          {/* Mobile: Badges */}
          <div className="flex lg:hidden flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              API Conectada
            </Badge>
            {funnelData && (
              <>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  Leads WhatsApp: {funnelData.totals.leads}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Layers className="h-3 w-3" />
                  Leads Disparos: {funnelData.totals.leadsDisparos}
                </Badge>
              </>
            )}
          </div>

          {/* Mobile: Período + Botão na mesma linha com mesma altura */}
          <div className="flex lg:hidden items-stretch gap-2">
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilterHook(v as any)}>
              <SelectTrigger className="flex-1 h-10">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Período" />
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
            
            <Button 
              onClick={handleGenerateClick} 
              disabled={loading || !selectedAccount}
              className="h-10 px-3"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Gerar
                </>
              )}
            </Button>
          </div>
          
          {/* Mobile: Datas customizadas abaixo */}
          {periodFilter === "custom" && (
            <div className="flex lg:hidden items-center gap-2 mt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    {format(dateStart, "dd/MM/yy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateStart}
                    onSelect={(date) => date && setDateStart(date)}
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1">
                    {format(dateEnd, "dd/MM/yy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateEnd}
                    onSelect={(date) => date && setDateEnd(date)}
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </CardHeader>
        
        {/* Info about stored report */}
        {storedReport && !loading && (
          <CardContent className="pt-0">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-medium">Período:</span>{" "}
                    {format(parseISO(storedReport.date_start), "dd/MM/yyyy")} a {format(parseISO(storedReport.date_end), "dd/MM/yyyy")}
                    <span className="text-muted-foreground ml-2">
                      ({storedReport.campaigns_count} campanhas, {storedReport.adsets_count} conjuntos, {storedReport.ads_count} anúncios)
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Relatório gerado em {format(new Date(storedReport.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              
              {/* Comparison period info */}
              {previousReport && report?.comparison && (
                <div className="flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <GitCompare className="h-5 w-5 text-purple-500" />
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">Período de comparação:</span>{" "}
                      {format(parseISO(previousReport.date_start), "dd/MM/yyyy")} a {format(parseISO(previousReport.date_end), "dd/MM/yyyy")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Relatório gerado em {format(new Date(previousReport.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
        
        {!selectedAccount && (
          <CardContent>
            <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Selecione uma conta de anúncios para gerar o relatório.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">{loadingMessage || "Processando..."}</p>
              <p className="text-sm text-muted-foreground">
                Isso pode levar alguns segundos dependendo do volume de dados.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {report && !loading && (
        <>
          {/* Score Card */}
          {report.score !== undefined && (
            <Card className={`border-2 ${
              report.score >= 70 ? 'border-green-500/30 bg-green-500/5' :
              report.score >= 50 ? 'border-yellow-500/30 bg-yellow-500/5' :
              'border-red-500/30 bg-red-500/5'
            }`}>
              <CardContent className="py-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-full ${
                      report.score >= 70 ? 'bg-green-500/20' :
                      report.score >= 50 ? 'bg-yellow-500/20' :
                      'bg-red-500/20'
                    }`}>
                      <Trophy className={`h-8 w-8 ${
                        report.score >= 70 ? 'text-green-500' :
                        report.score >= 50 ? 'text-yellow-500' :
                        'text-red-500'
                      }`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Score de Desempenho</h3>
                      <p className="text-sm text-muted-foreground">
                        {report.score >= 70 ? 'Excelente desempenho geral!' :
                         report.score >= 50 ? 'Desempenho moderado, há oportunidades de melhoria.' :
                         'Desempenho abaixo do esperado, ação necessária.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={exportToPDF}>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar PDF
                    </Button>
                    <div className="text-right">
                      <span className={`text-5xl font-bold ${
                        report.score >= 70 ? 'text-green-500' :
                        report.score >= 50 ? 'text-yellow-500' :
                        'text-red-500'
                      }`}>{report.score}</span>
                      <span className="text-2xl text-muted-foreground">/100</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comparison Section */}
          {report.comparison && (
            <Card className="border-purple-500/20 bg-purple-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GitCompare className="h-5 w-5 text-purple-500" />
                  Comparação com Relatório Anterior
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{report.comparison.summary}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.comparison.changes.map((change, index) => (
                    <div 
                      key={index} 
                      className={`flex gap-3 p-3 rounded-lg border ${
                        change.type === "improvement" 
                          ? "bg-green-500/5 border-green-500/20" 
                          : change.type === "decline" 
                            ? "bg-red-500/5 border-red-500/20" 
                            : "bg-muted/30 border-border"
                      }`}
                    >
                      <TrendingUp 
                        className={`h-5 w-5 ${
                          change.type === "improvement" 
                            ? "text-green-500" 
                            : change.type === "decline" 
                              ? "text-red-500 rotate-180" 
                              : "text-muted-foreground"
                        }`} 
                      />
                      <div>
                        <p className="font-medium text-sm">{change.title}</p>
                        <p className="text-xs text-muted-foreground">{change.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resumo Executivo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Resumo Executivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{report.summary}</p>
            </CardContent>
          </Card>

          {/* Grid de Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {report.insights.map((insight, index) => (
                    <div key={index} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                      {getInsightIcon(insight.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{insight.title}</span>
                          <Badge variant={getInsightBadgeVariant(insight.type)} className="text-xs">
                            {insight.type === "success" ? "Positivo" : insight.type === "warning" ? "Atenção" : "Info"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Top Performers by Metric */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                  Melhores Desempenhos por Métrica
                  {previousReport && report.comparison && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      <GitCompare className="h-3 w-3 mr-1" />
                      Com comparação
                    </Badge>
                  )}
                </CardTitle>
                <Select value={topPerformersLevel} onValueChange={(v) => setTopPerformersLevel(v as typeof topPerformersLevel)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Todos os níveis
                      </span>
                    </SelectItem>
                    <SelectItem value="campaigns">
                      <span className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-green-600" />
                        Apenas Campanhas
                      </span>
                    </SelectItem>
                    <SelectItem value="adsets">
                      <span className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-blue-600" />
                        Apenas Conjuntos
                      </span>
                    </SelectItem>
                    <SelectItem value="ads">
                      <span className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-purple-600" />
                        Apenas Anúncios
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[700px] pr-4">
                <div className="space-y-8">
                  {report.topPerformersByMetric && Object.entries(report.topPerformersByMetric as TopPerformersByMetric).map(([metricKey, data]) => {
                    const metricLabels: Record<string, { title: string; description: string }> = {
                      results: { title: 'Mais Conversas', description: 'Campanhas, conjuntos e anúncios com mais conversas iniciadas' },
                      ctr: { title: 'Melhor CTR', description: 'Maior taxa de cliques (engajamento)' },
                      cpc: { title: 'Menor CPC', description: 'Custo por clique mais eficiente' },
                      cpm: { title: 'Menor CPM', description: 'Custo por mil impressões mais baixo' },
                      cost_per_result: { title: 'Menor Custo/Conversa', description: 'Custo mais baixo por conversa iniciada' },
                    };

                    const metricInfo = metricLabels[metricKey] || { title: metricKey, description: '' };
                    
                    // Filter data based on selected level
                    const showCampaigns = topPerformersLevel === "all" || topPerformersLevel === "campaigns";
                    const showAdsets = topPerformersLevel === "all" || topPerformersLevel === "adsets";
                    const showAds = topPerformersLevel === "all" || topPerformersLevel === "ads";
                    
                    const hasData = (showCampaigns && data.campaigns?.length > 0) || 
                                   (showAdsets && data.adsets?.length > 0) || 
                                   (showAds && data.ads?.length > 0);
                    
                    // Get previous report data for comparison
                    const previousData = (previousReport?.report?.topPerformersByMetric as TopPerformersByMetric | undefined)?.[metricKey];
                    const hasPreviousData = previousData && (
                      (showCampaigns && previousData.campaigns?.length > 0) || 
                      (showAdsets && previousData.adsets?.length > 0) || 
                      (showAds && previousData.ads?.length > 0)
                    );
                    const showComparison = report.comparison && hasPreviousData;
                    
                    if (!hasData && !hasPreviousData) return null;

                    const renderTopItem = (item: TopPerformerItem, index: number, colorClass: string, badgeClass: string) => (
                      <div key={index} className={`p-4 sm:p-5 ${colorClass} rounded-xl border-2 transition-all hover:shadow-md w-full min-w-0`}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Badge className={`${badgeClass} text-xs sm:text-sm px-2 sm:px-3 py-1 shrink-0`}>
                            #{index + 1}
                          </Badge>
                          <Badge variant="secondary" className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 shrink-0">
                            {item.value}
                          </Badge>
                        </div>
                        <p className="font-semibold text-sm sm:text-base mb-2 break-words" title={item.name}>{item.name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground break-words">
                          Investido: <span className="font-medium">R$ {(item.spend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </p>
                      </div>
                    );

                    const renderSection = (items: TopPerformerItem[], icon: React.ReactNode, label: string, colorClass: string, badgeClass: string) => (
                      <div className="space-y-3 sm:space-y-4 min-w-0">
                        <h5 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2 border-b pb-2">
                          {icon}
                          {label}
                        </h5>
                        <div className="space-y-3">
                          {items.map((item, index) => renderTopItem(item, index, colorClass, badgeClass))}
                        </div>
                      </div>
                    );

                    return (
                      <div key={metricKey} className="bg-card border rounded-xl p-4 sm:p-6 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                          <Badge className="text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2 bg-primary text-primary-foreground">{metricInfo.title}</Badge>
                          <span className="text-xs sm:text-sm text-muted-foreground">{metricInfo.description}</span>
                        </div>
                        
                        {showComparison ? (
                          /* Comparison view: Current on left, Previous on right */
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
                            {/* Current Report - Left */}
                            <div className="p-3 sm:p-5 bg-green-500/5 border-2 border-green-500/20 rounded-xl overflow-hidden">
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
                                <Badge className="bg-green-500 text-white text-xs sm:text-sm px-2 sm:px-3 py-1">
                                  Atual
                                </Badge>
                                <span className="text-xs sm:text-sm text-muted-foreground">
                                  {format(dateStart, "dd/MM", { locale: ptBR })} - {format(dateEnd, "dd/MM", { locale: ptBR })}
                                </span>
                              </div>
                              <div className="grid gap-4 sm:gap-6 grid-cols-1 md:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]"> 
                                {showCampaigns && data.campaigns?.length > 0 && renderSection(data.campaigns, <Target className="h-4 w-4 text-green-600" />, "Campanhas", "bg-green-500/10 border-green-500/20", "bg-green-500 text-white")}
                                {showAdsets && data.adsets?.length > 0 && renderSection(data.adsets, <Layers className="h-4 w-4 text-blue-600" />, "Conjuntos", "bg-blue-500/10 border-blue-500/20", "bg-blue-500 text-white")}
                                {showAds && data.ads?.length > 0 && renderSection(data.ads, <Megaphone className="h-4 w-4 text-purple-600" />, "Anúncios", "bg-purple-500/10 border-purple-500/20", "bg-purple-500 text-white")}
                              </div>
                            </div>
                            
                            {/* Previous Report - Right */}
                            <div className="p-3 sm:p-5 bg-muted/30 border-2 border-border rounded-xl overflow-hidden">
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
                                <Badge variant="outline" className="text-xs sm:text-sm px-2 sm:px-3 py-1">
                                  Anterior
                                </Badge>
                                <span className="text-xs sm:text-sm text-muted-foreground">
                                  {previousReport && format(parseISO(previousReport.date_start), "dd/MM", { locale: ptBR })} - {previousReport && format(parseISO(previousReport.date_end), "dd/MM", { locale: ptBR })}
                                </span>
                              </div>
                              <div className="grid gap-4 sm:gap-6 grid-cols-1 md:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                                {showCampaigns && previousData?.campaigns?.length > 0 && renderSection(previousData.campaigns, <Target className="h-4 w-4" />, "Campanhas", "bg-muted/50 border-border", "bg-muted text-muted-foreground")}
                                {showAdsets && previousData?.adsets?.length > 0 && renderSection(previousData.adsets, <Layers className="h-4 w-4" />, "Conjuntos", "bg-muted/50 border-border", "bg-muted text-muted-foreground")}
                                {showAds && previousData?.ads?.length > 0 && renderSection(previousData.ads, <Megaphone className="h-4 w-4" />, "Anúncios", "bg-muted/50 border-border", "bg-muted text-muted-foreground")}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Normal view: responsive columns */
                          <div className="grid gap-4 sm:gap-8 grid-cols-1 md:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
                            {showCampaigns && data.campaigns?.length > 0 && renderSection(data.campaigns, <Target className="h-4 w-4 text-green-600" />, "Campanhas", "bg-green-500/10 border-green-500/20", "bg-green-500 text-white")}
                            {showAdsets && data.adsets?.length > 0 && renderSection(data.adsets, <Layers className="h-4 w-4 text-blue-600" />, "Conjuntos", "bg-blue-500/10 border-blue-500/20", "bg-blue-500 text-white")}
                            {showAds && data.ads?.length > 0 && renderSection(data.ads, <Megaphone className="h-4 w-4 text-purple-600" />, "Anúncios", "bg-purple-500/10 border-purple-500/20", "bg-purple-500 text-white")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>


          {/* CARD 1: Top Performers by Funnel Stage - RESULTS */}
          {funnelData && (funnelData.byAdset.length > 0 || funnelData.byAd.length > 0) && (
            <Card className="border-cyan-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-cyan-500" />
                  Melhores Desempenhos por Etapa do Funil
                </CardTitle>
                <CardDescription>
                  Conjuntos e anúncios que mais alimentam cada etapa do funil de conversão
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {/* Stage 1: Leads */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <Users className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold text-base">Etapa 1: Geração de Leads</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {funnelData.byAdset.length > 0 && (
                        <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Layers className="h-4 w-4 text-blue-500" />
                            <h4 className="font-medium text-sm">Top Conjuntos</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAdset]
                              .sort((a, b) => b.leads - a.leads)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-600 ml-2">
                                    {item.leads} leads
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {funnelData.byAd.length > 0 && (
                        <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Megaphone className="h-4 w-4 text-purple-500" />
                            <h4 className="font-medium text-sm">Top Anúncios</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAd]
                              .sort((a, b) => b.leads - a.leads)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-600 ml-2">
                                    {item.leads} leads
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 2: Agendamentos */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <Calendar className="h-5 w-5 text-amber-500" />
                      <h3 className="font-semibold text-base">Etapa 2: Agendamentos</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {funnelData.byAdset.filter(a => a.agendados > 0).length > 0 && (
                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Layers className="h-4 w-4 text-amber-500" />
                            <h4 className="font-medium text-sm">Top Conjuntos</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAdset]
                              .filter(a => a.agendados > 0)
                              .sort((a, b) => b.agendados - a.agendados)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600 ml-2">
                                    {item.agendados} agend.
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {funnelData.byAd.filter(a => a.agendados > 0).length > 0 && (
                        <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Megaphone className="h-4 w-4 text-orange-500" />
                            <h4 className="font-medium text-sm">Top Anúncios</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAd]
                              .filter(a => a.agendados > 0)
                              .sort((a, b) => b.agendados - a.agendados)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-600 ml-2">
                                    {item.agendados} agend.
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 3: Comparecimentos */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <CheckCircle2 className="h-5 w-5 text-teal-500" />
                      <h3 className="font-semibold text-base">Etapa 3: Comparecimentos</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {funnelData.byAdset.filter(a => a.compareceu > 0).length > 0 && (
                        <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Layers className="h-4 w-4 text-teal-500" />
                            <h4 className="font-medium text-sm">Top Conjuntos</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAdset]
                              .filter(a => a.compareceu > 0)
                              .sort((a, b) => b.compareceu - a.compareceu)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-teal-500 text-white' : 'bg-teal-500/20 text-teal-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600 ml-2">
                                    {item.compareceu} comp.
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {funnelData.byAd.filter(a => a.compareceu > 0).length > 0 && (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Megaphone className="h-4 w-4 text-emerald-500" />
                            <h4 className="font-medium text-sm">Top Anúncios</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAd]
                              .filter(a => a.compareceu > 0)
                              .sort((a, b) => b.compareceu - a.compareceu)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 ml-2">
                                    {item.compareceu} comp.
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 4: Clientes */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <UserCheck className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold text-base">Etapa 4: Clientes Fechados</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {funnelData.byAdset.filter(a => a.clientes > 0).length > 0 && (
                        <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Layers className="h-4 w-4 text-green-500" />
                            <h4 className="font-medium text-sm">Top Conjuntos</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAdset]
                              .filter(a => a.clientes > 0)
                              .sort((a, b) => b.clientes - a.clientes)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600 ml-2">
                                    {item.clientes} clientes
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {funnelData.byAd.filter(a => a.clientes > 0).length > 0 && (
                        <div className="p-4 bg-lime-500/5 border border-lime-500/20 rounded-xl">
                          <div className="flex items-center gap-2 mb-3">
                            <Megaphone className="h-4 w-4 text-lime-600" />
                            <h4 className="font-medium text-sm">Top Anúncios</h4>
                          </div>
                          <div className="space-y-2">
                            {[...funnelData.byAd]
                              .filter(a => a.clientes > 0)
                              .sort((a, b) => b.clientes - a.clientes)
                              .slice(0, 5)
                              .map((item, index) => (
                                <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-lime-500 text-white' : 'bg-lime-500/20 text-lime-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-lime-500/10 border-lime-500/30 text-lime-600 ml-2">
                                    {item.clientes} clientes
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CARD 2: Cost per Result by Funnel Stage */}
          {funnelData && adsSpendData.adsets.length > 0 && (funnelData.byAdset.length > 0 || funnelData.byAd.length > 0) && (
            <Card className="border-emerald-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-emerald-500" />
                  Melhor Custo por Etapa do Funil
                </CardTitle>
                <CardDescription>
                  Conjuntos e anúncios com menor custo por resultado em cada etapa
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {/* Stage 1: CPL */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <Users className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold text-base">Etapa 1: Custo por Lead</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(() => {
                        const adsetsWithCPL = funnelData.byAdset
                          .filter(f => f.leads > 0)
                          .map(f => {
                            const spend = spendMaps.adsetSpendByName.get(normName(f.adset)) || 0;
                            const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                            return { ...f, spend, cpl };
                          })
                          .filter(f => f.cpl !== null && f.cpl > 0)
                          .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                        
                        if (adsetsWithCPL.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Layers className="h-4 w-4 text-blue-500" />
                              <h4 className="font-medium text-sm">Top Conjuntos</h4>
                            </div>
                            <div className="space-y-2">
                              {adsetsWithCPL.slice(0, 5).map((item, index) => (
                                <div key={`cpl-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-600 ml-2">
                                    {formatBRL(item.cpl || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const adsWithCPL = funnelData.byAd
                          .filter(f => f.leads > 0)
                          .map(f => {
                            const spend = spendMaps.adSpendByName.get(normName(f.ad)) || 0;
                            const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                            return { ...f, spend, cpl };
                          })
                          .filter(f => f.cpl !== null && f.cpl > 0)
                          .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                        
                        if (adsWithCPL.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Megaphone className="h-4 w-4 text-purple-500" />
                              <h4 className="font-medium text-sm">Top Anúncios</h4>
                            </div>
                            <div className="space-y-2">
                              {adsWithCPL.slice(0, 5).map((item, index) => (
                                <div key={`cpl-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-600 ml-2">
                                    {formatBRL(item.cpl || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Stage 2: Cost per Agendamento */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <Calendar className="h-5 w-5 text-amber-500" />
                      <h3 className="font-semibold text-base">Etapa 2: Custo por Agendamento</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(() => {
                        const adsetsWithCPA = funnelData.byAdset
                          .filter(f => f.agendados > 0)
                          .map(f => {
                            const spend = spendMaps.adsetSpendByName.get(normName(f.adset)) || 0;
                            const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                            return { ...f, spend, cpa };
                          })
                          .filter(f => f.cpa !== null && f.cpa > 0)
                          .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                        
                        if (adsetsWithCPA.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Layers className="h-4 w-4 text-amber-500" />
                              <h4 className="font-medium text-sm">Top Conjuntos</h4>
                            </div>
                            <div className="space-y-2">
                              {adsetsWithCPA.slice(0, 5).map((item, index) => (
                                <div key={`cpa-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600 ml-2">
                                    {formatBRL(item.cpa || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const adsWithCPA = funnelData.byAd
                          .filter(f => f.agendados > 0)
                          .map(f => {
                            const spend = spendMaps.adSpendByName.get(normName(f.ad)) || 0;
                            const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                            return { ...f, spend, cpa };
                          })
                          .filter(f => f.cpa !== null && f.cpa > 0)
                          .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                        
                        if (adsWithCPA.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Megaphone className="h-4 w-4 text-orange-500" />
                              <h4 className="font-medium text-sm">Top Anúncios</h4>
                            </div>
                            <div className="space-y-2">
                              {adsWithCPA.slice(0, 5).map((item, index) => (
                                <div key={`cpa-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-600 ml-2">
                                    {formatBRL(item.cpa || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Stage 3: Cost per Comparecimento */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <CheckCircle2 className="h-5 w-5 text-teal-500" />
                      <h3 className="font-semibold text-base">Etapa 3: Custo por Comparecimento</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(() => {
                        const adsetsWithCPC = funnelData.byAdset
                          .filter(f => f.compareceu > 0)
                          .map(f => {
                            const spend = spendMaps.adsetSpendByName.get(normName(f.adset)) || 0;
                            const costPerComp = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                            return { ...f, spend, costPerComp };
                          })
                          .filter(f => f.costPerComp !== null && f.costPerComp > 0)
                          .sort((a, b) => (a.costPerComp || 0) - (b.costPerComp || 0));
                        
                        if (adsetsWithCPC.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Layers className="h-4 w-4 text-teal-500" />
                              <h4 className="font-medium text-sm">Top Conjuntos</h4>
                            </div>
                            <div className="space-y-2">
                              {adsetsWithCPC.slice(0, 5).map((item, index) => (
                                <div key={`cpc-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-teal-500 text-white' : 'bg-teal-500/20 text-teal-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600 ml-2">
                                    {formatBRL(item.costPerComp || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const adsWithCPC = funnelData.byAd
                          .filter(f => f.compareceu > 0)
                          .map(f => {
                            const spend = spendMaps.adSpendByName.get(normName(f.ad)) || 0;
                            const costPerComp = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                            return { ...f, spend, costPerComp };
                          })
                          .filter(f => f.costPerComp !== null && f.costPerComp > 0)
                          .sort((a, b) => (a.costPerComp || 0) - (b.costPerComp || 0));
                        
                        if (adsWithCPC.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Megaphone className="h-4 w-4 text-emerald-500" />
                              <h4 className="font-medium text-sm">Top Anúncios</h4>
                            </div>
                            <div className="space-y-2">
                              {adsWithCPC.slice(0, 5).map((item, index) => (
                                <div key={`cpc-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 ml-2">
                                    {formatBRL(item.costPerComp || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Stage 4: CAC */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <UserCheck className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold text-base">Etapa 4: CAC (Custo por Cliente)</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {(() => {
                        const adsetsWithCAC = funnelData.byAdset
                          .filter(f => f.clientes > 0)
                          .map(f => {
                            const spend = spendMaps.adsetSpendByName.get(normName(f.adset)) || 0;
                            const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                            return { ...f, spend, cac };
                          })
                          .filter(f => f.cac !== null && f.cac > 0)
                          .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                        
                        if (adsetsWithCAC.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Layers className="h-4 w-4 text-green-500" />
                              <h4 className="font-medium text-sm">Top Conjuntos</h4>
                            </div>
                            <div className="space-y-2">
                              {adsetsWithCAC.slice(0, 5).map((item, index) => (
                                <div key={`cac-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.adset}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600 ml-2">
                                    {formatBRL(item.cac || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const adsWithCAC = funnelData.byAd
                          .filter(f => f.clientes > 0)
                          .map(f => {
                            const spend = spendMaps.adSpendByName.get(normName(f.ad)) || 0;
                            const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                            return { ...f, spend, cac };
                          })
                          .filter(f => f.cac !== null && f.cac > 0)
                          .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                        
                        if (adsWithCAC.length === 0) return null;
                        
                        return (
                          <div className="p-4 bg-lime-500/5 border border-lime-500/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <Megaphone className="h-4 w-4 text-lime-600" />
                              <h4 className="font-medium text-sm">Top Anúncios</h4>
                            </div>
                            <div className="space-y-2">
                              {adsWithCAC.slice(0, 5).map((item, index) => (
                                <div key={`cac-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-lime-500 text-white' : 'bg-lime-500/20 text-lime-600'}`}>
                                      {index + 1}
                                    </span>
                                    <span className="text-sm truncate">{item.ad}</span>
                                  </div>
                                  <Badge variant="outline" className="bg-lime-500/10 border-lime-500/30 text-lime-600 ml-2">
                                    {formatBRL(item.cac || 0)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recomendações */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Recomendações
              </CardTitle>
              <CardDescription>
                Sugestões para melhorar o desempenho das suas campanhas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {report.recommendations.map((rec, index) => (
                  <div key={index} className="flex gap-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary">
                      {index + 1}
                    </div>
                    <p className="text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Compare Dialog */}
      <AlertDialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-primary" />
              Comparar com relatório anterior?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você já possui um relatório gerado anteriormente. Deseja que o novo relatório inclua uma comparação com o anterior?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => generateReport(false)}>
              Não comparar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => generateReport(true)}>
              <GitCompare className="h-4 w-4 mr-2" />
              Comparar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
