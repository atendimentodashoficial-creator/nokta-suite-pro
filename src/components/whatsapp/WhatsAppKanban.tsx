import { useState, useEffect, useRef } from "react";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatAvatar } from "./ChatAvatar";
import { FaturasClienteDialog, type FaturaResumo } from "./FaturasClienteDialog";
import { AgendamentosClienteDialog, type AgendamentoResumo } from "./AgendamentosClienteDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneNumber, formatRelativeTime, formatLastMessagePreview, truncateText } from "@/utils/whatsapp";
import { Plus, Settings, Trash2, GripVertical, X, Check, Pencil, Calendar, CheckSquare, Square, XCircle, DollarSign } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
interface ChatAgendamento {
  id: string;
  data_agendamento: string;
  status: string;
  totalAgendamentos: number; // How many agendamentos this client has in history
  updated_at?: string; // When the agendamento was last updated
}
interface WhatsAppKanbanProps {
  chats: any[];
  onChatSelect: (chat: any) => void;
  selectedChatId?: string;
  onChatsDeleted?: (payload: { ids: string[]; normalizedNumbers: string[] }) => void;
}
interface KanbanColumn {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
}
const DEFAULT_COLORS = ["#3b82f6",
// blue
"#f59e0b",
// amber
"#ef4444",
// red
"#22c55e",
// green
"#8b5cf6",
// violet
"#ec4899",
// pink
"#06b6d4",
// cyan
"#f97316" // orange
];
export function WhatsAppKanban({
  chats,
  onChatSelect,
  selectedChatId,
  onChatsDeleted
}: WhatsAppKanbanProps) {
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  useHorizontalScroll(kanbanScrollRef);
  
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [chatColumnMap, setChatColumnMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState(DEFAULT_COLORS[0]);
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [chatAgendamentos, setChatAgendamentos] = useState<Record<string, ChatAgendamento | null>>({});
  const [chatAllAgendamentos, setChatAllAgendamentos] = useState<Record<string, AgendamentoResumo[]>>({});
  
  // Faturas state
  const [chatFaturas, setChatFaturas] = useState<Record<string, FaturaResumo[]>>({});
  const [faturasDialogOpen, setFaturasDialogOpen] = useState(false);
  const [selectedFaturas, setSelectedFaturas] = useState<FaturaResumo[]>([]);
  const [selectedFaturaClienteNome, setSelectedFaturaClienteNome] = useState("");

  // Agendamentos dialog state
  const [agendamentosDialogOpen, setAgendamentosDialogOpen] = useState(false);
  const [selectedAgendamentos, setSelectedAgendamentos] = useState<AgendamentoResumo[]>([]);
  const [selectedAgendamentoClienteNome, setSelectedAgendamentoClienteNome] = useState("");

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load columns and chat assignments
  useEffect(() => {
    loadData();
  }, []);

  // Load agendamentos for chats
  useEffect(() => {
    if (chats.length > 0) {
      loadChatAgendamentos();
      loadChatFaturas();
    }
  }, [chats]);

  // Subscribe to agendamentos changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-kanban-agendamentos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agendamentos'
        },
        () => {
          // Reload agendamentos when any change happens
          if (chats.length > 0) {
            loadChatAgendamentos();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chats]);
  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load columns
      const {
        data: columnsData
      } = await supabase.from("whatsapp_kanban_columns").select("*").eq("ativo", true).order("ordem", {
        ascending: true
      });
      setColumns(columnsData || []);

      // Load chat-column assignments
      const {
        data: assignmentsData
      } = await supabase.from("whatsapp_chat_kanban").select("chat_id, column_id");
      const map: Record<string, string> = {};
      assignmentsData?.forEach(a => {
        map[a.chat_id] = a.column_id;
      });
      setChatColumnMap(map);
    } catch (error) {
      console.error("Error loading kanban data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper: paginated fetch for leads table (handles >1000 rows)
  const fetchAllLeads = async (select: string): Promise<any[]> => {
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("leads")
        .select(select)
        .is("deleted_at", null)
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  // Load agendamentos for chats based on phone matching (last 8 digits)
  const loadChatAgendamentos = async () => {
    try {
      const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");
      const last8 = (v: string) => {
        const d = onlyDigits(v);
        return d.length >= 8 ? d.slice(-8) : d;
      };

      // Build last-8 map for chats (chat.id -> last8)
      const chatIdToLast8: Record<string, string> = {};
      const last8Set = new Set<string>();
      chats.forEach(chat => {
        const k = last8(chat?.normalized_number || chat?.contact_number || "");
        if (!k) return;
        chatIdToLast8[chat.id] = k;
        last8Set.add(k);
      });
      if (last8Set.size === 0) return;

      // Fetch ALL leads with pagination (>1000 rows)
      const leads = await fetchAllLeads("id, telefone");
      if (leads.length === 0) return;

      // Map last8 -> ALL leadIds (handle duplicates with same phone)
      // Only keep leads whose phone matches a chat on screen
      const last8ToLeadIds: Record<string, string[]> = {};
      const relevantLeadIds: string[] = [];
      leads.forEach(l => {
        const k = last8(l.telefone);
        if (!k || !last8Set.has(k)) return;
        if (!last8ToLeadIds[k]) last8ToLeadIds[k] = [];
        last8ToLeadIds[k].push(l.id);
        relevantLeadIds.push(l.id);
      });
      if (relevantLeadIds.length === 0) {
        setChatAgendamentos({});
        setChatAllAgendamentos({});
        return;
      }

      // Get agendamentos in batches (large .in() causes URL overflow)
      const BATCH = 200;
      const allAgendamentos: any[] = [];
      for (let i = 0; i < relevantLeadIds.length; i += BATCH) {
        const batch = relevantLeadIds.slice(i, i + BATCH);
        const { data: agendamentos } = await supabase.from("agendamentos").select(`
          id, cliente_id, data_agendamento, status, updated_at, tipo, observacoes,
          data_follow_up, numero_reagendamentos, origem_agendamento,
          procedimentos:procedimento_id(nome),
          profissionais:profissional_id(nome)
        `).in("cliente_id", batch).in("status", ["agendado", "confirmado", "cancelado", "realizado"]).order("updated_at", {
          ascending: false
        }).limit(1000);
        if (agendamentos) allAgendamentos.push(...agendamentos);
      }

      // Get fatura_agendamentos to know which "realizado" are visible (have fatura)
      const agendamentoIds = allAgendamentos.map(a => a.id);
      let agendamentosComFatura = new Set<string>();
      if (agendamentoIds.length > 0) {
        const allFaturaAg: string[] = [];
        for (let i = 0; i < agendamentoIds.length; i += BATCH) {
          const batch = agendamentoIds.slice(i, i + BATCH);
          const { data: faturaAgendamentos } = await supabase
            .from("fatura_agendamentos")
            .select("agendamento_id")
            .in("agendamento_id", batch);
          if (faturaAgendamentos) allFaturaAg.push(...faturaAgendamentos.map(fa => fa.agendamento_id));
        }
        agendamentosComFatura = new Set(allFaturaAg);
      }

      // Filter to only VISIBLE agendamentos
      const visibleAgendamentos = allAgendamentos.filter(ag => {
        if (ag.status === "agendado" || ag.status === "confirmado" || ag.status === "cancelado") return true;
        if (ag.status === "realizado") return agendamentosComFatura.has(ag.id);
        return false;
      });

      // Create leadId -> last8 map (only relevant leads)
      const leadIdToLast8: Record<string, string> = {};
      leads.forEach(l => {
        const k = last8(l.telefone);
        if (k && last8Set.has(k)) leadIdToLast8[l.id] = k;
      });

      // Best agendamento per phone (last8)
      const last8ToAgendamento: Record<string, ChatAgendamento> = {};
      const last8AgendamentoCount: Record<string, number> = {};
      const last8ToAllAgendamentos: Record<string, AgendamentoResumo[]> = {};
      
      visibleAgendamentos.forEach((ag: any) => {
        const phoneKey = leadIdToLast8[ag.cliente_id];
        if (!phoneKey) return;
        last8AgendamentoCount[phoneKey] = (last8AgendamentoCount[phoneKey] || 0) + 1;
        if (!last8ToAllAgendamentos[phoneKey]) last8ToAllAgendamentos[phoneKey] = [];
        last8ToAllAgendamentos[phoneKey].push({
          id: ag.id,
          data_agendamento: ag.data_agendamento,
          status: ag.status,
          tipo: ag.tipo || "",
          observacoes: ag.observacoes,
          data_follow_up: ag.data_follow_up,
          numero_reagendamentos: ag.numero_reagendamentos || 0,
          origem_agendamento: ag.origem_agendamento,
          procedimento_nome: ag.procedimentos?.nome || null,
          profissional_nome: ag.profissionais?.nome || null,
        });
      });
      
      visibleAgendamentos.forEach((ag: any) => {
        const phoneKey = leadIdToLast8[ag.cliente_id];
        if (!phoneKey) return;
        if (last8ToAgendamento[phoneKey]) return;
        last8ToAgendamento[phoneKey] = {
          id: ag.id,
          data_agendamento: ag.data_agendamento,
          status: ag.status,
          totalAgendamentos: last8AgendamentoCount[phoneKey] || 1,
          updated_at: ag.updated_at
        };
      });

      const chatAgMap: Record<string, ChatAgendamento | null> = {};
      const chatAllAgMap: Record<string, AgendamentoResumo[]> = {};
      chats.forEach(chat => {
        const k = chatIdToLast8[chat.id];
        chatAgMap[chat.id] = k ? last8ToAgendamento[k] ?? null : null;
        chatAllAgMap[chat.id] = k ? last8ToAllAgendamentos[k] ?? [] : [];
      });
      setChatAgendamentos(chatAgMap);
      setChatAllAgendamentos(chatAllAgMap);
    } catch (error) {
      console.error("Error loading chat agendamentos:", error);
    }
  };

  // Load faturas for chats based on phone matching (last 8 digits)
  const loadChatFaturas = async () => {
    try {
      const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");
      const last8 = (v: string) => {
        const d = onlyDigits(v);
        return d.length >= 8 ? d.slice(-8) : d;
      };

      const chatIdToLast8: Record<string, string> = {};
      const last8Set = new Set<string>();
      chats.forEach(chat => {
        const k = last8(chat?.normalized_number || chat?.contact_number || "");
        if (!k) return;
        chatIdToLast8[chat.id] = k;
        last8Set.add(k);
      });
      if (last8Set.size === 0) return;

      // Fetch ALL leads with pagination (>1000 rows)
      const leads = await fetchAllLeads("id, telefone, nome");

      if (!leads || leads.length === 0) return;

      const last8ToLeadIds: Record<string, { id: string; nome: string }[]> = {};
      leads.forEach(l => {
        const k = last8(l.telefone);
        if (!k || !last8Set.has(k)) return;
        if (!last8ToLeadIds[k]) last8ToLeadIds[k] = [];
        last8ToLeadIds[k].push({ id: l.id, nome: l.nome });
      });

      const allLeadIds = Array.from(new Set(Object.values(last8ToLeadIds).flatMap(arr => arr.map(l => l.id))));

      // Fetch faturas in batches (large .in() causes URL overflow)
      const BATCH = 200;
      const faturasWithCliente: any[] = [];
      for (let i = 0; i < allLeadIds.length; i += BATCH) {
        const batch = allLeadIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from("faturas")
          .select(`
            id, valor, status, observacoes, data_fatura, data_follow_up, created_at,
            meio_pagamento, forma_pagamento, cliente_id,
            procedimentos:procedimento_id(nome),
            profissionais:profissional_id(nome)
          `)
          .in("cliente_id", batch)
          .order("created_at", { ascending: false });
        if (data) faturasWithCliente.push(...data);
      }

      if (!faturasWithCliente || faturasWithCliente.length === 0) {
        setChatFaturas({});
        return;
      }

      // Fetch retornos in batches
      const faturaIds = faturasWithCliente.map((f: any) => f.id);
      const retornos: any[] = [];
      for (let i = 0; i < faturaIds.length; i += BATCH) {
        const batch = faturaIds.slice(i, i + BATCH);
        const { data } = await supabase
          .from("agendamentos")
          .select(`
            id, data_agendamento, status, retorno_fatura_id,
            procedimentos:procedimento_id(nome),
            profissionais:profissional_id(nome)
          `)
          .in("retorno_fatura_id", batch)
          .order("data_agendamento", { ascending: true });
        if (data) retornos.push(...data);
      }

      // Group retornos by fatura_id
      const retornosByFatura: Record<string, any[]> = {};
      (retornos || []).forEach((r: any) => {
        if (!r.retorno_fatura_id) return;
        if (!retornosByFatura[r.retorno_fatura_id]) retornosByFatura[r.retorno_fatura_id] = [];
        retornosByFatura[r.retorno_fatura_id].push({
          id: r.id,
          data_agendamento: r.data_agendamento,
          status: r.status,
          procedimento_nome: r.procedimentos?.nome || null,
          profissional_nome: r.profissionais?.nome || null,
        });
      });

      // Map leadId -> last8
      const leadIdToLast8: Record<string, string> = {};
      leads.forEach(l => {
        const k = last8(l.telefone);
        if (k) leadIdToLast8[l.id] = k;
      });

      // Group faturas by phone last8
      const last8ToFaturas: Record<string, FaturaResumo[]> = {};
      faturasWithCliente.forEach((f: any) => {
        const phoneKey = leadIdToLast8[f.cliente_id];
        if (!phoneKey) return;
        if (!last8ToFaturas[phoneKey]) last8ToFaturas[phoneKey] = [];
        last8ToFaturas[phoneKey].push({
          id: f.id,
          valor: f.valor,
          status: f.status,
          observacoes: f.observacoes,
          data_fatura: f.data_fatura,
          data_follow_up: f.data_follow_up,
          created_at: f.created_at,
          meio_pagamento: f.meio_pagamento,
          forma_pagamento: f.forma_pagamento,
          procedimento_nome: f.procedimentos?.nome || null,
          profissional_nome: f.profissionais?.nome || null,
          retornos: retornosByFatura[f.id] || [],
        });
      });

      // Map chatId -> faturas
      const chatFatMap: Record<string, FaturaResumo[]> = {};
      chats.forEach(chat => {
        const k = chatIdToLast8[chat.id];
        chatFatMap[chat.id] = k ? (last8ToFaturas[k] || []) : [];
      });
      setChatFaturas(chatFatMap);
    } catch (error) {
      console.error("Error loading chat faturas:", error);
    }
  };

  // Render fatura badge for a chat
  const renderFaturaBadge = (chat: any) => {
    const faturas = chatFaturas[chat.id];
    if (!faturas || faturas.length === 0) return null;

    const negociacoes = faturas.filter(f => f.status === "negociacao").length;
    const fechadas = faturas.filter(f => f.status === "fechado").length;

    let label = "";
    if (negociacoes > 0 && fechadas > 0) {
      label = `${fechadas} fatura${fechadas > 1 ? "s" : ""} · ${negociacoes} negociação${negociacoes > 1 ? "ões" : ""}`;
    } else if (fechadas > 0) {
      label = `${fechadas} fatura${fechadas > 1 ? "s" : ""}`;
    } else {
      label = `${negociacoes} negociação${negociacoes > 1 ? "ões" : ""}`;
    }

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFaturas(faturas);
                setSelectedFaturaClienteNome(chat.contact_name || formatPhoneNumber(chat.contact_number));
                setFaturasDialogOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs mt-1 w-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors text-left"
            >
              <DollarSign className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clique para ver faturas e negociações</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Create new column
  const createColumn = async () => {
    if (!newColumnName.trim()) {
      toast.error("Digite um nome para a etapa");
      return;
    }
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data,
        error
      } = await supabase.from("whatsapp_kanban_columns").insert({
        user_id: user.id,
        nome: newColumnName.trim(),
        cor: newColumnColor,
        ordem: columns.length
      }).select().single();
      if (error) throw error;
      setColumns([...columns, data]);
      setNewColumnName("");
      setNewColumnColor(DEFAULT_COLORS[(columns.length + 1) % DEFAULT_COLORS.length]);
      toast.success("Etapa criada!");
    } catch (error) {
      console.error("Error creating column:", error);
      toast.error("Erro ao criar etapa");
    }
  };

  // Update column
  const updateColumn = async () => {
    if (!editingColumn) return;
    try {
      const {
        error
      } = await supabase.from("whatsapp_kanban_columns").update({
        nome: editingColumn.nome,
        cor: editingColumn.cor
      }).eq("id", editingColumn.id);
      if (error) throw error;
      setColumns(columns.map(c => c.id === editingColumn.id ? editingColumn : c));
      setEditingColumn(null);
      toast.success("Etapa atualizada!");
    } catch (error) {
      console.error("Error updating column:", error);
      toast.error("Erro ao atualizar etapa");
    }
  };

  // Delete column
  const deleteColumn = async (columnId: string) => {
    try {
      const {
        error
      } = await supabase.from("whatsapp_kanban_columns").delete().eq("id", columnId);
      if (error) throw error;
      setColumns(columns.filter(c => c.id !== columnId));
      toast.success("Etapa excluída!");
    } catch (error) {
      console.error("Error deleting column:", error);
      toast.error("Erro ao excluir etapa");
    }
  };

  // Handle column reorder drag start
  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.stopPropagation();
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
  };

  // Handle column reorder drop
  const handleColumnDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      return;
    }
    const draggedIndex = columns.findIndex(c => c.id === draggedColumnId);
    const targetIndex = columns.findIndex(c => c.id === targetColumnId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumnId(null);
      return;
    }

    // Reorder columns locally
    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    // Update ordem for all columns
    const updatedColumns = newColumns.map((col, index) => ({
      ...col,
      ordem: index
    }));
    setColumns(updatedColumns);
    setDraggedColumnId(null);

    // Update in database
    try {
      const updates = updatedColumns.map(col => supabase.from("whatsapp_kanban_columns").update({
        ordem: col.ordem
      }).eq("id", col.id));
      await Promise.all(updates);
      toast.success("Ordem atualizada!");
    } catch (error) {
      console.error("Error updating column order:", error);
      toast.error("Erro ao atualizar ordem");
      loadData(); // Reload on error
    }
  };
  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, chat: any) => {
    e.dataTransfer.setData("chatId", chat.id);

    // Create a custom drag image using only the card element
    const target = e.currentTarget as HTMLElement;
    if (target) {
      // Clone the card for the drag image
      const clone = target.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.width = `${target.offsetWidth}px`;
      clone.style.opacity = '0.9';
      clone.style.transform = 'rotate(2deg)';
      clone.style.borderRadius = '12px';
      clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
      clone.style.backgroundColor = getComputedStyle(target).backgroundColor || '#fff';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, target.offsetWidth / 2, 20);

      // Remove clone after drag starts
      setTimeout(() => {
        document.body.removeChild(clone);
      }, 0);
    }
  };

  // Handle drop
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData("chatId");
    if (!chatId) return;
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;

      // Check if assignment exists
      const existingColumnId = chatColumnMap[chatId];
      if (existingColumnId) {
        // Update existing assignment
        await supabase.from("whatsapp_chat_kanban").update({
          column_id: columnId
        }).eq("chat_id", chatId);
      } else {
        // Create new assignment
        await supabase.from("whatsapp_chat_kanban").insert({
          user_id: user.id,
          chat_id: chatId,
          column_id: columnId
        });
      }
      setChatColumnMap(prev => ({
        ...prev,
        [chatId]: columnId
      }));
    } catch (error) {
      console.error("Error updating chat column:", error);
      toast.error("Erro ao mover chat");
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Get chats for a column
  const getChatsForColumn = (columnId: string) => {
    return chats.filter(chat => chatColumnMap[chat.id] === columnId);
  };

  // Get unassigned chats
  const getUnassignedChats = () => {
    return chats.filter(chat => !chatColumnMap[chat.id]);
  };

  // Selection handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedChats(new Set());
  };

  const toggleChatSelection = (chatId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  const selectAllChats = () => {
    setSelectedChats(new Set(chats.map(c => c.id)));
  };

  const deselectAllChats = () => {
    setSelectedChats(new Set());
  };

  // Select all chats in a specific column
  const selectColumnChats = (columnId: string | null) => {
    const columnChats = columnId === null 
      ? getUnassignedChats() 
      : getChatsForColumn(columnId);
    const columnChatIds = columnChats.map(c => c.id);
    
    setSelectedChats(prev => {
      const newSet = new Set(prev);
      const allSelected = columnChatIds.every(id => prev.has(id));
      
      if (allSelected) {
        columnChatIds.forEach(id => newSet.delete(id));
      } else {
        columnChatIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const isColumnFullySelected = (columnId: string | null) => {
    const columnChats = columnId === null 
      ? getUnassignedChats() 
      : getChatsForColumn(columnId);
    if (columnChats.length === 0) return false;
    return columnChats.every(c => selectedChats.has(c.id));
  };

  const isColumnPartiallySelected = (columnId: string | null) => {
    const columnChats = columnId === null 
      ? getUnassignedChats() 
      : getChatsForColumn(columnId);
    if (columnChats.length === 0) return false;
    const selectedCount = columnChats.filter(c => selectedChats.has(c.id)).length;
    return selectedCount > 0 && selectedCount < columnChats.length;
  };

  const handleBulkDelete = async () => {
    if (selectedChats.size === 0) {
      toast.error("Nenhum chat selecionado");
      return;
    }

    setIsDeleting(true);
    const chatIdsToDelete = Array.from(selectedChats);
    const selectedRows = chats.filter((c) => selectedChats.has(c.id));
    const normalizedNumbers = Array.from(
      new Set(
        selectedRows
          .map((c) => (c.normalized_number || "").toString().trim())
          .filter(Boolean)
      )
    );

    try {
      // Process in batches of 50 to avoid request size limits
      const BATCH_SIZE = 50;
      const MAX_RETRIES = 3;
      let totalDeleted = 0;

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const invokeWithRetry = async (chat_ids: string[], batchNumber: number) => {
        let lastErr: any;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            const { error } = await supabase.functions.invoke("whatsapp-delete-chat", {
              body: { chat_ids },
            });

            if (error) {
              throw new Error(error.message || "Erro ao excluir");
            }

            return;
          } catch (e) {
            lastErr = e;
            // exponential backoff: 600ms, 1200ms, 2400ms
            await sleep(600 * Math.pow(2, attempt - 1));
          }
        }

        throw new Error(
          `Lote ${batchNumber}: ${
            lastErr?.message || "Falha de rede ao chamar a função"
          }`
        );
      };

      for (let i = 0; i < chatIdsToDelete.length; i += BATCH_SIZE) {
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const batch = chatIdsToDelete.slice(i, i + BATCH_SIZE);

        await invokeWithRetry(batch, batchNumber);
        totalDeleted += batch.length;

        // small pacing to reduce burst / transient network failures
        await sleep(150);
      }

      toast.success(`${totalDeleted} conversa(s) excluída(s)`);
      setSelectedChats(new Set());
      setSelectionMode(false);
      setDeleteDialogOpen(false);

      onChatsDeleted?.({ ids: chatIdsToDelete, normalizedNumbers });
    } catch (error: any) {
      console.error("Error deleting chats:", error);

      const message =
        error?.context?.error ||
        error?.context?.message ||
        error?.message ||
        "Erro desconhecido";

      toast.error(`Erro ao excluir chats: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Render agendamento badge for a chat
  const renderAgendamentoBadge = (chatId: string, chat: any) => {
    const agendamento = chatAgendamentos[chatId];
    if (!agendamento) return null;
    
    const dataAgendamento = parseISO(agendamento.data_agendamento);
    const now = new Date();
    const hoje = isToday(dataAgendamento);
    const amanha = isTomorrow(dataAgendamento);
    const passado = dataAgendamento < now && !hoje;
    const isRealizado = agendamento.status === "realizado";
    const isCancelado = agendamento.status === "cancelado";
    
    let bgColor = "bg-muted";
    let textColor = "text-muted-foreground";
    let statusLabel = "";
    
    if (isRealizado) {
      bgColor = "bg-blue-100 dark:bg-blue-950";
      textColor = "text-blue-700 dark:text-blue-400";
      statusLabel = " (Realizado)";
    } else if (isCancelado) {
      bgColor = "bg-red-100 dark:bg-red-950";
      textColor = "text-red-700 dark:text-red-400";
      statusLabel = " (Não compareceu)";
    } else if (passado) {
      bgColor = "bg-yellow-100 dark:bg-yellow-950";
      textColor = "text-yellow-700 dark:text-yellow-400";
      statusLabel = " (Atrasado)";
    } else if (hoje) {
      bgColor = "bg-green-100 dark:bg-green-950";
      textColor = "text-green-700 dark:text-green-400";
    } else if (amanha) {
      bgColor = "bg-orange-100 dark:bg-orange-950";
      textColor = "text-orange-700 dark:text-orange-400";
    }
    
    const hasMultiple = agendamento.totalAgendamentos > 1;
    
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedAgendamentos(chatAllAgendamentos[chatId] || []);
          setSelectedAgendamentoClienteNome(chat.contact_name || formatPhoneNumber(chat.contact_number));
          setAgendamentosDialogOpen(true);
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs mt-2 w-full ${bgColor} ${textColor} hover:opacity-80 transition-opacity text-left`}
      >
        <Calendar className="w-3 h-3 flex-shrink-0" />
        <span className="truncate flex-1">
          {format(dataAgendamento, "dd/MM", { locale: ptBR })} às {format(dataAgendamento, "HH:mm")}
          {statusLabel}
        </span>
        {hasMultiple && (
          <span className="flex-shrink-0 bg-current/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
            +{agendamento.totalAgendamentos - 1}
          </span>
        )}
      </button>
    );
  };
  if (isLoading) {
    return <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversas selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação excluirá {selectedChats.size} conversa(s) e suas mensagens. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kanban Header with Settings */}
      <div className="h-[60px] px-3 border-b flex items-center gap-3 bg-card flex-shrink-0">
        {/* Selection Mode Toggle */}
        {selectionMode ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAllChats}>
              <CheckSquare className="w-4 h-4 mr-1" />
              Todos
            </Button>
            <Button variant="ghost" size="sm" onClick={deselectAllChats}>
              <Square className="w-4 h-4 mr-1" />
              Nenhum
            </Button>
            {selectedChats.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir ({selectedChats.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={toggleSelectionMode}>
              <XCircle className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={toggleSelectionMode}>
            <CheckSquare className="w-4 h-4" />
          </Button>
        )}

        <div className="flex-1" />
        
        <span className="text-sm text-muted-foreground">
          {chats.length} conversa{chats.length !== 1 ? "s" : ""} • {columns.length} etapa{columns.length !== 1 ? "s" : ""}
        </span>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Gerenciar Etapas do Kanban</DialogTitle>
              <DialogDescription>
                Crie e edite as etapas do seu Kanban de WhatsApp
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* New Column Form */}
              <div className="flex gap-2">
                <Input placeholder="Nova etapa..." value={newColumnName} onChange={e => setNewColumnName(e.target.value)} className="flex-1" />
                <div className="flex gap-1">
                  {DEFAULT_COLORS.slice(0, 4).map(color => <button key={color} className={`w-8 h-8 rounded-full border-2 ${newColumnColor === color ? "border-foreground" : "border-transparent"}`} style={{
                  backgroundColor: color
                }} onClick={() => setNewColumnColor(color)} />)}
                </div>
                <Button onClick={createColumn} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Column List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {columns.length === 0 ? <p className="text-center text-muted-foreground py-4">
                    Nenhuma etapa criada. Crie sua primeira etapa acima.
                  </p> : columns.map(column => <div key={column.id} draggable onDragStart={e => handleColumnDragStart(e, column.id)} onDrop={e => handleColumnDrop(e, column.id)} onDragOver={handleColumnDragOver} className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-all ${draggedColumnId === column.id ? "opacity-50" : ""} ${draggedColumnId && draggedColumnId !== column.id ? "border-primary/50" : ""}`}>
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{
                  backgroundColor: column.cor
                }} />
                      {editingColumn?.id === column.id ? <>
                          <Input value={editingColumn.nome} onChange={e => setEditingColumn({
                    ...editingColumn,
                    nome: e.target.value
                  })} className="flex-1 h-8" />
                          <div className="flex gap-1">
                            {DEFAULT_COLORS.map(color => <button key={color} className={`w-6 h-6 rounded-full border ${editingColumn.cor === color ? "border-foreground" : "border-transparent"}`} style={{
                      backgroundColor: color
                    }} onClick={() => setEditingColumn({
                      ...editingColumn,
                      cor: color
                    })} />)}
                          </div>
                          <Button size="icon" variant="ghost" onClick={updateColumn}>
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingColumn(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </> : <>
                          <span className="flex-1 font-medium">{column.nome}</span>
                          <Button size="icon" variant="ghost" onClick={() => setEditingColumn(column)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteColumn(column.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>}
                    </div>)}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Board */}
      <div ref={kanbanScrollRef} className="flex-1 min-w-0 flex gap-4 p-4 overflow-x-auto">
        {columns.length === 0 ? <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Crie suas etapas para começar a organizar seus chats
              </p>
              <Button onClick={() => setSettingsOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Etapas
              </Button>
            </div>
          </div> : <>
            {/* Leads Column - Fixed on Left */}
            <div className="flex-shrink-0 w-72 flex flex-col bg-muted/50 rounded-lg" onDrop={e => handleDrop(e, "leads")} onDragOver={handleDragOver}>
              <div className="p-3 rounded-t-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2">
                  {selectionMode && (
                    <Checkbox
                      checked={isColumnFullySelected(null)}
                      onCheckedChange={() => selectColumnChats(null)}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  )}
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <h3 className="font-semibold text-blue-600 dark:text-blue-400">
                    Leads
                  </h3>
                  <Badge variant="secondary" className="ml-auto">
                    {getUnassignedChats().length}
                  </Badge>
                </div>
              </div>

              {/* Leads Column Content */}
              <ScrollArea className="flex-1 p-1.5">
                <div className="space-y-2">
                  {getUnassignedChats().map(chat => (
                    <Card 
                      key={chat.id} 
                      draggable={!selectionMode}
                      onDragStart={e => !selectionMode && handleDragStart(e, chat)} 
                      onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)} 
                      className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl ${selectedChatId === chat.id ? "ring-2 ring-inset ring-primary" : ""} ${selectedChats.has(chat.id) ? "ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-start gap-2 w-full">
                          {selectionMode && (
                            <Checkbox
                              checked={selectedChats.has(chat.id)}
                              onCheckedChange={() => toggleChatSelection(chat.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 flex-shrink-0"
                            />
                          )}
                          <div className="flex-shrink-0">
                            <ChatAvatar chat={chat} size="md" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                              {truncateText(chat.contact_name, 20)}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                              {formatPhoneNumber(chat.contact_number)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-normal break-words">
                              {truncateText(formatLastMessagePreview(chat.last_message), 160)}
                            </p>
                            {chat.last_message_time && <span className="text-xs text-muted-foreground mt-2 block">
                                {formatRelativeTime(chat.last_message_time)}
                              </span>}
                          </div>
                        </div>
                        {renderAgendamentoBadge(chat.id, chat)}
                        {renderFaturaBadge(chat)}
                      </div>
                      {chat.unread_count > 0 && <Badge variant="default" className="absolute bottom-3 right-3 text-xs h-5 min-w-5 rounded-full">
                          {chat.unread_count}
                        </Badge>}
                    </Card>
                  ))}

                  {getUnassignedChats().length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">
                      Arraste chats aqui
                    </div>}
                </div>
              </ScrollArea>
            </div>

            {/* Custom Columns */}
            {columns.map(column => {
          const columnChats = getChatsForColumn(column.id);
          return <div key={column.id} className="flex-shrink-0 w-72 flex flex-col bg-muted/50 rounded-lg" onDrop={e => handleDrop(e, column.id)} onDragOver={handleDragOver}>
                  {/* Column Header */}
                  <div className="p-3 rounded-t-lg" style={{
              backgroundColor: `${column.cor}20`
            }}>
                    <div className="flex items-center gap-2">
                      {selectionMode && (
                        <Checkbox
                          checked={isColumnFullySelected(column.id)}
                          onCheckedChange={() => selectColumnChats(column.id)}
                        />
                      )}
                      <div className="w-3 h-3 rounded-full" style={{
                  backgroundColor: column.cor
                }} />
                      <h3 className="font-semibold" style={{
                  color: column.cor
                }}>
                        {column.nome}
                      </h3>
                      <Badge variant="secondary" className="ml-auto">
                        {columnChats.length}
                      </Badge>
                    </div>
                  </div>

                  {/* Column Content */}
                  <ScrollArea className="flex-1 p-1.5">
                    <div className="space-y-2">
                      {columnChats.map(chat => (
                        <Card 
                          key={chat.id} 
                          draggable={!selectionMode}
                          onDragStart={e => !selectionMode && handleDragStart(e, chat)} 
                          onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)} 
                          className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl ${selectedChatId === chat.id ? "ring-2 ring-inset ring-primary" : ""} ${selectedChats.has(chat.id) ? "ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/20" : ""}`}
                        >
                          <div className="flex flex-col w-full">
                            <div className="flex items-start gap-2 w-full">
                              {selectionMode && (
                                <Checkbox
                                  checked={selectedChats.has(chat.id)}
                                  onCheckedChange={() => toggleChatSelection(chat.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 flex-shrink-0"
                                />
                              )}
                              <div className="flex-shrink-0">
                                <ChatAvatar chat={chat} size="md" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                                  {truncateText(chat.contact_name, 20)}
                                </h4>
                                <p className="text-xs text-muted-foreground truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                                  {formatPhoneNumber(chat.contact_number)}
                                </p>
                                 <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-normal break-words">
                                   {truncateText(formatLastMessagePreview(chat.last_message), 160)}
                                 </p>
                                {chat.last_message_time && <span className="text-xs text-muted-foreground mt-2 block">
                                    {formatRelativeTime(chat.last_message_time)}
                                  </span>}
                              </div>
                            </div>
                            {renderAgendamentoBadge(chat.id, chat)}
                            {renderFaturaBadge(chat)}
                          </div>
                          {chat.unread_count > 0 && <Badge variant="default" className="absolute bottom-3 right-3 text-xs h-5 min-w-5 rounded-full">
                              {chat.unread_count}
                            </Badge>}
                        </Card>
                      ))}

                      {columnChats.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">
                          Arraste chats aqui
                        </div>}
                    </div>
                  </ScrollArea>
                </div>;
        })}
          </>}
      </div>

      {/* Faturas Dialog */}
      <FaturasClienteDialog
        open={faturasDialogOpen}
        onOpenChange={setFaturasDialogOpen}
        faturas={selectedFaturas}
        clienteNome={selectedFaturaClienteNome}
      />

      {/* Agendamentos Dialog */}
      <AgendamentosClienteDialog
        open={agendamentosDialogOpen}
        onOpenChange={setAgendamentosDialogOpen}
        agendamentos={selectedAgendamentos}
        clienteNome={selectedAgendamentoClienteNome}
      />
    </div>;
}