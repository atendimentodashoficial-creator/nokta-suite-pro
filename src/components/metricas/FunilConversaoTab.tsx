import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  HelpCircle,
  Layers,
  Settings2,
  Send
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
import { FunnelColumnOrderDialog, FUNNEL_COLUMNS, DEFAULT_FUNNEL_COLUMN_ORDER } from "./FunnelColumnOrderDialog";
import { useMetricasPreferencias, type FunnelColumnKey } from "@/hooks/useMetricasPreferencias";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface FunnelData {
  campaign_id: string | null;
  campaign_name: string;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  leads: number;
  agendados: number;
  compareceu: number;
  nao_compareceu: number;
  em_negociacao: number;
  clientes: number;
  valor_fechado: number;
}

interface FunnelQueryResult {
  data: FunnelData[];
  /**
   * Sempre calculado por campanha, independente do "Agrupar por".
   * Usado para calcular totais e badges de rastreamento.
   */
  dataByCampaign: FunnelData[];
  /**
   * Sempre calculado, independente do "Agrupar por".
   * Usado nos quadros "Melhores Desempenhos" e "Melhor Custo".
   */
  dataByAdset: FunnelData[];
  dataByAd: FunnelData[];
  totalRecords: number;
  uniqueContacts: number;
  // Contadores de eventos de leads que vieram originalmente de "Disparos"
  viaDisparos: {
    leads: number;
    agendados: number;
    compareceu: number;
    nao_compareceu: number;
    em_negociacao: number;
    clientes: number;
    valor_fechado: number;
  };
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

// Componente para exibir item de Conjunto com popover estilo LeadCampaignBadge
interface AdsetItemProps {
  item: { adset: string; campaign: string };
  index: number;
  numberBgClass: string;
  numberBgInactiveClass: string;
  numberTextClass: string;
  badge: React.ReactNode;
}

function AdsetItem({ item, index, numberBgClass, numberBgInactiveClass, numberTextClass, badge }: AdsetItemProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center justify-between p-2 bg-background/50 rounded-lg cursor-pointer hover:bg-background/80 transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? `${numberBgClass} text-white` : `${numberBgInactiveClass} ${numberTextClass}`}`}>
              {index + 1}
            </span>
            <span className="text-sm truncate">{item.adset}</span>
          </div>
          {badge}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] sm:w-80 p-0"
        align="start"
        sideOffset={6}
        collisionPadding={12}
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b bg-background">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">Detalhes do Conjunto</span>
          </div>
          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Conjunto de Anúncios:</span>
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-2">
                <span className="text-xs font-semibold text-green-700 dark:text-green-300 break-words">
                  {item.adset}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Campanha:</span>
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-2">
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 break-words">
                  {item.campaign}
                </span>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Componente para exibir item de Anúncio com popover estilo LeadCampaignBadge
interface AdItemProps {
  item: { ad: string; adset: string; campaign: string; ad_id?: string | null };
  index: number;
  numberBgClass: string;
  numberBgInactiveClass: string;
  numberTextClass: string;
  badge: React.ReactNode;
  thumbnailUrl?: string;
  adText?: string;
}

function AdItem({ item, index, numberBgClass, numberBgInactiveClass, numberTextClass, badge, thumbnailUrl, adText }: AdItemProps) {
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  
  const shouldTruncateText = adText && adText.length > 150;
  const displayText = shouldTruncateText && !isTextExpanded 
    ? adText.substring(0, 150) + "..." 
    : adText;
  
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center justify-between p-2 bg-background/50 rounded-lg cursor-pointer hover:bg-background/80 transition-colors">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? `${numberBgClass} text-white` : `${numberBgInactiveClass} ${numberTextClass}`}`}>
                {index + 1}
              </span>
              <span className="text-sm truncate">{item.ad}</span>
            </div>
            {badge}
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] sm:w-80 p-0"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <div className="flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-2 p-3 border-b bg-background shrink-0">
              <Megaphone className="w-4 h-4 text-purple-500" />
              <span className="font-semibold text-sm">Detalhes do Anúncio</span>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto">
              {thumbnailUrl && (
                <div 
                  className="relative group cursor-pointer" 
                  onClick={() => setIsImageModalOpen(true)}
                >
                  <img
                    src={thumbnailUrl}
                    alt="Preview do anúncio"
                    className="w-full h-auto max-h-40 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Anúncio:</span>
                <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-2">
                  <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 break-words">
                    {item.ad}
                  </span>
                </div>
              </div>
              {adText && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Texto do Anúncio:</span>
                  <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-md p-2">
                    <span className="text-xs text-purple-700 dark:text-purple-300 break-words whitespace-pre-wrap">
                      {displayText}
                    </span>
                    {shouldTruncateText && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTextExpanded(!isTextExpanded);
                        }}
                        className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-1 block"
                      >
                        {isTextExpanded ? "Ver menos" : "Ver mais"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Conjunto de Anúncios:</span>
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-2">
                  <span className="text-xs font-semibold text-green-700 dark:text-green-300 break-words">
                    {item.adset}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Campanha:</span>
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-2">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 break-words">
                    {item.campaign}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {thumbnailUrl && (
        <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-purple-500" />
                Imagem do Anúncio
              </DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <img
                src={thumbnailUrl}
                alt="Imagem do anúncio em tamanho completo"
                className="w-full h-auto rounded-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function FunilConversaoTab() {
  const { user } = useAuth();
  const { funnelColumnOrder, updateFunnelColumnOrder } = useMetricasPreferencias();
  const [periodFilter, setPeriodFilter] = useState("last_30_days");
  const [dateStart, setDateStart] = useState<Date>(subDays(new Date(), 29));
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const [calendarStartOpen, setCalendarStartOpen] = useState(false);
  const [calendarEndOpen, setCalendarEndOpen] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [viewLevel, setViewLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [selectedFunnel, setSelectedFunnel] = useState<SelectedFunnelData | null>(null);
  const [funnelDialogOpen, setFunnelDialogOpen] = useState(false);
  const [columnOrderDialogOpen, setColumnOrderDialogOpen] = useState(false);
  
  // Ordem das colunas (usa o salvo ou padrão)
  const columnOrder = funnelColumnOrder || DEFAULT_FUNNEL_COLUMN_ORDER;
  
  // State for expanding top performers lists
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

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

  // Chave de deduplicação compatível com a aba Leads:
  // usa os últimos 8 dígitos para unificar números com variações (DDD, 55, formatação)
  const phoneKey = (phone: string): string => {
    const n = normalizePhone(phone);
    return n.length > 8 ? n.slice(-8) : n;
  };

  // Buscar dados do funil
  const { data: funnelResult, isLoading: loadingFunnel } = useQuery({
    queryKey: ["funnel-data", user?.id, dateStart, dateEnd, viewLevel],
    queryFn: async (): Promise<FunnelQueryResult> => {
      if (!user?.id) return { data: [], dataByCampaign: [], dataByAdset: [], dataByAd: [], totalRecords: 0, uniqueContacts: 0, viaDisparos: { leads: 0, agendados: 0, compareceu: 0, nao_compareceu: 0, em_negociacao: 0, clientes: 0, valor_fechado: 0 } };

      // Construir limites do período usando timezone LOCAL (igual à aba Leads)
      // Isso garante que as datas filtradas na UI coincidam com os resultados
      const startOfPeriod = new Date(
        dateStart.getFullYear(),
        dateStart.getMonth(),
        dateStart.getDate(),
        0,
        0,
        0,
        0
      );
      const endOfPeriod = new Date(
        dateEnd.getFullYear(),
        dateEnd.getMonth(),
        dateEnd.getDate(),
        23,
        59,
        59,
        999
      );

      const isWithinPeriod = (createdAt: string | null) => {
        if (!createdAt) return false;
        // Parse UTC timestamp e deixa o JavaScript converter para timezone local
        const d = new Date(createdAt);
        return d >= startOfPeriod && d <= endOfPeriod;
      };

      // Helper para contornar o limite padrão de 1000 linhas (importante no filtro "Máximo")
      const fetchAll = async <T,>(opts: {
        table: "leads" | "agendamentos" | "faturas";
        select: string;
        orderBy: string;
        filters: (q: any) => any;
      }): Promise<T[]> => {
        const pageSize = 1000;
        let from = 0;
        const out: T[] = [];

        // Loop de paginação por range
        // (Supabase impõe limite padrão de 1000 por request)
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const to = from + pageSize - 1;
          const base = supabase
            .from(opts.table)
            .select(opts.select)
            .order(opts.orderBy, { ascending: true })
            .range(from, to);

          const { data, error: pageError } = await opts.filters(base);
          if (pageError) throw pageError;

          const page = (data || []) as T[];
          out.push(...page);

          if (page.length < pageSize) break;
          from += pageSize;
        }

        return out;
      };

      // Buscar TODOS os leads do usuário para poder unificar por telefone
      const allLeads = await fetchAll<{
        id: string;
        nome: string;
        telefone: string;
        status: any;
        fb_campaign_id: string | null;
        fb_campaign_name: string | null;
        fb_adset_id: string | null;
        fb_adset_name: string | null;
        fb_ad_id: string | null;
        fb_ad_name: string | null;
        fbclid: string | null;
        gclid: string | null;
        utm_source: string | null;
        data_contato: string | null;
        created_at: string | null;
        updated_at: string | null;
        valor_tratamento: number | null;
        origem: string | null;
      }>({
        table: "leads",
        select: `
          id,
          nome,
          telefone,
          status,
          fb_campaign_id,
          fb_campaign_name,
          fb_adset_id,
          fb_adset_name,
          fb_ad_id,
          fb_ad_name,
          fbclid,
          gclid,
          utm_source,
          data_contato,
          created_at,
          updated_at,
          valor_tratamento,
          origem
        `,
        orderBy: "created_at",
        filters: (q) => q.eq("user_id", user.id).is("deleted_at", null),
      });

      // Mesma lógica da aba Leads: origem vazia, null ou "whatsapp" = Lead WhatsApp
      // Isso garante que o funil mostre os mesmos leads que aparecem na aba Leads
      // Leads com origem "disparos" são excluídos (campanhas de massa)
      const isWhatsAppLead = (origem: string | null) => {
        const o = (origem || "").toLowerCase();
        // Origem vazia/null = lead cadastrado manualmente ou via webhook sem origem específica
        // Origem "whatsapp" = lead explicitamente do WhatsApp
        // Ambos devem contar como leads da aba Leads
        return o === "whatsapp" || o === "";
      };

      // Lead "oficial" por telefone = primeiro cadastro (mais antigo).
      // Assim o lead pertence à aba de origem onde foi cadastrado.
      // IMPORTANTE: usamos phoneKey (últimos 8 dígitos) para bater com a aba Leads.
      const firstLeadByPhone: Record<string, (typeof allLeads)[number]> = {};
      (allLeads || []).forEach((lead) => {
        const phone = phoneKey(lead.telefone);
        const existing = firstLeadByPhone[phone];
        if (!existing) {
          firstLeadByPhone[phone] = lead;
          return;
        }
        const existingTime = new Date(existing.created_at || 0).getTime();
        const nextTime = new Date(lead.created_at || 0).getTime();
        if (Number.isFinite(nextTime) && nextTime < existingTime) {
          firstLeadByPhone[phone] = lead;
        }
      });

      const primaryLeads = Object.values(firstLeadByPhone);

      // Criar mapa de cliente_id para telefone (chave) normalizado
      const clienteIdToPhone: Record<string, string> = {};
      (allLeads || []).forEach((lead) => {
        clienteIdToPhone[lead.id] = phoneKey(lead.telefone);
      });

      // Buscar TODOS os agendamentos do usuário com status
      const agendamentos = await fetchAll<{
        cliente_id: string;
        status: any;
        created_at: string;
        data_agendamento: string;
      }>({
        table: "agendamentos",
        select: "cliente_id, status, created_at, data_agendamento",
        orderBy: "created_at",
        filters: (q) => q.eq("user_id", user.id),
      });

      // Buscar TODAS as faturas para identificar etapas do funil
      // Incluímos updated_at para saber QUANDO a fatura foi fechada (não apenas criada)
      const faturas = await fetchAll<{
        id: string;
        valor: number;
        status: any;
        cliente_id: string;
        created_at: string;
        updated_at: string;
      }>({
        table: "faturas",
        select: "id, valor, status, cliente_id, created_at, updated_at",
        orderBy: "created_at",
        filters: (q) => q.eq("user_id", user.id),
      });

      // Helper: timestamp (ms) dentro do período, ou null
      const periodTs = (iso: string | null | undefined) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return d >= startOfPeriod && d <= endOfPeriod ? d.getTime() : null;
      };

      // Identificar telefones que tiveram AGENDAMENTO no período
      // IMPORTANTE: Agendamentos "cancelado" representam "não compareceu" e DEVEM ser contados
      // na etapa de Agendados (com flag de não compareceu), não excluídos
      const phonesWithAgendamentoInPeriod = new Set<string>();
      const phonesWithAgendamentoInPeriodForStage = new Set<string>();
      const phonesWithNaoCompareceuInPeriod = new Set<string>();
      const agendamentoTsByPhone: Record<string, number> = {};

      agendamentos?.forEach((a) => {
        if (!a.cliente_id) return;

        const phone = clienteIdToPhone[a.cliente_id];
        if (!phone) return;

        const ts = periodTs(a.created_at || (a as any).data_agendamento);
        if (ts === null) return;

        // Todos os agendamentos (incluindo cancelados/não compareceu) contam para a etapa
        phonesWithAgendamentoInPeriod.add(phone);
        phonesWithAgendamentoInPeriodForStage.add(phone);

        // Marcar se é não compareceu (status cancelado)
        if (a.status === "cancelado") {
          phonesWithNaoCompareceuInPeriod.add(phone);
        }

        // Guardar o primeiro agendamento (criado) dentro do período
        if (agendamentoTsByPhone[phone] === undefined || ts < agendamentoTsByPhone[phone]) {
          agendamentoTsByPhone[phone] = ts;
        }
      });

      // Identificar telefones que tiveram fatura ATIVA no período
      // - Negociação: usa created_at (quando a fatura foi criada/entrou em negociação)
      // - Fechado: usa updated_at (quando a fatura foi fechada)
      const phonesWithFaturaInPeriod = new Set<string>();
      const phonesWithFaturaNegociacaoInPeriod = new Set<string>();
      const phonesWithFaturaFechadaInPeriod = new Set<string>();
      const faturaPorClienteInPeriod: Record<string, number> = {};
      const faturaNegociacaoTsByPhone: Record<string, number> = {};
      const faturaFechadaTsByPhone: Record<string, number> = {};

      faturas?.forEach((f) => {
        if (!f.cliente_id) return;
        // Ignorar faturas canceladas (se houver esse status)
        if (f.status === "cancelado" || f.status === "deletado") return;

        const phone = clienteIdToPhone[f.cliente_id];
        if (!phone) return;

        // Para negociação: quando a fatura foi CRIADA
        const tsCreated = periodTs(f.created_at);
        // Para fechado: quando a fatura foi ATUALIZADA (momento do fechamento)
        const tsClosed = periodTs(f.updated_at);

        // Fatura entra no período se foi criada OU fechada no período
        if (tsCreated !== null || tsClosed !== null) {
          phonesWithFaturaInPeriod.add(phone);
        }

        // Status atual da fatura determina a etapa
        if (f.status === "negociacao" && tsCreated !== null) {
          phonesWithFaturaNegociacaoInPeriod.add(phone);
          if (faturaNegociacaoTsByPhone[phone] === undefined || tsCreated < faturaNegociacaoTsByPhone[phone]) {
            faturaNegociacaoTsByPhone[phone] = tsCreated;
          }
        }
        
        if (f.status === "fechado") {
          // Para fechado, usamos a data de FECHAMENTO (updated_at)
          // Se updated_at não está no período mas created_at está, ainda contamos
          const tsForFechado = tsClosed ?? tsCreated;
          if (tsForFechado !== null) {
            phonesWithFaturaFechadaInPeriod.add(phone);
            faturaPorClienteInPeriod[f.cliente_id] = (faturaPorClienteInPeriod[f.cliente_id] || 0) + f.valor;
            if (faturaFechadaTsByPhone[phone] === undefined || tsForFechado < faturaFechadaTsByPhone[phone]) {
              faturaFechadaTsByPhone[phone] = tsForFechado;
            }
          }
        }
      });

      // Telefones WhatsApp (para excluir "Disparos-only")
      const hasWhatsAppByPhone: Record<string, boolean> = {};
      // Rastrear origem primária por telefone (primeiro registro)
      const primaryOriginByPhone: Record<string, string> = {};
      (allLeads || []).forEach((l) => {
        const phone = phoneKey(l.telefone);
        if (isWhatsAppLead(l.origem)) hasWhatsAppByPhone[phone] = true;
        
        // Guardar origem do primeiro registro (primário)
        if (!primaryOriginByPhone[phone]) {
          primaryOriginByPhone[phone] = (l.origem || "whatsapp").toLowerCase();
        }
      });

      // =============================================================================
      // LÓGICA DO FUNIL: separar contagem de LEADS da contagem de EVENTOS
      // - Leads: contados apenas se criados no período com atribuição de anúncio
      // - Agendamentos/Faturas: contados se o evento foi criado no período,
      //   independente de quando o lead foi criado (desde que tenha atribuição)
      // =============================================================================

      const hasAdsAttribution = (lead: (typeof allLeads)[number]) => {
        const src = (lead.utm_source || "").toLowerCase();
        return Boolean(
          lead.fb_campaign_name ||
            lead.fbclid ||
            lead.gclid ||
            src === "facebook" ||
            src === "instagram" ||
            src === "meta" ||
            src === "google" ||
            src === "adwords"
        );
      };

      // Telefones com QUALQUER lead WhatsApp com atribuição (para eventos)
      const phonesWithAttribution = new Set<string>();
      (allLeads || []).forEach((lead) => {
        const phone = phoneKey(lead.telefone);
        if (isWhatsAppLead(lead.origem) && hasAdsAttribution(lead)) {
          phonesWithAttribution.add(phone);
        }
      });

      // Telefones com lead WhatsApp "OFICIAL" CRIADO NO PERÍODO (para contagem de leads)
      // IMPORTANTE: deve bater com a aba Leads, que mostra 1 registro por telefone (os últimos 8 dígitos).
      // Então, um telefone que já existia antes e teve novo registro hoje NÃO deve contar como "lead de hoje".
      const phonesWithLeadInPeriod = new Set<string>();

      // Telefones cujo lead PRIMÁRIO (primeiro registro) é de "Disparos" e foi criado no período
      // (usado para exibir a etiqueta "via Disparos" no card de Leads)
      const phonesWithDisparosLeadInPeriod = new Set<string>();

      // Telefones cujo PRIMEIRO lead WhatsApp (na história) foi criado no período
      // (mesma regra da aba Leads: um telefone que já existia no WhatsApp antes do período não conta como lead novo)
      // IMPORTANT: independe do lead primário (que pode ser "disparos").
      const firstWhatsAppLeadOverallByPhone: Record<string, (typeof allLeads)[number]> = {};
      (allLeads || []).forEach((l) => {
        if (!isWhatsAppLead(l.origem)) return;
        const phone = phoneKey(l.telefone);
        const existing = firstWhatsAppLeadOverallByPhone[phone];
        if (!existing) {
          firstWhatsAppLeadOverallByPhone[phone] = l;
          return;
        }
        const existingTs = new Date(existing.created_at || 0).getTime();
        const nextTs = new Date(l.created_at || 0).getTime();
        if (Number.isFinite(nextTs) && nextTs < existingTs) {
          firstWhatsAppLeadOverallByPhone[phone] = l;
        }
      });

      Object.values(firstWhatsAppLeadOverallByPhone).forEach((firstWa) => {
        if (isWithinPeriod(firstWa.created_at)) {
          phonesWithLeadInPeriod.add(phoneKey(firstWa.telefone));
        }
      });

      // Telefones cujo lead PRIMÁRIO é Disparos e o cadastro primário aconteceu no período
      // (isso evita marcar como "via Disparos" telefones que só tiveram disparos depois)
      Object.values(firstLeadByPhone).forEach((primaryLead) => {
        const phone = phoneKey(primaryLead.telefone);
        const origem = (primaryLead.origem || "").toLowerCase();
        if (origem === "disparos" && isWithinPeriod(primaryLead.created_at)) {
          phonesWithDisparosLeadInPeriod.add(phone);
        }
      });

      // O "phonesInPeriod" inclui:
      // - TODOS os leads WhatsApp criados no período
      // - TODOS os leads cujo primário é Disparos criados no período (para o Funil bater com a aba Leads)
      // - Phones com eventos no período (agendamento/fatura)
      const phonesInPeriod = new Set<string>([
        ...Array.from(phonesWithLeadInPeriod),
        ...Array.from(phonesWithDisparosLeadInPeriod),
      ]);
      
      // Adicionar phones que tiveram agendamento no período (WhatsApp OU Disparos)
      phonesWithAgendamentoInPeriod.forEach((p) => {
        phonesInPeriod.add(p);
      });
      // Adicionar phones que tiveram fatura no período (WhatsApp OU Disparos)
      phonesWithFaturaInPeriod.forEach((p) => {
        phonesInPeriod.add(p);
      });

      // Mapa rápido de lead por id
      const leadById: Record<string, (typeof allLeads)[number]> = {};
      (allLeads || []).forEach((l) => {
        leadById[l.id] = l;
      });

      // Helper: timestamp seguro (ms)
      const safeTs = (iso: string | null | undefined) => {
        if (!iso) return null;
        const d = new Date(iso);
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
      };

      // Timestamp de atribuição = quando o LEAD foi CRIADO (não updated_at!)
      // O created_at representa quando o contato chegou, que é o momento correto para
      // associar a atribuição com eventos futuros (agendamento, fatura).
      // NÃO usar updated_at pois o enriquecimento pode acontecer depois do evento.
      const attributionTs = (l: (typeof allLeads)[number]) =>
        safeTs(l.created_at) ?? 0;

      // Melhor atribuição disponível por telefone (fallback)
      // Escolhe a atribuição mais recente para aquele telefone.
      const bestCampaignByPhone: Record<
        string,
        {
          fb_campaign_id: string | null;
          fb_campaign_name: string | null;
          fb_adset_id: string | null;
          fb_adset_name: string | null;
          fb_ad_id: string | null;
          fb_ad_name: string | null;
        }
      > = {};
      const bestCampaignTsByPhone: Record<string, number> = {};

      (allLeads || []).forEach((l) => {
        const phone = phoneKey(l.telefone);
        if (!phonesInPeriod.has(phone)) return;
        if (!l.fb_campaign_name) return;

        const t = attributionTs(l);
        if (bestCampaignByPhone[phone] && bestCampaignTsByPhone[phone] !== undefined && t <= bestCampaignTsByPhone[phone]) {
          return;
        }

        bestCampaignTsByPhone[phone] = t;
        bestCampaignByPhone[phone] = {
          fb_campaign_id: l.fb_campaign_id,
          fb_campaign_name: l.fb_campaign_name,
          fb_adset_id: l.fb_adset_id,
          fb_adset_name: l.fb_adset_name,
          fb_ad_id: l.fb_ad_id,
          fb_ad_name: l.fb_ad_name,
        };
      });

      // Para cada telefone, capturar o lead_id do MAIS RECENTE AGENDAMENTO CRIADO no período
      // NÃO filtramos por phonesInPeriod aqui - queremos todos os agendamentos do período
      // A filtragem por phonesInPeriod acontece depois, na hora de contar
      const latestAgendamentoLeadIdByPhone: Record<string, string> = {};
      const latestAgendamentoTsByPhone: Record<string, number> = {};
      agendamentos?.forEach((a) => {
        if (!a.cliente_id) return;
        // Incluir agendamentos cancelados também (são "não compareceu")
        
        const phone = clienteIdToPhone[a.cliente_id];
        if (!phone) return;
        
        const ts = periodTs(a.created_at || (a as any).data_agendamento);
        if (ts === null) return;
        
        // Pegar o MAIS RECENTE (ts > existente)
        if (latestAgendamentoTsByPhone[phone] === undefined || ts > latestAgendamentoTsByPhone[phone]) {
          latestAgendamentoTsByPhone[phone] = ts;
          latestAgendamentoLeadIdByPhone[phone] = a.cliente_id;
        }
      });

      // Para faturas: também usar o MAIS RECENTE no período
      const latestFaturaNegLeadIdByPhone: Record<string, string> = {};
      const latestFaturaNegTsByPhone: Record<string, number> = {};
      const latestFaturaFechLeadIdByPhone: Record<string, string> = {};
      const latestFaturaFechTsByPhone: Record<string, number> = {};

      faturas?.forEach((f) => {
        if (!f.cliente_id) return;
        if (f.status === "cancelado" || f.status === "deletado") return;
        
        const phone = clienteIdToPhone[f.cliente_id];
        if (!phone) return;
        
        // Para negociação: created_at
        // Para fechado: updated_at (momento do fechamento)
        const tsCreated = periodTs(f.created_at);
        const tsClosed = periodTs(f.updated_at);

        if (f.status === "negociacao" && tsCreated !== null) {
          // Pegar o MAIS RECENTE
          if (latestFaturaNegTsByPhone[phone] === undefined || tsCreated > latestFaturaNegTsByPhone[phone]) {
            latestFaturaNegTsByPhone[phone] = tsCreated;
            latestFaturaNegLeadIdByPhone[phone] = f.cliente_id;
          }
        }
        if (f.status === "fechado") {
          const tsForFechado = tsClosed ?? tsCreated;
          if (tsForFechado !== null) {
            // Pegar o MAIS RECENTE
            if (latestFaturaFechTsByPhone[phone] === undefined || tsForFechado > latestFaturaFechTsByPhone[phone]) {
              latestFaturaFechTsByPhone[phone] = tsForFechado;
              latestFaturaFechLeadIdByPhone[phone] = f.cliente_id;
            }
          }
        }
      });

      // Lead "representante" para a linha do telefone:
      // - preferir o primeiro lead WhatsApp do telefone (para atribuição)
      // - fallback para o lead primário (ex.: telefones que só existem em Disparos)
      const firstWhatsAppLeadByPhone: Record<string, (typeof allLeads)[number]> = {};
      (allLeads || []).forEach((l) => {
        const phone = phoneKey(l.telefone);
        if (!phonesInPeriod.has(phone)) return;
        if (!isWhatsAppLead(l.origem)) return;
        const existing = firstWhatsAppLeadByPhone[phone];
        if (!existing) {
          firstWhatsAppLeadByPhone[phone] = l;
          return;
        }
        const existingTs = new Date(existing.created_at || 0).getTime();
        const nextTs = new Date(l.created_at || 0).getTime();
        if (Number.isFinite(nextTs) && nextTs < existingTs) {
          firstWhatsAppLeadByPhone[phone] = l;
        }
      });

      const representativeLeadByPhone: Record<string, (typeof allLeads)[number]> = {};
      Array.from(phonesInPeriod).forEach((p) => {
        representativeLeadByPhone[p] = firstWhatsAppLeadByPhone[p] || firstLeadByPhone[p];
      });

      const leads = Array.from(phonesInPeriod)
        .map((p) => representativeLeadByPhone[p])
        .filter(Boolean);

      // Total de registros no período (antes da unificação por telefone)
      const totalRecords = leads.length;

      // Criar set de clientes com agendamento e mapa de status (todos os tempos, para fallback)
      const clientesComAgendamento = new Set<string>();
      const clientesNaoCompareceram = new Set<string>();
      
      agendamentos?.forEach(a => {
        if (a.cliente_id) {
          clientesComAgendamento.add(a.cliente_id);
          if (a.status === "cancelado") {
            clientesNaoCompareceram.add(a.cliente_id);
          }
        }
      });

      // Criar mapa de todos os IDs de lead por telefone (chave) (para consolidar valores/status)
      const leadIdsByPhone: Record<string, string[]> = {};
      (allLeads || []).forEach((l) => {
        const phone = phoneKey(l.telefone);
        if (!phonesInPeriod.has(phone)) return;
        if (!leadIdsByPhone[phone]) leadIdsByPhone[phone] = [];
        leadIdsByPhone[phone].push(l.id);
      });

      // Leads com atribuição por telefone (para escolher o criativo correto por etapa)
      const attributedLeadsByPhone: Record<string, (typeof allLeads)[number][]> = {};
      (allLeads || []).forEach((l) => {
        const phone = phoneKey(l.telefone);
        if (!phonesInPeriod.has(phone)) return;
        if (!isWhatsAppLead(l.origem)) return;
        if (!l.fb_campaign_name) return;

        if (!attributedLeadsByPhone[phone]) attributedLeadsByPhone[phone] = [];
        attributedLeadsByPhone[phone].push(l);
      });
      Object.values(attributedLeadsByPhone).forEach((arr) => {
        arr.sort((a, b) => attributionTs(a) - attributionTs(b));
      });

      const pickAttributionLead = (phone: string, eventTs?: number, preferredLeadId?: string) => {
        const preferred = preferredLeadId ? leadById[preferredLeadId] : undefined;
        if (preferred?.fb_campaign_name) return preferred;

        // Buscar candidatos com atribuição para este telefone
        const candidates = attributedLeadsByPhone[phone] || [];
        if (candidates.length === 0) return undefined;

        // Se temos eventTs, escolhe o lead com atribuição mais recente ANTES (ou no mesmo instante) do evento
        // Importante: nunca usar uma atribuição criada DEPOIS do evento (isso distorce "Máximo")
        if (eventTs !== undefined) {
          for (let i = candidates.length - 1; i >= 0; i--) {
            const t = attributionTs(candidates[i]);
            if (Number.isFinite(t) && t <= eventTs) return candidates[i];
          }
          // Nenhuma atribuição existia até o momento do evento → o evento é "Sem campanha"
          return undefined;
        }

        // Sem eventTs: usar o mais recente (bom para visões agregadas)
        return candidates[candidates.length - 1];
      };

      const getAttribution = (
        phone: string,
        opts?: { preferredLeadId?: string; eventTs?: number; isDisparos?: boolean; strictPreferred?: boolean }
      ) => {
        // Se é de Disparos, retorna um grupo separado
        if (opts?.isDisparos) {
          const key = "___DISPAROS___";
          return {
            key,
            campaignId: null,
            campaign: "📤 Via Disparos",
            adsetId: null,
            adset: "Campanhas de disparo em massa",
            adId: null,
            ad: "—",
          };
        }

        // Alinhado com a aba Leads (contagem de LEADS):
        // quando estamos contando o lead "dono" do telefone, usamos APENAS o próprio registro.
        // Se esse lead não tiver campanha, ele deve ficar como "Sem campanha" mesmo que exista atribuição em registros futuros.
        if (opts?.strictPreferred && opts.preferredLeadId) {
          const preferred = leadById[opts.preferredLeadId];
          const campaignId = preferred?.fb_campaign_id || null;
          const campaign = preferred?.fb_campaign_name || "Sem campanha";
          const adsetId = preferred?.fb_adset_id || null;
          const adset = preferred?.fb_adset_name || "Sem conjunto";
          const adId = preferred?.fb_ad_id || null;
          const ad = preferred?.fb_ad_name || "Sem anúncio";

          let key: string;
          if (viewLevel === "campaign") key = campaignId ? campaignId : campaign;
          else if (viewLevel === "adset") key = adsetId ? `${campaignId || campaign}|||${adsetId}` : `${campaign}|||${adset}`;
          else key = adId ? `${campaignId || campaign}|||${adsetId || adset}|||${adId}` : `${campaign}|||${adsetId || adset}|||${ad}`;

          return { key, campaignId, campaign, adsetId, adset, adId, ad };
        }

        const fromLead = pickAttributionLead(phone, opts?.eventTs, opts?.preferredLeadId);

        // IMPORTANT:
        // Quando estamos atribuindo um EVENTO com timestamp (ex.: lead criado, agendamento, fatura),
        // NÃO devemos “herdar” campanha de um lead futuro do mesmo telefone.
        // Isso é o que fazia o filtro "Máximo" esconder os "Sem rastreio".
        const shouldUseFallback = opts?.eventTs === undefined;
        const fallback = shouldUseFallback ? bestCampaignByPhone[phone] : undefined;

        const campaignId = fromLead?.fb_campaign_id || fallback?.fb_campaign_id || null;
        const campaign = fromLead?.fb_campaign_name || fallback?.fb_campaign_name || "Sem campanha";
        const adsetId = fromLead?.fb_adset_id || fallback?.fb_adset_id || null;
        const adset = fromLead?.fb_adset_name || fallback?.fb_adset_name || "Sem conjunto";
        const adId = fromLead?.fb_ad_id || fallback?.fb_ad_id || null;
        const ad = fromLead?.fb_ad_name || fallback?.fb_ad_name || "Sem anúncio";

        let key: string;
        // Use campaignId when available for unique identification, fallback to name
        if (viewLevel === "campaign") key = campaignId ? campaignId : campaign;
        // Use adsetId when available for unique identification, fallback to name
        else if (viewLevel === "adset") key = adsetId ? `${campaignId || campaign}|||${adsetId}` : `${campaign}|||${adset}`;
        // Use adId when available for unique identification, fallback to name
        else key = adId ? `${campaignId || campaign}|||${adsetId || adset}|||${adId}` : `${campaign}|||${adsetId || adset}|||${ad}`;

        return { key, campaignId, campaign, adsetId, adset, adId, ad };
      };

      // Agrupar por campanha/conjunto/anúncio
      // Usar telefone normalizado para unificar contatos
      const processedPhones = new Set<string>();

      // Sempre calculamos os 3 níveis, para que os quadros laterais não dependam do filtro do usuário.
      const groupedCampaign: Record<string, FunnelData> = {};
      const groupedAdset: Record<string, FunnelData> = {};
      const groupedAd: Record<string, FunnelData> = {};

      const ensureGroup = (map: Record<string, FunnelData>, key: string, base: Omit<FunnelData, "leads" | "agendados" | "compareceu" | "nao_compareceu" | "em_negociacao" | "clientes" | "valor_fechado">) => {
        if (!map[key]) {
          map[key] = {
            ...base,
            leads: 0,
            agendados: 0,
            compareceu: 0,
            nao_compareceu: 0,
            em_negociacao: 0,
            clientes: 0,
            valor_fechado: 0,
          };
        }
        return map[key];
      };

      const bumpAllLevels = (attr: ReturnType<typeof getAttribution>) => {
        // Campaign - use campaignId for unique key when available
        const campaignKey = attr.campaignId ? attr.campaignId : attr.campaign;
        ensureGroup(groupedCampaign, campaignKey, {
          campaign_id: attr.campaignId,
          campaign_name: attr.campaign,
          adset_id: null,
          adset_name: null,
          ad_id: null,
          ad_name: null,
        });

        // Adset - use adsetId for unique key when available
        const adsetKey = attr.adsetId ? `${attr.campaignId || attr.campaign}|||${attr.adsetId}` : `${attr.campaign}|||${attr.adset}`;
        ensureGroup(groupedAdset, adsetKey, {
          campaign_id: attr.campaignId,
          campaign_name: attr.campaign,
          adset_id: attr.adsetId,
          adset_name: attr.adset,
          ad_id: null,
          ad_name: null,
        });

        // Ad - use adId for unique key when available
        const adKey = attr.adId 
          ? `${attr.campaignId || attr.campaign}|||${attr.adsetId || attr.adset}|||${attr.adId}` 
          : `${attr.campaign}|||${attr.adsetId || attr.adset}|||${attr.ad}`;
        ensureGroup(groupedAd, adKey, {
          campaign_id: attr.campaignId,
          campaign_name: attr.campaign,
          adset_id: attr.adsetId,
          adset_name: attr.adset,
          ad_id: attr.adId,
          ad_name: attr.ad,
        });
      };

      const bumpMetric = (attr: ReturnType<typeof getAttribution>, field: keyof Pick<FunnelData, "leads" | "agendados" | "compareceu" | "nao_compareceu" | "em_negociacao" | "clientes" | "valor_fechado">, amount: number) => {
        bumpAllLevels(attr);

        const campaignKey = attr.campaignId ? attr.campaignId : attr.campaign;
        groupedCampaign[campaignKey][field] += amount;

        const adsetKey = attr.adsetId ? `${attr.campaignId || attr.campaign}|||${attr.adsetId}` : `${attr.campaign}|||${attr.adset}`;
        groupedAdset[adsetKey][field] += amount;

        const adKey = attr.adId 
          ? `${attr.campaignId || attr.campaign}|||${attr.adsetId || attr.adset}|||${attr.adId}` 
          : `${attr.campaign}|||${attr.adsetId || attr.adset}|||${attr.ad}`;
        groupedAd[adKey][field] += amount;
      };
      // Contadores para eventos de leads que vieram originalmente de "Disparos"
      const viaDisparos = {
        // Leads criados no período cuja origem primária é Disparos (badge no card de Leads)
        leads: phonesWithDisparosLeadInPeriod.size,
        agendados: 0,
        compareceu: 0,
        nao_compareceu: 0,
        em_negociacao: 0,
        clientes: 0,
        valor_fechado: 0,
      };

      // Helper para verificar se a origem primária é "Disparos"
      const isDisparosOrigin = (phone: string) => {
        const origin = (primaryOriginByPhone[phone] || "").toLowerCase();
        return origin === "disparos";
      };

      leads?.forEach((lead) => {
        const phone = phoneKey(lead.telefone);
        if (processedPhones.has(phone)) return;
        processedPhones.add(phone);

        const allIds = leadIdsByPhone[phone] || [lead.id];
        const isFromDisparos = isDisparosOrigin(phone);

        // flags do período
        const hasAgendamentoInPeriod = phonesWithAgendamentoInPeriodForStage.has(phone);
        const temFaturaNegociacaoInPeriod = phonesWithFaturaNegociacaoInPeriod.has(phone);
        const temFaturaFechadaInPeriod = phonesWithFaturaFechadaInPeriod.has(phone);

        // stage-specific lead id (para atribuição correta por etapa)
        // Usamos o MAIS RECENTE evento para determinar a atribuição atual
        const leadIdStage2 = latestAgendamentoLeadIdByPhone[phone] || lead.id;
        const leadIdStage3 = latestFaturaNegLeadIdByPhone[phone] || latestFaturaFechLeadIdByPhone[phone] || leadIdStage2;
        const leadIdStage4 = latestFaturaFechLeadIdByPhone[phone] || leadIdStage3;

        const tsStage1 = new Date(lead.created_at || 0).getTime();
        const tsStage2 = latestAgendamentoTsByPhone[phone];
        const tsStage3 = latestFaturaNegTsByPhone[phone] || latestFaturaFechTsByPhone[phone];
        const tsStage4 = latestFaturaFechTsByPhone[phone];

        // Etapa 1: Leads - conta se o lead foi CRIADO no período (WhatsApp OU Disparos)
        // Regra alinhada com a aba Leads:
        // - Se a origem primária do telefone é Disparos (e o cadastro primário caiu no período), esse lead entra no grupo "📤 Via Disparos"
        // - Caso contrário, conta como WhatsApp e pode cair em "Sem campanha" (sem rastreio)
        const isWhatsAppLeadCreatedInPeriod = phonesWithLeadInPeriod.has(phone);
        const isDisparosLeadCreatedInPeriod = phonesWithDisparosLeadInPeriod.has(phone);

        if (isDisparosLeadCreatedInPeriod) {
          const attr = getAttribution(phone, { isDisparos: true });
          bumpMetric(attr, "leads", 1);
        } else if (isWhatsAppLeadCreatedInPeriod) {
          const attr = getAttribution(phone, { preferredLeadId: lead.id, eventTs: tsStage1, strictPreferred: true });
          bumpMetric(attr, "leads", 1);
        }

        // Etapa 2: Agendados
        // Conta todos os agendamentos do período, incluindo cancelados (não compareceu)
        if (hasAgendamentoInPeriod) {
          const attr = getAttribution(phone, { preferredLeadId: leadIdStage2, eventTs: tsStage2, isDisparos: isFromDisparos });
          bumpMetric(attr, "agendados", 1);
          if (isFromDisparos) viaDisparos.agendados++;

          // Usar o set de período para marcar não compareceu
          if (phonesWithNaoCompareceuInPeriod.has(phone)) {
            bumpMetric(attr, "nao_compareceu", 1);
            if (isFromDisparos) viaDisparos.nao_compareceu++;
          }
        }

        // Etapa 3: Compareceu / Em negociação
        if (temFaturaNegociacaoInPeriod || temFaturaFechadaInPeriod) {
          const attr = getAttribution(phone, { preferredLeadId: leadIdStage3, eventTs: tsStage3, isDisparos: isFromDisparos });
          bumpMetric(attr, "compareceu", 1);
          if (isFromDisparos) viaDisparos.compareceu++;

          if (temFaturaNegociacaoInPeriod && !temFaturaFechadaInPeriod) {
            bumpMetric(attr, "em_negociacao", 1);
            if (isFromDisparos) viaDisparos.em_negociacao++;
          }
        }

        // Etapa 4: Clientes
        if (temFaturaFechadaInPeriod) {
          const attr = getAttribution(phone, { preferredLeadId: leadIdStage4, eventTs: tsStage4, isDisparos: isFromDisparos });
          bumpMetric(attr, "clientes", 1);
          if (isFromDisparos) viaDisparos.clientes++;

          let valorFechado = 0;
          allIds.forEach((id) => {
            if (faturaPorClienteInPeriod[id]) valorFechado += faturaPorClienteInPeriod[id];
          });

          if (valorFechado > 0) {
            bumpMetric(attr, "valor_fechado", valorFechado);
            if (isFromDisparos) viaDisparos.valor_fechado += valorFechado;
          } else {
            // Fallback para valor_tratamento
            const valorTratamento = allIds
              .map((id) => leadById[id])
              .find((l) => l?.valor_tratamento)?.valor_tratamento;
            if (valorTratamento) {
              bumpMetric(attr, "valor_fechado", valorTratamento);
              if (isFromDisparos) viaDisparos.valor_fechado += valorTratamento;
            }
          }
        }
      });

      const uniqueContacts = processedPhones.size;

      const sortCore = (a: FunnelData, b: FunnelData) => {
        const isDisparosA = a.campaign_name.includes("Via Disparos");
        const isDisparosB = b.campaign_name.includes("Via Disparos");
        const isSemCampanhaA = a.campaign_name === "Sem campanha";
        const isSemCampanhaB = b.campaign_name === "Sem campanha";

        // Via Disparos vai por último
        if (isDisparosA && !isDisparosB) return 1;
        if (!isDisparosA && isDisparosB) return -1;
        // Sem campanha vai antes de Via Disparos, mas depois do resto
        if (isSemCampanhaA && !isSemCampanhaB && !isDisparosB) return 1;
        if (!isSemCampanhaA && isSemCampanhaB && !isDisparosA) return -1;
        // Ordenar por leads (decrescente)
        return b.leads - a.leads;
      };

      const dataCampaign = Object.values(groupedCampaign).sort(sortCore);
      const dataAdset = Object.values(groupedAdset).sort(sortCore);
      const dataAd = Object.values(groupedAd).sort(sortCore);

      const data = viewLevel === "campaign" ? dataCampaign : viewLevel === "adset" ? dataAdset : dataAd;

      return {
        data,
        dataByCampaign: dataCampaign,
        dataByAdset: dataAdset,
        dataByAd: dataAd,
        totalRecords,
        uniqueContacts,
        viaDisparos,
      };
    },
    enabled: !!user?.id,
  });

  // Extrair dados do resultado
  const funnelData = funnelResult?.data || [];
  const funnelDataByCampaign = funnelResult?.dataByCampaign || [];
  const funnelDataByAdset = funnelResult?.dataByAdset || [];
  const funnelDataByAd = funnelResult?.dataByAd || [];
  const totalRecordsInPeriod = funnelResult?.totalRecords || 0;
  const uniqueContactsInPeriod = funnelResult?.uniqueContacts || 0;
  const duplicatesUnified = totalRecordsInPeriod - uniqueContactsInPeriod;
  const viaDisparos = funnelResult?.viaDisparos || { leads: 0, agendados: 0, compareceu: 0, nao_compareceu: 0, em_negociacao: 0, clientes: 0, valor_fechado: 0 };

  // Buscar gastos do Meta Ads (por campanha)
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

  // Buscar gastos detalhados por adset e ad (para filtros de conjunto/anúncio)
  const { data: spendBreakdown } = useQuery({
    // "v2" para bust do cache quando a estrutura de agregação mudou
    queryKey: ["spend-breakdown-v2", user?.id, dateStart, dateEnd],
    queryFn: async () => {
      if (!user?.id) return { adset_spend: [], ad_spend: [] };

      const { data: session } = await supabase.auth.getSession();
      
      const { data: accounts } = await supabase
        .from("facebook_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!accounts || accounts.length === 0) return { adset_spend: [], ad_spend: [] };

      const accountId = accounts[0].ad_account_id;

      try {
        const response = await supabase.functions.invoke("facebook-ads-api", {
          body: {
            action: "get_spend_breakdown",
            ad_account_id: accountId,
            date_start: format(dateStart, "yyyy-MM-dd"),
            date_end: format(dateEnd, "yyyy-MM-dd"),
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        });

        if (response.error || !response.data?.success) {
          console.error("Error fetching spend breakdown:", response.error);
          return { adset_spend: [], ad_spend: [] };
        }

        return {
          adset_spend: response.data.adset_spend || [],
          ad_spend: response.data.ad_spend || [],
        };
      } catch (error) {
        console.error("Error fetching spend breakdown:", error);
        return { adset_spend: [], ad_spend: [] };
      }
    },
    enabled: !!user?.id, // Sempre buscar para os quadros de Melhor Custo que usam adset/ad
  });

  // Normalização para garantir que chaves batam mesmo com variações de espaço/dash/unicode
  const normalizeKeyPart = (value: string | null | undefined) => {
    return (value || "")
      .normalize("NFKC")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  };

  const makeCampaignKey = (campaignName: string | null | undefined) => normalizeKeyPart(campaignName);
  const makeAdsetKey = (campaignName: string | null | undefined, adsetName: string | null | undefined) =>
    `${makeCampaignKey(campaignName)}::${normalizeKeyPart(adsetName)}`;
  const makeAdKey = (
    campaignName: string | null | undefined,
    adsetName: string | null | undefined,
    adName: string | null | undefined
  ) => `${makeCampaignKey(campaignName)}::${normalizeKeyPart(adsetName)}::${normalizeKeyPart(adName)}`;

  // Criar mapa de gastos por campanha
  const spendByCampaign = useMemo(() => {
    const map: Record<string, number> = {};
    spendData?.forEach((s) => {
      map[makeCampaignKey(s.campaign_name)] = s.spend;
    });
    return map;
  }, [spendData]);

  // Criar mapa de gastos por adset usando IDs (chave primária) com fallback para nomes
  // IMPORTANTE: Usar IDs evita problemas quando conjuntos têm nomes iguais
  const spendByAdsetId = useMemo(() => {
    const map: Record<string, number> = {};

    // Usar dados do breakdown com IDs
    spendBreakdown?.adset_spend?.forEach(
      (s: { adset_name: string; adset_id?: string; campaign_name: string; campaign_id?: string; spend: number }) => {
        // Chave por ID (prioridade) ou por nome (fallback)
        if (s.adset_id) {
          map[s.adset_id] = (map[s.adset_id] || 0) + (s.spend || 0);
        }
        // Também adicionar pelo nome composto para fallback
        const key = makeAdsetKey(s.campaign_name, s.adset_name);
        map[key] = (map[key] || 0) + (s.spend || 0);
      }
    );

    // Se não veio adset_spend, derivar do ad_spend
    if (Object.keys(map).length === 0) {
      spendBreakdown?.ad_spend?.forEach(
        (s: { ad_name: string; ad_id?: string; adset_name: string; adset_id?: string; campaign_name: string; campaign_id?: string; spend: number }) => {
          if (s.adset_id) {
            map[s.adset_id] = (map[s.adset_id] || 0) + (s.spend || 0);
          }
          const key = makeAdsetKey(s.campaign_name, s.adset_name);
          map[key] = (map[key] || 0) + (s.spend || 0);
        }
      );
    }

    return map;
  }, [spendBreakdown]);

  // Manter compatibilidade com código existente (alias)
  const spendByAdset = spendByAdsetId;

  // Criar mapa de gastos por ad usando IDs (chave primária) com fallback para nomes
  const spendByAdId = useMemo(() => {
    const map: Record<string, number> = {};
    spendBreakdown?.ad_spend?.forEach(
      (s: { ad_name: string; ad_id?: string; adset_name: string; adset_id?: string; campaign_name: string; campaign_id?: string; spend: number }) => {
        // Chave por ID (prioridade)
        if (s.ad_id) {
          map[s.ad_id] = (map[s.ad_id] || 0) + s.spend;
        }
        // Também adicionar pelo nome composto para fallback
        const key = makeAdKey(s.campaign_name, s.adset_name, s.ad_name);
        map[key] = (map[key] || 0) + s.spend;
      }
    );
    return map;
  }, [spendBreakdown]);

  // Manter compatibilidade com código existente (alias)
  const spendByAd = spendByAdId;

  // Helper functions para lookup de spend com prioridade para ID
  const getAdsetSpend = (adsetId: string | null | undefined, campaign: string | null | undefined, adset: string | null | undefined): number => {
    // Priorizar ID
    if (adsetId && spendByAdset[adsetId]) {
      return spendByAdset[adsetId];
    }
    // Fallback para chave por nome
    const key = makeAdsetKey(campaign, adset);
    return spendByAdset[key] || 0;
  };

  const getAdSpend = (adId: string | null | undefined, campaign: string | null | undefined, adset: string | null | undefined, ad: string | null | undefined): number => {
    // Priorizar ID
    if (adId && spendByAd[adId]) {
      return spendByAd[adId];
    }
    // Fallback para chave por nome
    const key = makeAdKey(campaign, adset, ad);
    return spendByAd[key] || 0;
  };

  // Calcular totais - SEMPRE usar funnelDataByCampaign para ter acesso a "Sem campanha"
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
    
    // Usar funnelDataByCampaign para garantir acesso a "Sem campanha" independente do viewLevel
    if (!funnelDataByCampaign || funnelDataByCampaign.length === 0) return defaultTotals;
    
    const totalSpend = Object.values(spendByCampaign).reduce((a, b) => a + b, 0);
    
    // Contar rastreados vs não rastreados (excluindo "Via Disparos" dos rastreados por anúncio)
    const tracked = funnelDataByCampaign.filter(item => 
      item.campaign_name !== "Sem campanha" && !item.campaign_name.includes("Via Disparos")
    );
    const untracked = funnelDataByCampaign.find(item => item.campaign_name === "Sem campanha");
    
    // Leads "não rastreados" = item "Sem campanha" (não mistura com "Via Disparos")
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
    
    return funnelDataByCampaign.reduce((acc, item) => ({
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
  }, [funnelDataByCampaign, spendByCampaign, viaDisparos]);

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
    { etapa: "Compareceu → Conversão", taxa: totals.compareceu > 0 ? ((totals.compareceu - totals.clientes) / totals.compareceu) * 100 : 0, perdas: totals.compareceu - totals.clientes },
  ];
  const maiorPerda = taxas.reduce((max, item) => item.taxa > max.taxa ? item : max, taxas[0]);

  // Calcular dados de funil agrupados por adset e por ad para os quadros de desempenho
  // IMPORTANTÍSSIMO: esses quadros NÃO podem depender do "Agrupar por" da tabela.
  const funnelByAdset = useMemo(() => {
    if (!funnelDataByAdset) return [];

    const grouped: Record<string, {
      adset: string;
      adset_id: string | null;
      campaign: string;
      campaign_id: string | null;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    funnelDataByAdset.forEach((item) => {
      if (item.campaign_name === "Sem campanha") return;
      if (item.campaign_name.includes("Via Disparos")) return;

      const adsetName = item.adset_name;
      if (!adsetName || adsetName === "Sem conjunto") return;

      // Usar ID como chave quando disponível, senão usar nome
      const key = item.adset_id || `${item.campaign_name}::${adsetName}`;
      if (!grouped[key]) {
        grouped[key] = {
          adset: adsetName,
          adset_id: item.adset_id,
          campaign: item.campaign_name,
          campaign_id: item.campaign_id,
          leads: 0,
          agendados: 0,
          compareceu: 0,
          clientes: 0,
          valor: 0,
        };
      }

      grouped[key].leads += item.leads;
      grouped[key].agendados += item.agendados;
      grouped[key].compareceu += item.compareceu;
      grouped[key].clientes += item.clientes;
      grouped[key].valor += item.valor_fechado;
    });

    return Object.values(grouped);
  }, [funnelDataByAdset]);

  const funnelByAd = useMemo(() => {
    if (!funnelDataByAd) return [];

    const grouped: Record<string, {
      ad: string;
      adset: string;
      adset_id: string | null;
      campaign: string;
      campaign_id: string | null;
      ad_id: string | null;
      leads: number;
      agendados: number;
      compareceu: number;
      clientes: number;
      valor: number;
    }> = {};

    funnelDataByAd.forEach((item) => {
      if (item.campaign_name === "Sem campanha") return;
      if (item.campaign_name.includes("Via Disparos")) return;

      const adName = item.ad_name;
      const adsetName = item.adset_name;
      if (!adName || adName === "Sem anúncio") return;
      if (!adsetName || adsetName === "Sem conjunto") return;

      // Usar ID como chave quando disponível, senão usar nome
      const key = item.ad_id || `${item.campaign_name}::${adsetName}::${adName}`;
      if (!grouped[key]) {
        grouped[key] = {
          ad: adName,
          adset: adsetName,
          adset_id: item.adset_id,
          campaign: item.campaign_name,
          campaign_id: item.campaign_id,
          ad_id: item.ad_id,
          leads: 0,
          agendados: 0,
          compareceu: 0,
          clientes: 0,
          valor: 0,
        };
      }

      grouped[key].leads += item.leads;
      grouped[key].agendados += item.agendados;
      grouped[key].compareceu += item.compareceu;
      grouped[key].clientes += item.clientes;
      grouped[key].valor += item.valor_fechado;
    });

    return Object.values(grouped);
  }, [funnelDataByAd]);

  // Buscar thumbnails dos anúncios
  const adIds = useMemo(() => {
    return funnelByAd
      .filter(item => item.ad_id)
      .map(item => item.ad_id as string);
  }, [funnelByAd]);

  const { data: adData } = useQuery({
    queryKey: ["ad-data", user?.id, adIds],
    queryFn: async () => {
      if (!user?.id || adIds.length === 0) return { thumbnails: {}, texts: {} };
      
      // Buscar thumbnails e texto do anúncio (utm_term) dos leads
      const { data: leadData } = await supabase
        .from("leads")
        .select("fb_ad_id, ad_thumbnail_url, utm_term")
        .eq("user_id", user.id)
        .in("fb_ad_id", adIds);
      
      const thumbnailMap: Record<string, string> = {};
      const textMap: Record<string, string> = {};
      
      leadData?.forEach(item => {
        if (item.fb_ad_id) {
          // Thumbnail
          if (item.ad_thumbnail_url && !thumbnailMap[item.fb_ad_id]) {
            thumbnailMap[item.fb_ad_id] = item.ad_thumbnail_url;
          }
          // Texto do anúncio (utm_term)
          if (item.utm_term && !textMap[item.fb_ad_id]) {
            textMap[item.fb_ad_id] = item.utm_term;
          }
        }
      });
      
      return { thumbnails: thumbnailMap, texts: textMap };
    },
    enabled: !!user?.id && adIds.length > 0,
  });

  const adThumbnails = adData?.thumbnails || {};
  const adTexts = adData?.texts || {};

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
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Leads</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{formatNumber(totals.leads)}</div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.leadsTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.leadsTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Leads de anúncios (rastreados)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.leadsUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.leadsUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Leads sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.leads > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.leads} via Disparos</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Leads originados de campanhas de disparos em massa</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {duplicatesUnified > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="text-[10px] text-muted-foreground mt-1 block">
                    ({duplicatesUnified} unificado{duplicatesUnified > 1 ? 's' : ''})
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{totalRecordsInPeriod} registros → {uniqueContactsInPeriod} contatos únicos</p>
                    <p className="text-xs text-muted-foreground">Contatos duplicados foram unificados por telefone</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Agendados</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{formatNumber(totals.agendados)}</div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.agendadosTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.agendadosTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Agendados de anúncios (rastreados)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.agendadosUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.agendadosUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Agendados sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.agendados > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.agendados} via Disparos</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Agendamentos de leads originados de campanhas de disparos em massa</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1">
              <UserCheck className="h-3 w-3 text-green-500" />
              Compareceu
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-green-600">{formatNumber(totals.compareceu)}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(totals.compareceu, totals.agendados)} dos agendados
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.compareceuTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.compareceuTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Comparecimentos de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.compareceuUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.compareceuUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Comparecimentos sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.compareceu > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.compareceu} via Disparos</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Comparecimentos de leads originados de campanhas de disparos em massa</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-center gap-1">
              <UserX className="h-3 w-3 text-red-500" />
              Não Compareceu
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-red-600">{formatNumber(totals.nao_compareceu)}</div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(totals.nao_compareceu, totals.agendados)} dos agendados
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.naoCompareceuTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.naoCompareceuTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Não comparecimentos de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.naoCompareceuUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.naoCompareceuUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Não comparecimentos sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.nao_compareceu > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.nao_compareceu} via Disparos</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Não comparecimentos de leads originados de campanhas de disparos em massa</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Em Negociação</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{formatNumber(totals.em_negociacao)}</div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.emNegociacaoTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.emNegociacaoTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Em negociação de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.emNegociacaoUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.emNegociacaoUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Em negociação sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.em_negociacao > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.em_negociacao} via Disparos</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Negociações de leads originados de campanhas de disparos em massa</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Conversões</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{formatNumber(totals.clientes)}</div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              {totals.clientesTracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 rounded-full px-2 py-0.5">
                      <Megaphone className="h-2.5 w-2.5" />
                      <span>{totals.clientesTracked} via Anúncio</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Conversões de anúncios (rastreados)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {totals.clientesUntracked > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <HelpCircle className="h-2.5 w-2.5" />
                      <span>{totals.clientesUntracked} não rastreados</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Conversões sem rastreamento de anúncios</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {viaDisparos.clientes > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <Send className="h-2.5 w-2.5" />
                      <span>{viaDisparos.clientes} via Disparos ({formatCurrency(viaDisparos.valor_fechado)})</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Conversões de leads originados de campanhas de disparos em massa</p>
                      <p className="text-xs text-muted-foreground">Valor total: {formatCurrency(viaDisparos.valor_fechado)}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">Taxa Conversão</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-emerald-600">{formatPercentage(totals.clientes, totals.leads)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Lead → Conversão
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Funil por {viewLevel === "campaign" ? "Campanha" : viewLevel === "adset" ? "Conjunto" : "Anúncio"}
              </CardTitle>
              <CardDescription>
                Acompanhe a jornada dos leads desde o primeiro contato até o fechamento
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnOrderDialogOpen(true)}
              className="gap-2"
            >
              <Settings2 className="h-4 w-4" />
              Ordenar Colunas
            </Button>
          </div>
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
                    {columnOrder.map((colKey) => {
                      const colDef = FUNNEL_COLUMNS.find(c => c.key === colKey);
                      if (!colDef) return null;
                      
                      if (colKey === "name") {
                        return (
                          <TableHead key={colKey} className="min-w-[200px]">
                            {viewLevel === "campaign" ? "Campanha" : viewLevel === "adset" ? "Conjunto" : "Anúncio"}
                          </TableHead>
                        );
                      }
                      
                      return (
                        <TableHead key={colKey} className="text-center">
                          {colDef.label}
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-center w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funnelData.map((row, idx) => {
                    // Calcular gasto baseado no nível de visualização
                    // IMPORTANTE: Usar IDs como chave primária para evitar problemas com nomes duplicados
                    let spend = 0;

                    if (viewLevel === "campaign") {
                      const campaignKey = makeCampaignKey(row.campaign_name);
                      spend = spendByCampaign[campaignKey] || 0;
                    } else if (viewLevel === "adset") {
                      spend = getAdsetSpend(row.adset_id, row.campaign_name, row.adset_name);
                    } else {
                      spend = getAdSpend(row.ad_id, row.campaign_name, row.adset_name, row.ad_name);
                    }
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

                    const renderCell = (colKey: FunnelColumnKey) => {
                      switch (colKey) {
                        case "name":
                          return (
                            <TableCell key={colKey} className="font-medium">
                              <div className="max-w-[250px]">
                                {viewLevel === "campaign" ? (
                                  <>
                                    <p className="truncate" title={row.campaign_name}>{row.campaign_name}</p>
                                  </>
                                ) : viewLevel === "adset" ? (
                                  <>
                                    <p className="truncate" title={row.adset_name || "Sem conjunto"}>{row.adset_name || "Sem conjunto"}</p>
                                    <p className="text-xs text-muted-foreground truncate" title={row.campaign_name}>{row.campaign_name}</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="truncate" title={row.ad_name || "Sem anúncio"}>{row.ad_name || "Sem anúncio"}</p>
                                    <p className="text-xs text-muted-foreground truncate" title={row.adset_name || "Sem conjunto"}>{row.adset_name || "Sem conjunto"}</p>
                                    <p className="text-xs text-muted-foreground/70 truncate" title={row.campaign_name}>{row.campaign_name}</p>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          );
                        case "spend":
                          return (
                            <TableCell key={colKey} className="text-center">
                              {spend > 0 ? formatCurrency(spend) : "—"}
                            </TableCell>
                          );
                        case "leads":
                          return (
                            <TableCell key={colKey} className="text-center">
                              <Badge variant="secondary">{row.leads}</Badge>
                            </TableCell>
                          );
                        case "cpl":
                          return (
                            <TableCell key={colKey} className="text-center text-sm">
                              {cpl > 0 ? formatCurrency(cpl) : "—"}
                            </TableCell>
                          );
                        case "agendados":
                          return (
                            <TableCell key={colKey} className="text-center">
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                                {row.agendados}
                              </Badge>
                            </TableCell>
                          );
                        case "cpa_agendado":
                          return (
                            <TableCell key={colKey} className="text-center text-sm">
                              {cpaAgendado > 0 ? formatCurrency(cpaAgendado) : "—"}
                            </TableCell>
                          );
                        case "faltou":
                          return (
                            <TableCell key={colKey} className="text-center">
                              <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                                {row.nao_compareceu}
                              </Badge>
                            </TableCell>
                          );
                        case "em_negociacao":
                          return (
                            <TableCell key={colKey} className="text-center">
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                                {row.em_negociacao}
                              </Badge>
                            </TableCell>
                          );
                        case "conversoes":
                          return (
                            <TableCell key={colKey} className="text-center">
                              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                                {row.clientes}
                              </Badge>
                            </TableCell>
                          );
                        case "cac":
                          return (
                            <TableCell key={colKey} className="text-center text-sm font-medium">
                              {cac > 0 ? formatCurrency(cac) : "—"}
                            </TableCell>
                          );
                        case "faturado":
                          return (
                            <TableCell key={colKey} className="text-center text-sm font-medium text-green-600">
                              {row.valor_fechado > 0 ? formatCurrency(row.valor_fechado) : "—"}
                            </TableCell>
                          );
                        case "roas":
                          return (
                            <TableCell key={colKey} className="text-center">
                              {roas > 0 ? (
                                <Badge variant={roas >= 1 ? "default" : "destructive"}>
                                  {roas.toFixed(2)}x
                                </Badge>
                              ) : "—"}
                            </TableCell>
                          );
                        default:
                          return null;
                      }
                    };

                    return (
                      <TableRow 
                        key={idx} 
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={handleRowClick}
                      >
                        {columnOrder.map(renderCell)}
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
                    {columnOrder.map((colKey) => {
                      switch (colKey) {
                        case "name":
                          return <TableCell key={colKey}>TOTAL</TableCell>;
                        case "spend":
                          return <TableCell key={colKey} className="text-center">{formatCurrency(totals.spend)}</TableCell>;
                        case "leads":
                          return <TableCell key={colKey} className="text-center">{totals.leads}</TableCell>;
                        case "cpl":
                          return <TableCell key={colKey} className="text-center">{totals.leads > 0 ? formatCurrency(totals.spend / totals.leads) : "—"}</TableCell>;
                        case "agendados":
                          return <TableCell key={colKey} className="text-center">{totals.agendados}</TableCell>;
                        case "cpa_agendado":
                          return <TableCell key={colKey} className="text-center">{totals.agendados > 0 ? formatCurrency(totals.spend / totals.agendados) : "—"}</TableCell>;
                        case "faltou":
                          return <TableCell key={colKey} className="text-center">{totals.nao_compareceu}</TableCell>;
                        case "em_negociacao":
                          return <TableCell key={colKey} className="text-center">{totals.em_negociacao}</TableCell>;
                        case "conversoes":
                          return <TableCell key={colKey} className="text-center">{totals.clientes}</TableCell>;
                        case "cac":
                          return <TableCell key={colKey} className="text-center">{totals.clientes > 0 ? formatCurrency(totals.spend / totals.clientes) : "—"}</TableCell>;
                        case "faturado":
                          return <TableCell key={colKey} className="text-center text-green-600">{formatCurrency(totals.valor_fechado)}</TableCell>;
                        case "roas":
                          return <TableCell key={colKey} className="text-center">{totals.spend > 0 ? `${(totals.valor_fechado / totals.spend).toFixed(2)}x` : "—"}</TableCell>;
                        default:
                          return null;
                      }
                    })}
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para ordenar colunas */}
      <FunnelColumnOrderDialog
        open={columnOrderDialogOpen}
        onOpenChange={setColumnOrderDialogOpen}
        currentOrder={columnOrder}
        onSave={async (order) => {
          await updateFunnelColumnOrder(order);
          toast.success("Ordem das colunas salva!");
        }}
      />

      {/* QUADRO 1: Melhores Desempenhos por Etapa do Funil - RESULTADOS */}
      {(funnelByAdset.length > 0 || funnelByAd.length > 0) && (
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
              {/* Etapa 1: Leads */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <Users className="h-5 w-5 text-blue-500" />
                  <h3 className="font-semibold text-base">Etapa 1: Geração de Leads</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {funnelByAdset.length > 0 && (() => {
                    const sortedItems = [...funnelByAdset].sort((a, b) => b.leads - a.leads);
                    
                    return (
                      <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-blue-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-blue-500"
                              numberBgInactiveClass="bg-blue-500/20"
                              numberTextClass="text-blue-600"
                              badge={
                                <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-600 ml-2">
                                  {item.leads} leads
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {funnelByAd.length > 0 && (() => {
                    const sortedItems = [...funnelByAd].sort((a, b) => b.leads - a.leads);
                    
                    return (
                      <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-purple-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-purple-500"
                              numberBgInactiveClass="bg-purple-500/20"
                              numberTextClass="text-purple-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-600 ml-2">
                                  {item.leads} leads
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 2: Agendamentos */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <CalendarIconSolid className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold text-base">Etapa 2: Agendamentos</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {funnelByAdset.filter(a => a.agendados > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAdset].filter(a => a.agendados > 0).sort((a, b) => b.agendados - a.agendados);
                    
                    return (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-amber-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 max-h-[280px] overflow-y-auto">
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-amber-500"
                              numberBgInactiveClass="bg-amber-500/20"
                              numberTextClass="text-amber-600"
                              badge={
                                <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600 ml-2">
                                  {item.agendados} agend.
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {funnelByAd.filter(a => a.agendados > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAd].filter(a => a.agendados > 0).sort((a, b) => b.agendados - a.agendados);
                    
                    return (
                      <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-orange-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-orange-500"
                              numberBgInactiveClass="bg-orange-500/20"
                              numberTextClass="text-orange-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-600 ml-2">
                                  {item.agendados} agend.
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 3: Comparecimentos */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <CheckCircle className="h-5 w-5 text-teal-500" />
                  <h3 className="font-semibold text-base">Etapa 3: Comparecimentos</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {funnelByAdset.filter(a => a.compareceu > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAdset].filter(a => a.compareceu > 0).sort((a, b) => b.compareceu - a.compareceu);
                    
                    return (
                      <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-teal-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-teal-500"
                              numberBgInactiveClass="bg-teal-500/20"
                              numberTextClass="text-teal-600"
                              badge={
                                <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600 ml-2">
                                  {item.compareceu} comp.
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {funnelByAd.filter(a => a.compareceu > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAd].filter(a => a.compareceu > 0).sort((a, b) => b.compareceu - a.compareceu);
                    
                    return (
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-emerald-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-emerald-500"
                              numberBgInactiveClass="bg-emerald-500/20"
                              numberTextClass="text-emerald-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 ml-2">
                                  {item.compareceu} comp.
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 4: Clientes */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <UserCheck className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold text-base">Etapa 4: Clientes Fechados</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {funnelByAdset.filter(a => a.clientes > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAdset].filter(a => a.clientes > 0).sort((a, b) => b.clientes - a.clientes);
                    
                    return (
                      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-green-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-green-500"
                              numberBgInactiveClass="bg-green-500/20"
                              numberTextClass="text-green-600"
                              badge={
                                <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600 ml-2">
                                  {item.clientes} clientes
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {funnelByAd.filter(a => a.clientes > 0).length > 0 && (() => {
                    const sortedItems = [...funnelByAd].filter(a => a.clientes > 0).sort((a, b) => b.clientes - a.clientes);
                    
                    return (
                      <div className="p-4 bg-lime-500/5 border border-lime-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-lime-600" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-lime-500"
                              numberBgInactiveClass="bg-lime-500/20"
                              numberTextClass="text-lime-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-lime-500/10 border-lime-500/30 text-lime-600 ml-2">
                                  {item.clientes} clientes
                                </Badge>
                              }
                            />
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

      {/* QUADRO 2: Melhor Custo por Etapa do Funil */}
      {totals.spend > 0 && (funnelByAdset.length > 0 || funnelByAd.length > 0) && (
        <Card className="border-emerald-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Melhor Custo por Etapa do Funil
            </CardTitle>
            <CardDescription>
              Conjuntos e anúncios com menor custo por resultado em cada etapa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {/* Etapa 1: CPL */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <Users className="h-5 w-5 text-blue-500" />
                  <h3 className="font-semibold text-base">Etapa 1: Custo por Lead</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(() => {
                    const sortedItems = funnelByAdset
                      .filter(f => f.leads > 0)
                      .map(f => {
                        const spend = getAdsetSpend(f.adset_id, f.campaign, f.adset);
                        const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                        return { ...f, spend, cpl };
                      })
                      .filter(f => f.cpl !== null && f.cpl > 0)
                      .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-blue-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 max-h-[280px] overflow-y-auto">
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`cpl-${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-blue-500"
                              numberBgInactiveClass="bg-blue-500/20"
                              numberTextClass="text-blue-600"
                              badge={
                                <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-600 ml-2">
                                  {formatCurrency(item.cpl || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const sortedItems = funnelByAd
                      .filter(f => f.leads > 0)
                      .map(f => {
                        const spend = getAdSpend(f.ad_id, f.campaign, f.adset, f.ad);
                        const cpl = spend > 0 && f.leads > 0 ? spend / f.leads : null;
                        return { ...f, spend, cpl };
                      })
                      .filter(f => f.cpl !== null && f.cpl > 0)
                      .sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-purple-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`cpl-${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-purple-500"
                              numberBgInactiveClass="bg-purple-500/20"
                              numberTextClass="text-purple-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-600 ml-2">
                                  {formatCurrency(item.cpl || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 2: Custo por Agendamento */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <CalendarIconSolid className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold text-base">Etapa 2: Custo por Agendamento</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(() => {
                    const sortedItems = funnelByAdset
                      .filter(f => f.agendados > 0)
                      .map(f => {
                        const spend = getAdsetSpend(f.adset_id, f.campaign, f.adset);
                        const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                        return { ...f, spend, cpa };
                      })
                      .filter(f => f.cpa !== null && f.cpa > 0)
                      .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-amber-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 max-h-[280px] overflow-y-auto">
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`cpa-${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-amber-500"
                              numberBgInactiveClass="bg-amber-500/20"
                              numberTextClass="text-amber-600"
                              badge={
                                <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-600 ml-2">
                                  {formatCurrency(item.cpa || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const sortedItems = funnelByAd
                      .filter(f => f.agendados > 0)
                      .map(f => {
                        const spend = getAdSpend(f.ad_id, f.campaign, f.adset, f.ad);
                        const cpa = spend > 0 && f.agendados > 0 ? spend / f.agendados : null;
                        return { ...f, spend, cpa };
                      })
                      .filter(f => f.cpa !== null && f.cpa > 0)
                      .sort((a, b) => (a.cpa || 0) - (b.cpa || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-orange-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`cpa-${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-orange-500"
                              numberBgInactiveClass="bg-orange-500/20"
                              numberTextClass="text-orange-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-600 ml-2">
                                  {formatCurrency(item.cpa || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 3: Custo por Comparecimento */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <CheckCircle className="h-5 w-5 text-teal-500" />
                  <h3 className="font-semibold text-base">Etapa 3: Custo por Comparecimento</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(() => {
                    const sortedItems = funnelByAdset
                      .filter(f => f.compareceu > 0)
                      .map(f => {
                        const spend = getAdsetSpend(f.adset_id, f.campaign, f.adset);
                        const costPerComp = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                        return { ...f, spend, costPerComp };
                      })
                      .filter(f => f.costPerComp !== null && f.costPerComp > 0)
                      .sort((a, b) => (a.costPerComp || 0) - (b.costPerComp || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-teal-500/5 border border-teal-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-teal-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`cpc-${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-teal-500"
                              numberBgInactiveClass="bg-teal-500/20"
                              numberTextClass="text-teal-600"
                              badge={
                                <Badge variant="outline" className="bg-teal-500/10 border-teal-500/30 text-teal-600 ml-2">
                                  {formatCurrency(item.costPerComp || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const sortedItems = funnelByAd
                      .filter(f => f.compareceu > 0)
                      .map(f => {
                        const spend = getAdSpend(f.ad_id, f.campaign, f.adset, f.ad);
                        const costPerComp = spend > 0 && f.compareceu > 0 ? spend / f.compareceu : null;
                        return { ...f, spend, costPerComp };
                      })
                      .filter(f => f.costPerComp !== null && f.costPerComp > 0)
                      .sort((a, b) => (a.costPerComp || 0) - (b.costPerComp || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-emerald-500" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`cpc-${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-emerald-500"
                              numberBgInactiveClass="bg-emerald-500/20"
                              numberTextClass="text-emerald-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30 text-emerald-600 ml-2">
                                  {formatCurrency(item.costPerComp || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Etapa 4: CAC */}
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <UserCheck className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold text-base">Etapa 4: CAC (Custo por Cliente)</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(() => {
                    const sortedItems = funnelByAdset
                      .filter(f => f.clientes > 0)
                      .map(f => {
                        const spend = getAdsetSpend(f.adset_id, f.campaign, f.adset);
                        const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                        return { ...f, spend, cac };
                      })
                      .filter(f => f.cac !== null && f.cac > 0)
                      .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-4 w-4 text-green-500" />
                          <h4 className="font-medium text-sm">Top Conjuntos</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdsetItem
                              key={`cac-${item.campaign}-${item.adset}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-green-500"
                              numberBgInactiveClass="bg-green-500/20"
                              numberTextClass="text-green-600"
                              badge={
                                <Badge variant="outline" className="bg-green-500/10 border-green-500/30 text-green-600 ml-2">
                                  {formatCurrency(item.cac || 0)}
                                </Badge>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const sortedItems = funnelByAd
                      .filter(f => f.clientes > 0)
                      .map(f => {
                        const spend = getAdSpend(f.ad_id, f.campaign, f.adset, f.ad);
                        const cac = spend > 0 && f.clientes > 0 ? spend / f.clientes : null;
                        return { ...f, spend, cac };
                      })
                      .filter(f => f.cac !== null && f.cac > 0)
                      .sort((a, b) => (a.cac || 0) - (b.cac || 0));
                    
                    if (sortedItems.length === 0) return null;
                    
                    return (
                      <div className="p-4 bg-lime-500/5 border border-lime-500/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Megaphone className="h-4 w-4 text-lime-600" />
                          <h4 className="font-medium text-sm">Top Anúncios</h4>
                        </div>
                        <div className="space-y-2 h-[280px] overflow-y-auto overscroll-contain pr-2" style={{ WebkitOverflowScrolling: "touch" }}>
                          {sortedItems.map((item, index) => (
                            <AdItem
                              key={`cac-${item.campaign}-${item.adset}-${item.ad}`}
                              item={item}
                              index={index}
                              numberBgClass="bg-lime-500"
                              numberBgInactiveClass="bg-lime-500/20"
                              numberTextClass="text-lime-600"
                              thumbnailUrl={item.ad_id ? adThumbnails?.[item.ad_id] : undefined}
                              adText={item.ad_id ? adTexts?.[item.ad_id] : undefined}
                              badge={
                                <Badge variant="outline" className="bg-lime-500/10 border-lime-500/30 text-lime-600 ml-2">
                                  {formatCurrency(item.cac || 0)}
                                </Badge>
                              }
                            />
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

      {/* Dialog do Funil Visual */}
      <FunilVisualDialog 
        open={funnelDialogOpen} 
        onOpenChange={setFunnelDialogOpen} 
        data={selectedFunnel} 
      />
    </div>
  );
}
