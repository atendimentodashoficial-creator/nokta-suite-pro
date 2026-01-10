import { useState, useEffect, useMemo } from "react";
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
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, parseISO } from "date-fns";
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

export function AIReportsTab({ campaigns, selectedAccount }: AIReportsTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: allLeads } = useLeads();
  
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [report, setReport] = useState<AIReport | null>(null);
  const [storedReport, setStoredReport] = useState<StoredReport | null>(null);
  const [previousReport, setPreviousReport] = useState<StoredReport | null>(null);
  const [checkingApiKey, setCheckingApiKey] = useState(true);
  const [loadingStoredReport, setLoadingStoredReport] = useState(true);
  
  // Period selection - default to last 7 days
  const [periodFilter, setPeriodFilter] = useState("last_7_days");
  const [dateStart, setDateStart] = useState<Date>(subDays(new Date(), 7));
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  
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

  useEffect(() => {
    handlePeriodChange(periodFilter);
  }, [periodFilter]);

  const handlePeriodChange = (value: string) => {
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (value) {
      case "today":
        start = today;
        break;
      case "yesterday":
        start = subDays(today, 1);
        end = subDays(today, 1);
        break;
      case "last_7_days":
        start = subDays(today, 6);
        break;
      case "last_30_days":
        start = subDays(today, 29);
        break;
      case "this_week":
        start = startOfWeek(today, { weekStartsOn: 0 });
        end = endOfWeek(today, { weekStartsOn: 0 });
        break;
      case "last_week":
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 0 });
        start = lastWeekStart;
        end = endOfWeek(lastWeekStart, { weekStartsOn: 0 });
        break;
      case "this_month":
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case "last_month":
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case "max":
        start = new Date(2020, 0, 1);
        end = today;
        break;
      default:
        start = subDays(today, 6);
    }

    setDateStart(start);
    setDateEnd(end);
  };

  // Calculate funnel data for the selected period
  const funnelData = useMemo(() => {
    if (!allLeads) return null;

    const startDate = dateStart;
    const endDate = dateEnd;

    // Filter leads by period (using created_at)
    const leadsInPeriod = allLeads.filter(lead => {
      const leadDate = new Date(lead.created_at);
      return leadDate >= startDate && leadDate <= endDate;
    });

    // Separate tracked (from ads) vs untracked
    const trackedLeads = leadsInPeriod.filter(lead => 
      lead.utm_campaign || lead.fbclid || lead.utm_source
    );
    const untrackedLeads = leadsInPeriod.filter(lead => 
      !lead.utm_campaign && !lead.fbclid && !lead.utm_source
    );

    // Calculate funnel metrics
    const totalLeads = leadsInPeriod.length;
    const trackedCount = trackedLeads.length;
    const untrackedCount = untrackedLeads.length;

    // Get agendamentos for these leads
    const agendados = leadsInPeriod.filter(lead => 
      lead.data_agendamento !== null
    );
    const agendadosTracked = trackedLeads.filter(lead => lead.data_agendamento !== null).length;
    const agendadosUntracked = untrackedLeads.filter(lead => lead.data_agendamento !== null).length;

    // Comparecimentos (leads with data_comparecimento)
    const compareceu = leadsInPeriod.filter(lead => lead.data_comparecimento !== null);
    const compareceuTracked = trackedLeads.filter(lead => lead.data_comparecimento !== null).length;
    const compareceuUntracked = untrackedLeads.filter(lead => lead.data_comparecimento !== null).length;

    // Clientes (status = 'cliente')
    const clientes = leadsInPeriod.filter(lead => lead.status === 'cliente');
    const clientesTracked = trackedLeads.filter(lead => lead.status === 'cliente').length;
    const clientesUntracked = untrackedLeads.filter(lead => lead.status === 'cliente').length;

    // Valor fechado
    const valorTotal = clientes.reduce((sum, lead) => sum + (lead.valor_tratamento || 0), 0);
    const valorTracked = trackedLeads.filter(lead => lead.status === 'cliente')
      .reduce((sum, lead) => sum + (lead.valor_tratamento || 0), 0);
    const valorUntracked = untrackedLeads.filter(lead => lead.status === 'cliente')
      .reduce((sum, lead) => sum + (lead.valor_tratamento || 0), 0);

    // Em negociação
    const emNegociacao = leadsInPeriod.filter(lead => 
      lead.data_comparecimento !== null && lead.status !== 'cliente'
    );

    // Calculate conversion rates
    const taxaAgendamento = totalLeads > 0 ? (agendados.length / totalLeads) * 100 : 0;
    const taxaComparecimento = agendados.length > 0 ? (compareceu.length / agendados.length) * 100 : 0;
    const taxaFechamento = compareceu.length > 0 ? (clientes.length / compareceu.length) * 100 : 0;
    const taxaConversaoGeral = totalLeads > 0 ? (clientes.length / totalLeads) * 100 : 0;

    // Ticket médio
    const ticketMedio = clientes.length > 0 ? valorTotal / clientes.length : 0;

    // Group by campaign for analysis
    const byCampaign: Record<string, {
      campaign: string;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    // Group by adset for analysis
    const byAdset: Record<string, {
      adset: string;
      campaign: string;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    // Group by ad for analysis
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

    for (const lead of trackedLeads) {
      const campaign = lead.utm_campaign || lead.fb_campaign_name || 'Sem campanha';
      const adset = lead.fb_adset_name || 'Sem conjunto';
      const ad = lead.fb_ad_name || 'Sem anúncio';
      
      // Aggregate by campaign
      if (!byCampaign[campaign]) {
        byCampaign[campaign] = { campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
      }
      byCampaign[campaign].leads++;
      if (lead.data_agendamento) byCampaign[campaign].agendados++;
      if (lead.data_comparecimento) byCampaign[campaign].compareceu++;
      if (lead.status === 'cliente') {
        byCampaign[campaign].clientes++;
        byCampaign[campaign].valor += lead.valor_tratamento || 0;
      }

      // Aggregate by adset
      if (adset !== 'Sem conjunto') {
        const adsetKey = `${campaign}::${adset}`;
        if (!byAdset[adsetKey]) {
          byAdset[adsetKey] = { adset, campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
        }
        byAdset[adsetKey].leads++;
        if (lead.data_agendamento) byAdset[adsetKey].agendados++;
        if (lead.data_comparecimento) byAdset[adsetKey].compareceu++;
        if (lead.status === 'cliente') {
          byAdset[adsetKey].clientes++;
          byAdset[adsetKey].valor += lead.valor_tratamento || 0;
        }
      }

      // Aggregate by ad
      if (ad !== 'Sem anúncio') {
        const adKey = `${campaign}::${adset}::${ad}`;
        if (!byAd[adKey]) {
          byAd[adKey] = { ad, adset, campaign, leads: 0, agendados: 0, compareceu: 0, clientes: 0, valor: 0 };
        }
        byAd[adKey].leads++;
        if (lead.data_agendamento) byAd[adKey].agendados++;
        if (lead.data_comparecimento) byAd[adKey].compareceu++;
        if (lead.status === 'cliente') {
          byAd[adKey].clientes++;
          byAd[adKey].valor += lead.valor_tratamento || 0;
        }
      }
    }

    return {
      totals: {
        leads: totalLeads,
        leadsTracked: trackedCount,
        leadsUntracked: untrackedCount,
        agendados: agendados.length,
        agendadosTracked,
        agendadosUntracked,
        compareceu: compareceu.length,
        compareceuTracked,
        compareceuUntracked,
        emNegociacao: emNegociacao.length,
        clientes: clientes.length,
        clientesTracked,
        clientesUntracked,
        valorTotal,
        valorTracked,
        valorUntracked,
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
  }, [allLeads, dateStart, dateEnd]);

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
      }
    } catch (error) {
      console.error("Error loading stored report:", error);
    } finally {
      setLoadingStoredReport(false);
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
        results: "Mais Resultados",
        ctr: "Melhor CTR",
        cpc: "Menor CPC",
        cpm: "Menor CPM",
        cost_per_result: "Menor Custo/Resultado",
      };
      
      Object.entries(report.topPerformersByMetric as TopPerformersByMetric).forEach(([key, data]) => {
        const label = metricLabels[key] || key;
        addText(label, 12, true, [59, 130, 246]);
        
        if (data.campaigns?.length > 0) {
          addText("Campanhas:", 10, true);
          data.campaigns.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (R$ ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
          });
        }
        
        if (data.adsets?.length > 0) {
          addText("Conjuntos:", 10, true);
          data.adsets.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (R$ ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
          });
        }
        
        if (data.ads?.length > 0) {
          addText("Anúncios:", 10, true);
          data.ads.forEach((item, i) => {
            addText(`  ${i + 1}. ${item.name} - ${item.value} (R$ ${(item.spend || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`, 9);
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
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Relatório de IA</CardTitle>
                <CardDescription>
                  Análise inteligente de campanhas, conjuntos e anúncios
                </CardDescription>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                API Conectada
              </Badge>
              
              {/* Period Selector */}
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
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
                      <Button variant="outline" size="sm">
                        {format(dateStart, "dd/MM/yyyy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateStart}
                        onSelect={(date) => date && setDateStart(date)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {format(dateEnd, "dd/MM/yyyy", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateEnd}
                        onSelect={(date) => date && setDateEnd(date)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              
              <Button onClick={handleGenerateClick} disabled={loading || !selectedAccount}>
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
          </div>
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
                      results: { title: 'Mais Resultados', description: 'Campanhas, conjuntos e anúncios com mais conversões' },
                      ctr: { title: 'Melhor CTR', description: 'Maior taxa de cliques (engajamento)' },
                      cpc: { title: 'Menor CPC', description: 'Custo por clique mais eficiente' },
                      cpm: { title: 'Menor CPM', description: 'Custo por mil impressões mais baixo' },
                      cost_per_result: { title: 'Menor Custo/Resultado', description: 'Melhor eficiência de conversão' },
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

          {/* Top Performers by Funnel */}
          {funnelData && funnelData.byCampaign.length > 0 && (
            <Card className="border-amber-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-amber-500" />
                  Melhores Desempenhos por Funil (Dados Rastreados)
                </CardTitle>
                <CardDescription>
                  Campanhas ranqueadas pela eficiência de conversão no funil real
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Top by Conversion Rate (Lead → Cliente) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <h4 className="font-medium">Melhor Taxa de Conversão (Lead → Cliente)</h4>
                    </div>
                    <div className="grid gap-2">
                      {[...funnelData.byCampaign]
                        .filter(c => c.leads >= 3)
                        .sort((a, b) => {
                          const rateA = a.leads > 0 ? (a.clientes / a.leads) * 100 : 0;
                          const rateB = b.leads > 0 ? (b.clientes / b.leads) * 100 : 0;
                          return rateB - rateA;
                        })
                        .slice(0, 5)
                        .map((item, index) => {
                          const convRate = item.leads > 0 ? ((item.clientes / item.leads) * 100).toFixed(1) : '0';
                          return (
                            <div key={item.campaign} className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-600'}`}>
                                  {index + 1}
                                </span>
                                <span className="font-medium text-sm truncate max-w-[200px]">{item.campaign}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">{item.leads} leads → {item.clientes} clientes</span>
                                <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600">
                                  {convRate}%
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Top by Number of Clients */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <UserCheck className="h-4 w-4 text-green-500" />
                      <h4 className="font-medium">Mais Clientes Gerados</h4>
                    </div>
                    <div className="grid gap-2">
                      {[...funnelData.byCampaign]
                        .filter(c => c.clientes > 0)
                        .sort((a, b) => b.clientes - a.clientes)
                        .slice(0, 5)
                        .map((item, index) => (
                          <div key={item.campaign} className="flex items-center justify-between p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-600'}`}>
                                {index + 1}
                              </span>
                              <span className="font-medium text-sm truncate max-w-[200px]">{item.campaign}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">{item.leads} leads</span>
                              <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600">
                                {item.clientes} clientes
                              </Badge>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Top by Revenue */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Handshake className="h-4 w-4 text-blue-500" />
                      <h4 className="font-medium">Maior Faturamento</h4>
                    </div>
                    <div className="grid gap-2">
                      {[...funnelData.byCampaign]
                        .filter(c => c.valor > 0)
                        .sort((a, b) => b.valor - a.valor)
                        .slice(0, 5)
                        .map((item, index) => (
                          <div key={item.campaign} className="flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-600'}`}>
                                {index + 1}
                              </span>
                              <span className="font-medium text-sm truncate max-w-[200px]">{item.campaign}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">{item.clientes} clientes</span>
                              <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-600">
                                R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </Badge>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Top by Attendance Rate */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-4 w-4 text-purple-500" />
                      <h4 className="font-medium">Melhor Taxa de Comparecimento</h4>
                    </div>
                    <div className="grid gap-2">
                      {[...funnelData.byCampaign]
                        .filter(c => c.agendados >= 3)
                        .sort((a, b) => {
                          const rateA = a.agendados > 0 ? (a.compareceu / a.agendados) * 100 : 0;
                          const rateB = b.agendados > 0 ? (b.compareceu / b.agendados) * 100 : 0;
                          return rateB - rateA;
                        })
                        .slice(0, 5)
                        .map((item, index) => {
                          const attendRate = item.agendados > 0 ? ((item.compareceu / item.agendados) * 100).toFixed(1) : '0';
                          return (
                            <div key={item.campaign} className="flex items-center justify-between p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-purple-500 text-white' : 'bg-purple-500/20 text-purple-600'}`}>
                                  {index + 1}
                                </span>
                                <span className="font-medium text-sm truncate max-w-[200px]">{item.campaign}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-muted-foreground">{item.agendados} agendados → {item.compareceu} compareceu</span>
                                <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-600">
                                  {attendRate}%
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Performers by Funnel Stage */}
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
                    
                    {/* Section: Top Results */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Mais Resultados</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Top Adsets by Leads */}
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
                        {/* Top Ads by Leads */}
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
                    
                    {/* Section: Best Cost per Result */}
                    {adsSpendData.adsets.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Melhor Custo por Lead</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Best CPL Adsets */}
                          {(() => {
                            const adsetsWithCPL = funnelData.byAdset
                              .filter(f => f.leads > 0)
                              .map(f => {
                                const spendData = adsSpendData.adsets.find(a => a.adset_name === f.adset);
                                const spend = spendData?.spend || 0;
                                const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                                return { ...f, spend, cpl };
                              })
                              .filter(f => f.cpl !== null && f.cpl > 0)
                              .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                            
                            if (adsetsWithCPL.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="h-4 w-4 text-emerald-500" />
                                  <h4 className="font-medium text-sm">Top Conjuntos</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsetsWithCPL.slice(0, 5).map((item, index) => (
                                    <div key={`cpl-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 ml-2">
                                        R$ {item.cpl?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Best CPL Ads */}
                          {(() => {
                            const adsWithCPL = funnelData.byAd
                              .filter(f => f.leads > 0)
                              .map(f => {
                                const spendData = adsSpendData.ads.find(a => a.ad_name === f.ad);
                                const spend = spendData?.spend || 0;
                                const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                                return { ...f, spend, cpl };
                              })
                              .filter(f => f.cpl !== null && f.cpl > 0)
                              .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                            
                            if (adsWithCPL.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Megaphone className="h-4 w-4 text-teal-500" />
                                  <h4 className="font-medium text-sm">Top Anúncios</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsWithCPL.slice(0, 5).map((item, index) => (
                                    <div key={`cpl-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-teal-500 text-white' : 'bg-teal-500/20 text-teal-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600 ml-2">
                                        R$ {item.cpl?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stage 2: Agendamentos */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <Calendar className="h-5 w-5 text-amber-500" />
                      <h3 className="font-semibold text-base">Etapa 2: Agendamentos</h3>
                    </div>
                    
                    {/* Section: Top Results */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Mais Resultados</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Top Adsets by Agendamentos */}
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
                                .map((item, index) => {
                                  const rate = item.leads > 0 ? ((item.agendados / item.leads) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600">
                                          {item.agendados}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                        {/* Top Ads by Agendamentos */}
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
                                .map((item, index) => {
                                  const rate = item.leads > 0 ? ((item.agendados / item.leads) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-600">
                                          {item.agendados}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Section: Best Cost per Agendamento */}
                    {adsSpendData.adsets.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Melhor Custo por Agendamento</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Best CPA Adsets */}
                          {(() => {
                            const adsetsWithCPA = funnelData.byAdset
                              .filter(f => f.agendados > 0)
                              .map(f => {
                                const spendData = adsSpendData.adsets.find(a => a.adset_name === f.adset);
                                const spend = spendData?.spend || 0;
                                const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                                return { ...f, spend, cpa };
                              })
                              .filter(f => f.cpa !== null && f.cpa > 0)
                              .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                            
                            if (adsetsWithCPA.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="h-4 w-4 text-yellow-600" />
                                  <h4 className="font-medium text-sm">Top Conjuntos</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsetsWithCPA.slice(0, 5).map((item, index) => (
                                    <div key={`cpa-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-yellow-500 text-white' : 'bg-yellow-500/20 text-yellow-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/30 text-yellow-600 ml-2">
                                        R$ {item.cpa?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Best CPA Ads */}
                          {(() => {
                            const adsWithCPA = funnelData.byAd
                              .filter(f => f.agendados > 0)
                              .map(f => {
                                const spendData = adsSpendData.ads.find(a => a.ad_name === f.ad);
                                const spend = spendData?.spend || 0;
                                const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                                return { ...f, spend, cpa };
                              })
                              .filter(f => f.cpa !== null && f.cpa > 0)
                              .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                            
                            if (adsWithCPA.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-amber-600/5 border border-amber-600/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Megaphone className="h-4 w-4 text-amber-600" />
                                  <h4 className="font-medium text-sm">Top Anúncios</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsWithCPA.slice(0, 5).map((item, index) => (
                                    <div key={`cpa-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-amber-600 text-white' : 'bg-amber-600/20 text-amber-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-amber-600/10 border-amber-600/30 text-amber-600 ml-2">
                                        R$ {item.cpa?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stage 3: Comparecimentos */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <CheckCircle2 className="h-5 w-5 text-teal-500" />
                      <h3 className="font-semibold text-base">Etapa 3: Comparecimentos</h3>
                    </div>
                    
                    {/* Section: Top Results */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Mais Resultados</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Top Adsets by Comparecimentos */}
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
                                .map((item, index) => {
                                  const rate = item.agendados > 0 ? ((item.compareceu / item.agendados) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-teal-500 text-white' : 'bg-teal-500/20 text-teal-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600">
                                          {item.compareceu}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                        {/* Top Ads by Comparecimentos */}
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
                                .map((item, index) => {
                                  const rate = item.agendados > 0 ? ((item.compareceu / item.agendados) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600">
                                          {item.compareceu}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Section: Best Cost per Comparecimento */}
                    {adsSpendData.adsets.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Melhor Custo por Comparecimento</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Best CPC Adsets */}
                          {(() => {
                            const adsetsWithCPC = funnelData.byAdset
                              .filter(f => f.compareceu > 0)
                              .map(f => {
                                const spendData = adsSpendData.adsets.find(a => a.adset_name === f.adset);
                                const spend = spendData?.spend || 0;
                                const cpc = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                                return { ...f, spend, cpc };
                              })
                              .filter(f => f.cpc !== null && f.cpc > 0)
                              .sort((a, b) => (a.cpc || 0) - (b.cpc || 0));
                            
                            if (adsetsWithCPC.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="h-4 w-4 text-cyan-600" />
                                  <h4 className="font-medium text-sm">Top Conjuntos</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsetsWithCPC.slice(0, 5).map((item, index) => (
                                    <div key={`cpc-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-cyan-500 text-white' : 'bg-cyan-500/20 text-cyan-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-cyan-500/10 border-cyan-500/30 text-cyan-600 ml-2">
                                        R$ {item.cpc?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Best CPC Ads */}
                          {(() => {
                            const adsWithCPC = funnelData.byAd
                              .filter(f => f.compareceu > 0)
                              .map(f => {
                                const spendData = adsSpendData.ads.find(a => a.ad_name === f.ad);
                                const spend = spendData?.spend || 0;
                                const cpc = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                                return { ...f, spend, cpc };
                              })
                              .filter(f => f.cpc !== null && f.cpc > 0)
                              .sort((a, b) => (a.cpc || 0) - (b.cpc || 0));
                            
                            if (adsWithCPC.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Megaphone className="h-4 w-4 text-sky-600" />
                                  <h4 className="font-medium text-sm">Top Anúncios</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsWithCPC.slice(0, 5).map((item, index) => (
                                    <div key={`cpc-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-sky-500 text-white' : 'bg-sky-500/20 text-sky-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-sky-500/10 border-sky-500/30 text-sky-600 ml-2">
                                        R$ {item.cpc?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stage 4: Clientes */}
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                      <UserCheck className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold text-base">Etapa 4: Clientes Fechados</h3>
                    </div>
                    
                    {/* Section: Top Results */}
                    <div className="mb-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Mais Resultados</p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Top Adsets by Clientes */}
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
                                .map((item, index) => {
                                  const rate = item.leads > 0 ? ((item.clientes / item.leads) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-green-500 text-white' : 'bg-green-500/20 text-green-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600">
                                          {item.clientes} · R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                        {/* Top Ads by Clientes */}
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
                                .map((item, index) => {
                                  const rate = item.leads > 0 ? ((item.clientes / item.leads) * 100).toFixed(0) : '0';
                                  return (
                                    <div key={`${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-lime-500 text-white' : 'bg-lime-500/20 text-lime-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <div className="flex items-center gap-2 ml-2">
                                        <span className="text-xs text-muted-foreground">{rate}%</span>
                                        <Badge variant="outline" className="bg-lime-500/10 border-lime-500/30 text-lime-600">
                                          {item.clientes} · R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Section: Best CAC (Cost per Cliente) */}
                    {adsSpendData.adsets.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Melhor CAC (Custo por Cliente)</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Best CAC Adsets */}
                          {(() => {
                            const adsetsWithCAC = funnelData.byAdset
                              .filter(f => f.clientes > 0)
                              .map(f => {
                                const spendData = adsSpendData.adsets.find(a => a.adset_name === f.adset);
                                const spend = spendData?.spend || 0;
                                const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                                return { ...f, spend, cac };
                              })
                              .filter(f => f.cac !== null && f.cac > 0)
                              .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                            
                            if (adsetsWithCAC.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Layers className="h-4 w-4 text-indigo-600" />
                                  <h4 className="font-medium text-sm">Top Conjuntos</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsetsWithCAC.slice(0, 5).map((item, index) => (
                                    <div key={`cac-${item.campaign}-${item.adset}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-indigo-500 text-white' : 'bg-indigo-500/20 text-indigo-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.adset}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-indigo-500/10 border-indigo-500/30 text-indigo-600 ml-2">
                                        R$ {item.cac?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {/* Best CAC Ads */}
                          {(() => {
                            const adsWithCAC = funnelData.byAd
                              .filter(f => f.clientes > 0)
                              .map(f => {
                                const spendData = adsSpendData.ads.find(a => a.ad_name === f.ad);
                                const spend = spendData?.spend || 0;
                                const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                                return { ...f, spend, cac };
                              })
                              .filter(f => f.cac !== null && f.cac > 0)
                              .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                            
                            if (adsWithCAC.length === 0) return null;
                            
                            return (
                              <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                  <Megaphone className="h-4 w-4 text-violet-600" />
                                  <h4 className="font-medium text-sm">Top Anúncios</h4>
                                </div>
                                <div className="space-y-2">
                                  {adsWithCAC.slice(0, 5).map((item, index) => (
                                    <div key={`cac-${item.campaign}-${item.adset}-${item.ad}`} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-violet-500 text-white' : 'bg-violet-500/20 text-violet-600'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="text-sm truncate">{item.ad}</span>
                                      </div>
                                      <Badge variant="outline" className="bg-violet-500/10 border-violet-500/30 text-violet-600 ml-2">
                                        R$ {item.cac?.toFixed(2)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
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
