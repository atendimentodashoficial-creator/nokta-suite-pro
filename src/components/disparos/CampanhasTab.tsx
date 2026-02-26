import { useState, useEffect, useMemo } from "react";
import { Play, Pause, Trash2, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Users, Pencil, Copy, BarChart3, WifiOff, RotateCcw, Wifi, ArrowRight, Type, Send, Ban, Megaphone } from "lucide-react";
import { EditarCampanhaDialog } from "./EditarCampanhaDialog";
import { ContatosCampanhaDialog } from "./ContatosCampanhaDialog";
import { RelatorioCampanhaDialog } from "./RelatorioCampanhaDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { StatsCard } from "@/components/dashboard/StatsCard";

interface DisparosInstancia {
  id: string;
  nome: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
}

interface Campanha {
  id: string;
  nome: string;
  status: string;
  tipo_mensagem: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  delay_min: number;
  delay_max: number;
  iniciado_em: string | null;
  finalizado_em: string | null;
  created_at: string;
  next_send_at: string | null;
  instancias_ids: string[] | null;
  disabled_instancias_ids: string[] | null;
  instance_rotation_state: unknown;
  last_instance_id: string | null;
}

interface CampanhasTabProps {
  onRefresh: () => void;
}

export function CampanhasTab({ onRefresh }: CampanhasTabProps) {
  const { user } = useAuth();
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd } = usePeriodFilter("this_month");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [instancias, setInstancias] = useState<DisparosInstancia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campanhaToDelete, setCampanhaToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [campanhaToEdit, setCampanhaToEdit] = useState<string | null>(null);
  const [contatosDialogOpen, setContatosDialogOpen] = useState(false);
  const [campanhaContatos, setCampanhaContatos] = useState<{ id: string; nome: string } | null>(null);
  const [relatorioDialogOpen, setRelatorioDialogOpen] = useState(false);
  const [campanhaRelatorio, setCampanhaRelatorio] = useState<string | null>(null);
  const [instanceConnectionStatus, setInstanceConnectionStatus] = useState<Record<string, boolean | null>>({});
  const [checkingInstance, setCheckingInstance] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [campanhaToRename, setCampanhaToRename] = useState<{ id: string; nome: string } | null>(null);
  const [newCampanhaName, setNewCampanhaName] = useState("");
  const [respostasCount, setRespostasCount] = useState(0);

  const loadCampanhas = async () => {
    try {
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampanhas((data || []) as Campanha[]);
    } catch (error: any) {
      const isNetworkError = error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError');
      if (isNetworkError) {
        console.warn("Network error loading campaigns (silent):", error.message);
      } else {
        console.error("Error loading campaigns:", error);
        toast.error("Erro ao carregar campanhas");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadInstancias = async () => {
    try {
      const { data, error } = await supabase
        .from("disparos_instancias")
        .select("id, nome, base_url, api_key, is_active")
        .eq("is_active", true);

      if (error) throw error;
      setInstancias((data || []) as DisparosInstancia[]);
    } catch (error: any) {
      const isNetworkError = error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError');
      if (!isNetworkError) {
        console.error("Error loading instances:", error);
      }
    }
  };

  useEffect(() => {
    loadCampanhas();
    loadInstancias();
  }, []);

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("campanhas-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "disparos_campanhas",
          filter: `user_id=eq.${user.id}`
        },
        () => {
          loadCampanhas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Load reply count for campaigns in period
  useEffect(() => {
    const loadRespostas = async () => {
      if (!user?.id || campanhas.length === 0) {
        setRespostasCount(0);
        return;
      }

      const startOfPeriod = new Date(dateStart.getFullYear(), dateStart.getMonth(), dateStart.getDate(), 0, 0, 0, 0);
      const endOfPeriod = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), dateEnd.getDate(), 23, 59, 59, 999);

      const campanhasPeriodo = campanhas.filter(c => {
        const d = new Date(c.created_at);
        return d >= startOfPeriod && d <= endOfPeriod;
      });

      if (campanhasPeriodo.length === 0) {
        setRespostasCount(0);
        return;
      }

      try {
        // Get sent contacts from campaigns in period (last 8 digits)
        const campanhaIds = campanhasPeriodo.map(c => c.id);
        
        // Find the earliest campaign start time to filter messages
        const earliestCampaignStart = campanhasPeriodo.reduce((earliest, c) => {
          const start = c.iniciado_em || c.created_at;
          return !earliest || start < earliest ? start : earliest;
        }, "" as string);

        const sentNumbers = new Set<string>();
        const PAGE = 1000;

        for (let i = 0; i < campanhaIds.length; i += 500) {
          const batchIds = campanhaIds.slice(i, i + 500);
          let from = 0;
          while (true) {
            const { data } = await supabase
              .from("disparos_campanha_contatos")
              .select("numero")
              .in("campanha_id", batchIds)
              .in("status", ["sent", "delivered"])
              .range(from, from + PAGE - 1);
            if (!data || data.length === 0) break;
            data.forEach((d: any) => {
              const cleaned = d.numero?.replace(/\D/g, "");
              if (cleaned) sentNumbers.add(cleaned.slice(-8));
            });
            if (data.length < PAGE) break;
            from += PAGE;
          }
        }

        if (sentNumbers.size === 0) {
          setRespostasCount(0);
          return;
        }

        // Get ALL chats (paginated to avoid 1000-row limit)
        const allChats: { id: string; normalized_number: string }[] = [];
        let chatFrom = 0;
        const CHAT_PAGE = 1000;
        while (true) {
          const { data: chatPage } = await supabase
            .from("disparos_chats")
            .select("id, normalized_number")
            .eq("user_id", user.id)
            .is("deleted_at", null)
            .range(chatFrom, chatFrom + CHAT_PAGE - 1);
          if (!chatPage || chatPage.length === 0) break;
          allChats.push(...chatPage);
          if (chatPage.length < CHAT_PAGE) break;
          chatFrom += CHAT_PAGE;
        }

        if (allChats.length === 0) {
          setRespostasCount(0);
          return;
        }

        // Filter chats that match campaign contacts - deduplicate by last 8 digits
        // Only keep one chat per unique phone number to avoid >100%
        const seenPhones = new Set<string>();
        const matchedChats: { id: string; last8: string }[] = [];
        for (const chat of allChats) {
          const last8 = chat.normalized_number.slice(-8);
          if (sentNumbers.has(last8) && !seenPhones.has(last8)) {
            seenPhones.add(last8);
            matchedChats.push({ id: chat.id, last8 });
          }
        }

        if (matchedChats.length === 0) {
          setRespostasCount(0);
          return;
        }

        // Check which of these chats have a customer reply AFTER the campaign started
        const chatIds = matchedChats.map(c => c.id);
        const repliedPhones = new Set<string>();

        // Use batch IN query instead of individual queries for performance
        for (let i = 0; i < chatIds.length; i += 200) {
          const batchChatIds = chatIds.slice(i, i + 200);
          const batchChats = matchedChats.slice(i, i + 200);
          
          const { data: msgs } = await supabase
            .from("disparos_messages")
            .select("chat_id")
            .in("chat_id", batchChatIds)
            .eq("sender_type", "customer")
            .gte("timestamp", earliestCampaignStart)
            .limit(batchChatIds.length);

          if (msgs) {
            const repliedChatIds = new Set(msgs.map(m => m.chat_id));
            batchChats.forEach(c => {
              if (repliedChatIds.has(c.id)) {
                repliedPhones.add(c.last8);
              }
            });
          }
        }

        setRespostasCount(repliedPhones.size);
      } catch (error) {
        console.error("Error loading reply count:", error);
        setRespostasCount(0);
      }
    };

    loadRespostas();
  }, [user?.id, campanhas, dateStart, dateEnd]);

  const handleStartCampanha = async (campanhaId: string) => {
    setActionLoading(campanhaId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        toast.error("Sessão expirada");
        return;
      }

      const response = await supabase.functions.invoke("disparos-campanha-control", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { campanha_id: campanhaId, action: "start" }
      });

      if (response.error) throw response.error;
      toast.success("Campanha iniciada");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error starting campaign:", error);
      toast.error(error.message || "Erro ao iniciar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseCampanha = async (campanhaId: string) => {
    setActionLoading(campanhaId);
    try {
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ status: "paused" })
        .eq("id", campanhaId);

      if (error) throw error;
      toast.success("Campanha pausada");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error pausing campaign:", error);
      toast.error(error.message || "Erro ao pausar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCampanha = async () => {
    if (!campanhaToDelete) return;

    setActionLoading(campanhaToDelete);
    try {
      const { error } = await supabase
        .from("disparos_campanhas")
        .delete()
        .eq("id", campanhaToDelete);

      if (error) throw error;
      toast.success("Campanha excluída");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      toast.error(error.message || "Erro ao excluir campanha");
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setCampanhaToDelete(null);
    }
  };

  const handleDuplicateCampanha = async (campanhaId: string) => {
    if (!user) return;
    
    setActionLoading(campanhaId);
    try {
      // Load campaign data
      const { data: campanha, error: campanhaError } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .eq("id", campanhaId)
        .single();

      if (campanhaError || !campanha) throw new Error("Campanha não encontrada");

      // Load variations
      const { data: variacoes } = await supabase
        .from("disparos_campanha_variacoes")
        .select("*")
        .eq("campanha_id", campanhaId);

      // Load contacts (only non-archived)
      const { data: contatos } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero, nome")
        .eq("campanha_id", campanhaId)
        .eq("archived", false);

      // Create new campaign
      const { data: novaCampanha, error: novaCampanhaError } = await supabase
        .from("disparos_campanhas")
        .insert({
          user_id: user.id,
          nome: `${campanha.nome} (cópia)`,
          tipo_mensagem: campanha.tipo_mensagem,
          mensagem: campanha.mensagem,
          media_base64: campanha.media_base64,
          delay_min: campanha.delay_min,
          delay_max: campanha.delay_max,
          delay_bloco_min: campanha.delay_bloco_min,
          delay_bloco_max: campanha.delay_bloco_max,
          total_contatos: contatos?.length || 0,
          status: "pending",
          instancias_ids: campanha.instancias_ids
        })
        .select()
        .single();

      if (novaCampanhaError) throw novaCampanhaError;

      // Copy variations
      if (variacoes && variacoes.length > 0) {
        const novasVariacoes = variacoes.map(v => ({
          campanha_id: novaCampanha.id,
          bloco: v.bloco,
          tipo_mensagem: v.tipo_mensagem,
          mensagem: v.mensagem,
          media_base64: v.media_base64,
          ordem: v.ordem
        }));

        await supabase
          .from("disparos_campanha_variacoes")
          .insert(novasVariacoes);
      }

      // Copy contacts
      if (contatos && contatos.length > 0) {
        const novosContatos = contatos.map(c => ({
          campanha_id: novaCampanha.id,
          numero: c.numero,
          nome: c.nome,
          status: "pending"
        }));

        await supabase
          .from("disparos_campanha_contatos")
          .insert(novosContatos);
      }

      toast.success("Campanha duplicada com sucesso!");
      loadCampanhas();
      onRefresh();
    } catch (error: any) {
      console.error("Error duplicating campaign:", error);
      toast.error(error.message || "Erro ao duplicar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  // Rename campaign
  const handleRenameCampanha = async () => {
    if (!campanhaToRename || !newCampanhaName.trim()) return;

    try {
      setActionLoading(campanhaToRename.id);
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ nome: newCampanhaName.trim() })
        .eq("id", campanhaToRename.id);

      if (error) throw error;

      toast.success("Nome da campanha atualizado!");
      loadCampanhas();
      setRenameDialogOpen(false);
      setCampanhaToRename(null);
      setNewCampanhaName("");
    } catch (error: any) {
      console.error("Error renaming campaign:", error);
      toast.error("Erro ao renomear campanha");
    } finally {
      setActionLoading(null);
    }
  };

  // Check instance connection status
  const checkInstanceConnection = async (instanceId: string) => {
    const instance = instancias.find(i => i.id === instanceId);
    if (!instance) return;

    setCheckingInstance(instanceId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke("uazapi-check-status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { base_url: instance.base_url, api_key: instance.api_key }
      });

      const isConnected = response.data?.success === true;
      setInstanceConnectionStatus(prev => ({ ...prev, [instanceId]: isConnected }));
      return isConnected;
    } catch (error) {
      console.error("Error checking instance connection:", error);
      setInstanceConnectionStatus(prev => ({ ...prev, [instanceId]: false }));
      return false;
    } finally {
      setCheckingInstance(null);
    }
  };

  // Reactivate a disabled instance
  const handleReactivateInstance = async (campanhaId: string, instanceId: string) => {
    // First check if instance is connected
    const isConnected = await checkInstanceConnection(instanceId);
    
    if (!isConnected) {
      toast.error("Instância ainda não está conectada. Verifique a conexão primeiro.");
      return;
    }

    try {
      // Get current campaign data
      const { data: campanha } = await supabase
        .from("disparos_campanhas")
        .select("disabled_instancias_ids, instance_rotation_state")
        .eq("id", campanhaId)
        .single();

      const currentDisabled: string[] = (campanha?.disabled_instancias_ids as string[]) || [];
      const newDisabled = currentDisabled.filter(id => id !== instanceId);

      // Reset the instance stats in rotation state to match the minimum sends
      // This prevents the reactivated instance from being forced to "catch up"
      const rotationState = (campanha?.instance_rotation_state as Record<string, { sends: number; lastSendAt: number }>) || {};
      
      // Find minimum sends among all instances
      const allSends = Object.values(rotationState).map(s => s.sends || 0);
      const minSends = allSends.length > 0 ? Math.min(...allSends) : 0;
      
      // Reset the reactivated instance to match minimum
      const updatedRotationState = {
        ...rotationState,
        [instanceId]: { sends: minSends, lastSendAt: 0 }
      };

      await supabase
        .from("disparos_campanhas")
        .update({ 
          disabled_instancias_ids: newDisabled,
          instance_rotation_state: updatedRotationState
        })
        .eq("id", campanhaId);

      toast.success("Instância reativada na campanha");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error reactivating instance:", error);
      toast.error("Erro ao reativar instância");
    }
  };

  // Get disabled instances for a campaign with their names
  const getDisabledInstances = (campanha: Campanha) => {
    const disabledIds = campanha.disabled_instancias_ids || [];
    return disabledIds.map(id => {
      const instance = instancias.find(i => i.id === id);
      return { id, nome: instance?.nome || "Instância desconhecida" };
    }).filter(i => i.nome !== "Instância desconhecida");
  };

  // Get active instances for a campaign (configured minus disabled)
  // Sorted by "next to send" - lowest score first (mirrors backend heuristics)
  const getActiveInstances = (campanha: Campanha) => {
    const configuredIds = campanha.instancias_ids || [];
    const disabledIds = campanha.disabled_instancias_ids || [];
    const rotationState = (campanha.instance_rotation_state || {}) as Record<
      string,
      { sends?: number; lastSendAt?: string | number | null }
    >;
    const lastUsedInstanceId = campanha.last_instance_id;

    const toTs = (value: string | number | null | undefined) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "number") return value > 0 ? value : null;
      const ts = Date.parse(value);
      return Number.isFinite(ts) ? ts : null;
    };

    const activeInstances = configuredIds
      .filter((id) => !disabledIds.includes(id))
      .map((id) => {
        const instance = instancias.find((i) => i.id === id);
        const stateEntry = rotationState[id];
        const sends = stateEntry?.sends || 0;
        const lastSendAtRaw = stateEntry?.lastSendAt ?? null;
        return { id, nome: instance?.nome || null, lastSendAt: lastSendAtRaw, sends };
      })
      .filter((i) => i.nome !== null) as {
      id: string;
      nome: string;
      lastSendAt: string | number | null;
      sends: number;
    }[];

    const minSends = activeInstances.length > 0 ? Math.min(...activeInstances.map((i) => i.sends)) : 0;

    const getScore = (inst: (typeof activeInstances)[number]) => {
      let score = 0;

      // Send penalty: 50 points per send above minimum
      score += (inst.sends - minSends) * 50;

      // Recency penalty: up to 30 points if used within the last 30s
      const lastTs = toTs(inst.lastSendAt);
      if (lastTs) {
        const timeSinceLastSend = Date.now() - lastTs;
        if (timeSinceLastSend < 30_000) {
          score += Math.max(0, 30 - timeSinceLastSend / 1000);
        }
      }

      // Anti-repetition: avoid using the same instance twice in a row
      if (inst.id === lastUsedInstanceId) score += 100;

      return score;
    };

    return activeInstances.sort((a, b) => {
      const scoreA = getScore(a);
      const scoreB = getScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB;

      // Tie-breaker: prefer the one with older lastSendAt
      const ta = toTs(a.lastSendAt) ?? -1;
      const tb = toTs(b.lastSendAt) ?? -1;
      if (ta !== tb) return ta - tb;

      return a.nome.localeCompare(b.nome);
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case "running":
        return <Badge className="gap-1 bg-blue-500"><Play className="h-3 w-3" /> Executando</Badge>;
      case "paused":
        return <Badge variant="secondary" className="gap-1"><Pause className="h-3 w-3" /> Pausada</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" /> Concluída</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTipoMensagemLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      text: "Texto",
      image: "Imagem",
      audio: "Áudio",
      video: "Vídeo",
      document: "Documento"
    };
    return labels[tipo] || tipo;
  };

  // ── Dashboard Stats ──────────────────────────────────────────────────
  const dashStats = useMemo(() => {
    const startOfPeriod = new Date(dateStart.getFullYear(), dateStart.getMonth(), dateStart.getDate(), 0, 0, 0, 0);
    const endOfPeriod = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), dateEnd.getDate(), 23, 59, 59, 999);

    const campanhasPeriodo = campanhas.filter(c => {
      const d = new Date(c.created_at);
      return d >= startOfPeriod && d <= endOfPeriod;
    });

    const totalCampanhas = campanhasPeriodo.length;
    const totalEnviados = campanhasPeriodo.reduce((s, c) => s + c.enviados, 0);
    const totalFalhas = campanhasPeriodo.reduce((s, c) => s + c.falhas, 0);
    const taxaSucesso = totalEnviados + totalFalhas > 0
      ? Math.round((totalEnviados / (totalEnviados + totalFalhas)) * 100)
      : 0;

    return { totalCampanhas, totalEnviados, totalFalhas, taxaSucesso };
  }, [campanhas, dateStart, dateEnd]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium mb-2">Nenhuma campanha</h2>
        <p className="text-muted-foreground">
          Crie sua primeira campanha de disparo
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Period Filter */}
      <Card className="p-4">
        <PeriodFilter
          showLabel
          value={periodFilter}
          onChange={setPeriodFilter}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateStartChange={setDateStart}
          onDateEndChange={setDateEnd}
        />
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Campanhas"
          value={dashStats.totalCampanhas}
          change="No período"
          changeType="neutral"
          icon={Megaphone}
        />
        <StatsCard
          title="Enviados"
          value={dashStats.totalEnviados.toLocaleString("pt-BR")}
          change={`${dashStats.taxaSucesso}% de sucesso`}
          changeType={dashStats.taxaSucesso >= 90 ? "positive" : dashStats.taxaSucesso >= 70 ? "neutral" : "negative"}
          icon={Send}
        />
        <StatsCard
          title="Falhas"
          value={dashStats.totalFalhas.toLocaleString("pt-BR")}
          change={dashStats.totalFalhas > 0 ? "Verifique os erros" : "Nenhuma falha"}
          changeType={dashStats.totalFalhas > 0 ? "negative" : "positive"}
          icon={Ban}
        />
        <StatsCard
          title="Taxa de Respostas"
          value={dashStats.totalEnviados > 0 ? `${Math.round((respostasCount / dashStats.totalEnviados) * 100)}%` : "0%"}
          change={`${respostasCount} respostas de ${dashStats.totalEnviados.toLocaleString("pt-BR")}`}
          changeType={respostasCount > 0 ? "positive" : "neutral"}
          icon={Users}
        />
      </div>

      {/* Campaign List */}
      {campanhas.map((campanha) => {
        const progress = campanha.total_contatos > 0
          ? ((campanha.enviados + campanha.falhas) / campanha.total_contatos) * 100
          : 0;

        return (
          <Card key={campanha.id} className="p-4">
            <div className="flex flex-col gap-4">
              {/* Header: Nome + Status + Tipo */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{campanha.nome}</h3>
                  {getStatusBadge(campanha.status)}
                  <Badge variant="outline">{getTipoMensagemLabel(campanha.tipo_mensagem)}</Badge>
                </div>
                
                {/* Action buttons - visible on desktop, hidden on mobile */}
                <div className="hidden sm:flex items-center gap-2">
                  {campanha.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStartCampanha(campanha.id)}
                        disabled={actionLoading === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Iniciar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCampanhaToEdit(campanha.id);
                          setEditDialogOpen(true);
                        }}
                        disabled={actionLoading === campanha.id}
                        title="Editar campanha"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {campanha.status === "running" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePauseCampanha(campanha.id)}
                        disabled={actionLoading === campanha.id}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pausar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCampanhaToRename({ id: campanha.id, nome: campanha.nome });
                          setNewCampanhaName(campanha.nome);
                          setRenameDialogOpen(true);
                        }}
                        disabled={actionLoading === campanha.id}
                        title="Renomear campanha"
                      >
                        <Type className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {campanha.status === "paused" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStartCampanha(campanha.id)}
                        disabled={actionLoading === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Continuar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCampanhaToEdit(campanha.id);
                          setEditDialogOpen(true);
                        }}
                        disabled={actionLoading === campanha.id}
                        title="Editar campanha"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {campanha.status === "completed" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setCampanhaToRename({ id: campanha.id, nome: campanha.nome });
                        setNewCampanhaName(campanha.nome);
                        setRenameDialogOpen(true);
                      }}
                      disabled={actionLoading === campanha.id}
                      title="Renomear campanha"
                    >
                      <Type className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCampanhaRelatorio(campanha.id);
                      setRelatorioDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                    title="Ver relatório"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDuplicateCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                    title="Duplicar campanha"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCampanhaToDelete(campanha.id);
                      setDeleteDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                    title="Excluir campanha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Stats: Total, Enviados, Falhas, Delay */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <button
                  className="hover:underline cursor-pointer"
                  onClick={() => {
                    setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                    setContatosDialogOpen(true);
                  }}
                >
                  Total: {campanha.total_contatos}
                </button>
                <button
                  className="text-green-600 hover:underline cursor-pointer"
                  onClick={() => {
                    setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                    setContatosDialogOpen(true);
                  }}
                >
                  Enviados: {campanha.enviados}
                </button>
                {campanha.falhas > 0 && (
                  <button
                    className="text-destructive hover:underline cursor-pointer"
                    onClick={() => {
                      setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                      setContatosDialogOpen(true);
                    }}
                  >
                    Falhas: {campanha.falhas}
                  </button>
                )}
                <span>Delay: {campanha.delay_min >= 60 && campanha.delay_max >= 60 ? `${Math.round(campanha.delay_min / 60)}-${Math.round(campanha.delay_max / 60)}min` : `${campanha.delay_min}-${campanha.delay_max}s`}</span>
              </div>

              {/* Active instances popover */}
              {(() => {
                const activeInstances = getActiveInstances(campanha);
                if (activeInstances.length === 0) return null;
                
                return (
                  <div className="flex justify-start">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 px-2.5 gap-1.5 text-sm text-muted-foreground hover:text-foreground -ml-2">
                            <Wifi className="h-4 w-4 text-primary" />
                            <span>{activeInstances.length} instância{activeInstances.length > 1 ? 's' : ''}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="start" className="p-2">
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium mb-2">Instâncias ativas:</p>
                            {activeInstances.map((inst, index) => {
                              const raw = inst.lastSendAt;
                              const date = raw ? new Date(typeof raw === 'number' ? raw : raw) : null;
                              const hasValidDate = !!date && !Number.isNaN(date.getTime());

                              return (
                                <div
                                  key={inst.id}
                                  className={`flex items-center justify-between gap-4 text-xs ${index === 0 ? 'bg-accent/40 -mx-1 px-1 py-0.5 rounded' : ''}`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {index === 0 ? (
                                      <ArrowRight className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Wifi className="h-3 w-3 text-primary" />
                                    )}
                                    {inst.nome}
                                    {index === 0 && (
                                      <Badge variant="outline" className="text-[10px] h-4 px-1 text-primary border-primary">
                                        próxima
                                      </Badge>
                                    )}
                                  </span>
                                  {hasValidDate ? (
                                    <span className="text-muted-foreground">
                                      {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Sem envios</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })()}

              {/* Disabled instances warning */}
              {(() => {
                const disabledInstances = getDisabledInstances(campanha);
                if (disabledInstances.length === 0) return null;
                
                return (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                      <WifiOff className="h-4 w-4" />
                      <span className="text-sm font-medium">Instâncias desconectadas</span>
                    </div>
                    <div className="space-y-2">
                      {disabledInstances.map(inst => {
                        const connectionStatus = instanceConnectionStatus[inst.id];
                        const isChecking = checkingInstance === inst.id;
                        
                        return (
                          <div key={inst.id} className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{inst.nome}</span>
                              {connectionStatus === true && (
                                <Badge variant="outline" className="text-green-600 border-green-600 gap-1 text-xs">
                                  <Wifi className="h-3 w-3" />
                                  Online
                                </Badge>
                              )}
                              {connectionStatus === false && (
                                <Badge variant="outline" className="text-red-600 border-red-600 gap-1 text-xs">
                                  <WifiOff className="h-3 w-3" />
                                  Offline
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2"
                                      onClick={() => checkInstanceConnection(inst.id)}
                                      disabled={isChecking}
                                    >
                                      <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Verificar conexão</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant={connectionStatus === true ? "default" : "outline"}
                                      className="h-7 px-2 gap-1"
                                      onClick={() => handleReactivateInstance(campanha.id, inst.id)}
                                      disabled={isChecking || connectionStatus === false}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Reativar
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {connectionStatus === true 
                                      ? "Clique para reativar esta instância" 
                                      : "Verifique a conexão primeiro"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Progress bar */}
              {(campanha.status === "running" || campanha.status === "completed") && (
                <div className="space-y-1">
                  <Progress value={progress} className="h-2" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {Math.round(progress)}% concluído
                    </p>
                    {campanha.status === "running" && campanha.next_send_at && campanha.delay_min >= 60 && (
                      <p className="text-xs text-blue-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Próximo envio: {format(new Date(campanha.next_send_at), "HH:mm:ss", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-0.5">
                {campanha.iniciado_em && (
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                    <span>Iniciada em {format(new Date(campanha.iniciado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {campanha.finalizado_em && (
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                    <span>Finalizada em {format(new Date(campanha.finalizado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>

              {/* Mobile action buttons */}
              <div className="flex sm:hidden flex-wrap items-center gap-2 pt-2 border-t">
                {campanha.status === "pending" && (
                  <Button
                    size="icon"
                    onClick={() => handleStartCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {campanha.status === "running" && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handlePauseCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {campanha.status === "paused" && (
                  <Button
                    size="icon"
                    onClick={() => handleStartCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {(campanha.status === "pending" || campanha.status === "paused") && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setCampanhaToEdit(campanha.id);
                      setEditDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {(campanha.status === "running" || campanha.status === "completed") && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setCampanhaToRename({ id: campanha.id, nome: campanha.nome });
                      setNewCampanhaName(campanha.nome);
                      setRenameDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                    title="Renomear"
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setCampanhaRelatorio(campanha.id);
                    setRelatorioDialogOpen(true);
                  }}
                  disabled={actionLoading === campanha.id}
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleDuplicateCampanha(campanha.id)}
                  disabled={actionLoading === campanha.id}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setCampanhaToDelete(campanha.id);
                    setDeleteDialogOpen(true);
                  }}
                  disabled={actionLoading === campanha.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados da campanha serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCampanha}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditarCampanhaDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        campanhaId={campanhaToEdit}
        onCampanhaAtualizada={() => {
          loadCampanhas();
          onRefresh();
        }}
      />

      <ContatosCampanhaDialog
        open={contatosDialogOpen}
        onOpenChange={setContatosDialogOpen}
        campanhaId={campanhaContatos?.id || null}
        campanhaNome={campanhaContatos?.nome || ""}
      />

      <RelatorioCampanhaDialog
        open={relatorioDialogOpen}
        onOpenChange={setRelatorioDialogOpen}
        campanhaId={campanhaRelatorio}
      />

      {/* Rename Campaign Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={(open) => {
        setRenameDialogOpen(open);
        if (!open) {
          setCampanhaToRename(null);
          setNewCampanhaName("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear Campanha</DialogTitle>
            <DialogDescription>
              Digite o novo nome para a campanha
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Nome da campanha</Label>
              <Input
                id="campaign-name"
                value={newCampanhaName}
                onChange={(e) => setNewCampanhaName(e.target.value)}
                placeholder="Nome da campanha"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCampanhaName.trim()) {
                    handleRenameCampanha();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRenameCampanha} 
              disabled={!newCampanhaName.trim() || actionLoading === campanhaToRename?.id}
            >
              {actionLoading === campanhaToRename?.id ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
