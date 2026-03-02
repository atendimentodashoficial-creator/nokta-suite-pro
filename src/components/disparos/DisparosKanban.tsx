import { useState, useEffect, useMemo, useRef } from "react";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { ReuniaoDetalhesDialog } from "@/components/reunioes/ReuniaoDetalhesDialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatAvatar } from "@/components/whatsapp/ChatAvatar";
import { supabase } from "@/integrations/supabase/client";
import {
  formatPhoneNumber,
  formatRelativeTime,
  formatLastMessagePreview,
  truncateText,
} from "@/utils/whatsapp";
import { Plus, Settings, Trash2, GripVertical, X, Check, Pencil, Calendar, Phone, Filter, CheckSquare, Square, XCircle, ArrowRightCircle, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatAgendamento {
  id: string;
  data_agendamento: string;
  status: string;
}

interface ChatReuniao {
  id: string;
  titulo: string;
  resumo_ia: string | null;
  data_reuniao: string;
  duracao_minutos: number | null;
  participantes: string[] | null;
  transcricao: string | null;
  status: string;
}

interface DisparosInstancia {
  id: string;
  nome: string;
}

interface DisparosKanbanProps {
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

const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#22c55e", // green
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export function DisparosKanban({ chats, onChatSelect, selectedChatId, onChatsDeleted }: DisparosKanbanProps) {
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
  const [chatReunioes, setChatReunioes] = useState<Record<string, ChatReuniao | null>>({});
  const [instanciasMap, setInstanciasMap] = useState<Record<string, DisparosInstancia>>({});
  const [reuniaoDialogOpen, setReuniaoDialogOpen] = useState(false);
  const [selectedReuniao, setSelectedReuniao] = useState<ChatReuniao | null>(null);
  // Filter & Selection state
  const [selectedInstanciaFilter, setSelectedInstanciaFilter] = useState<string>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-move on first reply config
  const [autoMoveColumnId, setAutoMoveColumnId] = useState<string>("none");
  // Auto-move on meeting scheduled config
  const [autoMoveReuniaoColumnId, setAutoMoveReuniaoColumnId] = useState<string>("none");

  // Filter chats by instance
  const filteredChats = useMemo(() => {
    if (selectedInstanciaFilter === "all") return chats;
    return chats.filter(chat => chat.instancia_id === selectedInstanciaFilter);
  }, [chats, selectedInstanciaFilter]);

  useEffect(() => {
    loadData();
    loadInstancias();
  }, []);

  // Use stable reference based on chat IDs to avoid re-renders
  const chatIds = chats.map(c => c.id).sort().join(',');
  
  useEffect(() => {
    if (chats.length > 0) {
      loadChatAgendamentos();
      loadChatReunioes();
    }
  }, [chatIds]);

  // Subscribe to agendamentos changes for real-time updates (handles deletions)
  useEffect(() => {
    const channel = supabase
      .channel('disparos-kanban-agendamentos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agendamentos'
        },
        () => {
          if (chats.length > 0) {
            loadChatAgendamentos();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatIds]);

  const loadInstancias = async () => {
    try {
      const { data } = await supabase
        .from("disparos_instancias")
        .select("id, nome");
      
      if (data) {
        const map: Record<string, DisparosInstancia> = {};
        data.forEach(inst => {
          map[inst.id] = inst;
        });
        setInstanciasMap(map);
      }
    } catch (error) {
      console.error("Error loading instancias:", error);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const [columnsResult, assignmentsResult, configResult] = await Promise.all([
        supabase
          .from("disparos_kanban_columns")
          .select("*")
          .eq("ativo", true)
          .order("ordem", { ascending: true }),
        user
          ? supabase
              .from("disparos_chat_kanban")
              .select("chat_id, column_id")
              .eq("user_id", user.id)
          : Promise.resolve({ data: [], error: null }),
        user
          ? supabase
              .from("disparos_kanban_config")
              .select("auto_move_column_id, auto_move_reuniao_column_id")
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      setColumns(columnsResult.data || []);

      const map: Record<string, string> = {};
      assignmentsResult.data?.forEach((a) => {
        map[a.chat_id] = a.column_id;
      });
      setChatColumnMap(map);

      const cfg = configResult.data as any;
      setAutoMoveColumnId(cfg?.auto_move_column_id || "none");
      setAutoMoveReuniaoColumnId(cfg?.auto_move_reuniao_column_id || "none");
    } catch (error) {
      console.error("Error loading kanban data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAutoMoveColumn = async (columnId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const value = columnId === "none" ? null : columnId;

      await supabase
        .from("disparos_kanban_config")
        .upsert(
          { user_id: user.id, auto_move_column_id: value, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      setAutoMoveColumnId(columnId);
      toast.success(columnId === "none" ? "Auto-movimentação desativada" : "Coluna salva!");
    } catch (error) {
      console.error("Error saving auto-move config:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const saveAutoMoveReuniaoColumn = async (columnId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const value = columnId === "none" ? null : columnId;

      await supabase
        .from("disparos_kanban_config")
        .upsert(
          { user_id: user.id, auto_move_reuniao_column_id: value, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      setAutoMoveReuniaoColumnId(columnId);
      toast.success(columnId === "none" ? "Auto-movimentação por reunião desativada" : "Coluna salva!");
    } catch (error) {
      console.error("Error saving auto-move reuniao config:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const loadChatAgendamentos = async () => {
    try {
      const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");
      const last8 = (v: string) => {
        const d = onlyDigits(v);
        return d.length >= 8 ? d.slice(-8) : d;
      };

      const chatIdToLast8: Record<string, string> = {};
      const uniqueLast8Set = new Set<string>();
      chats.forEach((chat) => {
        const k = last8(chat?.normalized_number || chat?.contact_number || "");
        if (!k) return;
        chatIdToLast8[chat.id] = k;
        uniqueLast8Set.add(k);
      });

      if (uniqueLast8Set.size === 0) return;

      // Paginated fetch of ALL leads (handles >1000 rows)
      const PAGE = 1000;
      const allLeads: { id: string; telefone: string }[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("leads")
          .select("id, telefone")
          .is("deleted_at", null)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        allLeads.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (allLeads.length === 0) return;

      // Collect ALL lead IDs per phone (handles duplicate leads with same number)
      const last8ToLeadIds: Record<string, string[]> = {};
      allLeads.forEach((l) => {
        const k = last8(l.telefone);
        if (!k || !uniqueLast8Set.has(k)) return;
        if (!last8ToLeadIds[k]) last8ToLeadIds[k] = [];
        last8ToLeadIds[k].push(l.id);
      });

      const leadIds = Array.from(new Set(Object.values(last8ToLeadIds).flat()));
      if (leadIds.length === 0) return;

      // Fetch agendamentos for all relevant statuses (paginated for safety)
      const allAgendamentos: any[] = [];
      for (let i = 0; i < leadIds.length; i += 500) {
        const batch = leadIds.slice(i, i + 500);
        const { data: agendamentos } = await supabase
          .from("agendamentos")
          .select("id, cliente_id, data_agendamento, status")
          .in("cliente_id", batch)
          .in("status", ["agendado", "confirmado"])
          .order("data_agendamento", { ascending: false })
          .limit(1000);
        if (agendamentos) allAgendamentos.push(...agendamentos);
      }

      // Pick the most recent agendamento per phone (across all duplicate leads)
      const last8ToAgendamento: Record<string, ChatAgendamento> = {};
      allAgendamentos.forEach((ag) => {
        // Find which last8 this lead belongs to
        for (const [k, ids] of Object.entries(last8ToLeadIds)) {
          if (ids.includes(ag.cliente_id)) {
            if (!last8ToAgendamento[k] || ag.data_agendamento > last8ToAgendamento[k].data_agendamento) {
              last8ToAgendamento[k] = {
                id: ag.id,
                data_agendamento: ag.data_agendamento,
                status: ag.status,
              };
            }
            break;
          }
        }
      });

      const chatAgMap: Record<string, ChatAgendamento | null> = {};
      chats.forEach((chat) => {
        const k = chatIdToLast8[chat.id];
        chatAgMap[chat.id] = k ? (last8ToAgendamento[k] ?? null) : null;
      });

      setChatAgendamentos(chatAgMap);
    } catch (error) {
      console.error("Error loading chat agendamentos:", error);
    }
  };

  const loadChatReunioes = async () => {
    try {
      const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");
      const last8 = (v: string) => {
        const d = onlyDigits(v);
        return d.length >= 8 ? d.slice(-8) : d;
      };

      // Fetch ALL reuniões with resumo (typically very few records)
      const { data: allReunioes, error } = await supabase
        .from("reunioes")
        .select("id, titulo, resumo_ia, data_reuniao, cliente_telefone, duracao_minutos, participantes, transcricao, status")
        .not("resumo_ia", "is", null)
        .neq("resumo_ia", "")
        .order("data_reuniao", { ascending: false });

      if (error) {
        console.error("Error fetching reunioes:", error);
        return;
      }

      if (!allReunioes || allReunioes.length === 0) {
        setChatReunioes({});
        return;
      }

      // Map last8 phone -> most recent reunião with resumo
      const last8ToReuniao: Record<string, ChatReuniao> = {};
      allReunioes.forEach((r: any) => {
        const k = last8(r.cliente_telefone || "");
        if (!k || last8ToReuniao[k]) return;
        last8ToReuniao[k] = {
          id: r.id,
          titulo: r.titulo,
          resumo_ia: r.resumo_ia,
          data_reuniao: r.data_reuniao,
          duracao_minutos: r.duracao_minutos,
          participantes: r.participantes,
          transcricao: r.transcricao,
          status: r.status,
        };
      });

      // Match chats to reuniões by last 8 digits
      const chatReMap: Record<string, ChatReuniao | null> = {};
      chats.forEach((chat) => {
        const k = last8(chat?.normalized_number || chat?.contact_number || "");
        chatReMap[chat.id] = k ? (last8ToReuniao[k] ?? null) : null;
      });

      setChatReunioes(chatReMap);
    } catch (error) {
      console.error("Error loading chat reunioes:", error);
    }
  };

  const createColumn = async () => {
    if (!newColumnName.trim()) {
      toast.error("Digite um nome para a etapa");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("disparos_kanban_columns")
        .insert({
          user_id: user.id,
          nome: newColumnName.trim(),
          cor: newColumnColor,
          ordem: columns.length,
        })
        .select()
        .single();

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

  const updateColumn = async () => {
    if (!editingColumn) return;

    try {
      const { error } = await supabase
        .from("disparos_kanban_columns")
        .update({
          nome: editingColumn.nome,
          cor: editingColumn.cor,
        })
        .eq("id", editingColumn.id);

      if (error) throw error;

      setColumns(columns.map((c) => (c.id === editingColumn.id ? editingColumn : c)));
      setEditingColumn(null);
      toast.success("Etapa atualizada!");
    } catch (error) {
      console.error("Error updating column:", error);
      toast.error("Erro ao atualizar etapa");
    }
  };

  const deleteColumn = async (columnId: string) => {
    try {
      const { error } = await supabase
        .from("disparos_kanban_columns")
        .delete()
        .eq("id", columnId);

      if (error) throw error;

      setColumns(columns.filter((c) => c.id !== columnId));
      toast.success("Etapa excluída!");
    } catch (error) {
      console.error("Error deleting column:", error);
      toast.error("Erro ao excluir etapa");
    }
  };

  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.stopPropagation();
    setDraggedColumnId(columnId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColumnDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedColumnId || draggedColumnId === targetColumnId) {
      setDraggedColumnId(null);
      return;
    }

    const draggedIndex = columns.findIndex((c) => c.id === draggedColumnId);
    const targetIndex = columns.findIndex((c) => c.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumnId(null);
      return;
    }

    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    const updatedColumns = newColumns.map((col, index) => ({
      ...col,
      ordem: index,
    }));

    setColumns(updatedColumns);
    setDraggedColumnId(null);

    try {
      const updates = updatedColumns.map((col) =>
        supabase
          .from("disparos_kanban_columns")
          .update({ ordem: col.ordem })
          .eq("id", col.id)
      );

      await Promise.all(updates);
      toast.success("Ordem atualizada!");
    } catch (error) {
      console.error("Error updating column order:", error);
      toast.error("Erro ao atualizar ordem");
      loadData();
    }
  };

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragStart = (e: React.DragEvent, chat: any) => {
    e.dataTransfer.setData("chatId", chat.id);
    
    const target = e.currentTarget as HTMLElement;
    if (target) {
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
      
      setTimeout(() => {
        document.body.removeChild(clone);
      }, 0);
    }
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData("chatId");
    if (!chatId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const existingColumnId = chatColumnMap[chatId];

      if (existingColumnId) {
        await supabase
          .from("disparos_chat_kanban")
          .update({ column_id: columnId })
          .eq("chat_id", chatId);
      } else {
        await supabase.from("disparos_chat_kanban").insert({
          user_id: user.id,
          chat_id: chatId,
          column_id: columnId,
        });
      }

      setChatColumnMap((prev) => ({ ...prev, [chatId]: columnId }));
    } catch (error) {
      console.error("Error updating chat column:", error);
      toast.error("Erro ao mover chat");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getChatsForColumn = (columnId: string) => {
    return filteredChats.filter((chat) => chatColumnMap[chat.id] === columnId);
  };

  const getUnassignedChats = () => {
    return filteredChats.filter((chat) => !chatColumnMap[chat.id]);
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
    setSelectedChats(new Set(filteredChats.map(c => c.id)));
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
      // Check if all column chats are already selected
      const allSelected = columnChatIds.every(id => prev.has(id));
      
      if (allSelected) {
        // Deselect all from this column
        columnChatIds.forEach(id => newSet.delete(id));
      } else {
        // Select all from this column
        columnChatIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  // Check if all chats in a column are selected
  const isColumnFullySelected = (columnId: string | null) => {
    const columnChats = columnId === null 
      ? getUnassignedChats() 
      : getChatsForColumn(columnId);
    if (columnChats.length === 0) return false;
    return columnChats.every(c => selectedChats.has(c.id));
  };

  // Check if some chats in a column are selected
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
      // Call edge function to delete from UAZapi, delete messages, and soft-delete chat
      const { error } = await supabase.functions.invoke("disparos-delete-chat", {
        body: { chat_ids: chatIdsToDelete },
      });

      if (error) throw error;

      toast.success(`${chatIdsToDelete.length} conversa(s) excluída(s)`);
      setSelectedChats(new Set());
      setSelectionMode(false);
      setDeleteDialogOpen(false);

      onChatsDeleted?.({ ids: chatIdsToDelete, normalizedNumbers });
    } catch (error: any) {
      console.error("Error deleting chats:", error);
      toast.error(`Erro ao excluir conversas: ${error.message || "Erro desconhecido"}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderAgendamentoBadge = (chatId: string) => {
    const agendamento = chatAgendamentos[chatId];
    if (!agendamento) return null;

    const dataAgendamento = parseISO(agendamento.data_agendamento);
    const hoje = isToday(dataAgendamento);
    const amanha = isTomorrow(dataAgendamento);

    let bgColor = "bg-muted";
    let textColor = "text-muted-foreground";

    if (hoje) {
      bgColor = "bg-green-100 dark:bg-green-950";
      textColor = "text-green-700 dark:text-green-400";
    } else if (amanha) {
      bgColor = "bg-orange-100 dark:bg-orange-950";
      textColor = "text-orange-700 dark:text-orange-400";
    }

    return (
      <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs mt-2 w-full ${bgColor} ${textColor}`}>
        <Calendar className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">
          {format(dataAgendamento, "dd/MM", { locale: ptBR })} às {format(dataAgendamento, "HH:mm")}
        </span>
      </div>
    );
  };

  const renderReuniaoBadge = (chatId: string) => {
    const reuniao = chatReunioes[chatId];
    if (!reuniao) return null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedReuniao(reuniao);
                setReuniaoDialogOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs mt-1 w-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors text-left"
            >
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Resumo de reunião</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clique para ver o resumo</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Get unique instances from chats - must be before any conditional returns
  const instancias = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    chats.forEach(chat => {
      if (chat.instancia_id) {
        const nome = chat.instancia_nome || instanciasMap[chat.instancia_id]?.nome || chat.instancia_id;
        map.set(chat.instancia_id, { id: chat.instancia_id, nome });
      }
    });
    return Array.from(map.values());
  }, [chats, instanciasMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Kanban Header with Settings */}
      <div className="h-[60px] px-3 border-b flex items-center gap-3 bg-card flex-shrink-0">
        {/* Instance Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedInstanciaFilter} onValueChange={setSelectedInstanciaFilter}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Filtrar por instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas instâncias</SelectItem>
              {instancias.map(inst => (
                <SelectItem key={inst.id} value={inst.id}>{inst.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        {/* Auto-move on first reply */}
        <div className="flex items-center gap-1.5">
          <ArrowRightCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Select value={autoMoveColumnId} onValueChange={saveAutoMoveColumn}>
            <SelectTrigger className="w-[175px] h-8 text-xs">
              <SelectValue placeholder="Mover na 1ª resposta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem auto-movimentação</SelectItem>
              {columns.map(col => (
                <SelectItem key={col.id} value={col.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col.cor }}
                    />
                    {col.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Auto-move on meeting scheduled */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Select value={autoMoveReuniaoColumnId} onValueChange={saveAutoMoveReuniaoColumn}>
            <SelectTrigger className="w-[175px] h-8 text-xs">
              <SelectValue placeholder="Mover ao agendar reunião" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem mover em reunião</SelectItem>
              {columns.map(col => (
                <SelectItem key={col.id} value={col.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col.cor }}
                    />
                    {col.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />
        
        <span className="text-sm text-muted-foreground">
          {filteredChats.length} conversa{filteredChats.length !== 1 ? "s" : ""} • {columns.length} etapa{columns.length !== 1 ? "s" : ""}
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
                Crie e edite as etapas do seu Kanban de Disparos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* New Column Form */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nova etapa..."
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  className="flex-1"
                />
                <div className="flex gap-1">
                  {DEFAULT_COLORS.slice(0, 4).map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 ${
                        newColumnColor === color ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewColumnColor(color)}
                    />
                  ))}
                </div>
                <Button onClick={createColumn} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Column List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {columns.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhuma etapa criada. Crie sua primeira etapa acima.
                  </p>
                ) : (
                  columns.map((column) => (
                    <div
                      key={column.id}
                      draggable
                      onDragStart={(e) => handleColumnDragStart(e, column.id)}
                      onDrop={(e) => handleColumnDrop(e, column.id)}
                      onDragOver={handleColumnDragOver}
                      className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-all ${
                        draggedColumnId === column.id ? "opacity-50" : ""
                      } ${draggedColumnId && draggedColumnId !== column.id ? "border-primary/50" : ""}`}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: column.cor }}
                      />
                      {editingColumn?.id === column.id ? (
                        <>
                          <Input
                            value={editingColumn.nome}
                            onChange={(e) =>
                              setEditingColumn({ ...editingColumn, nome: e.target.value })
                            }
                            className="flex-1 h-8"
                          />
                          <div className="flex gap-1">
                            {DEFAULT_COLORS.slice(0, 4).map((color) => (
                              <button
                                key={color}
                                className={`w-6 h-6 rounded-full border-2 ${
                                  editingColumn.cor === color
                                    ? "border-foreground"
                                    : "border-transparent"
                                }`}
                                style={{ backgroundColor: color }}
                                onClick={() =>
                                  setEditingColumn({ ...editingColumn, cor: color })
                                }
                              />
                            ))}
                          </div>
                          <Button size="icon" variant="ghost" onClick={updateColumn}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingColumn(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate">{column.nome}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingColumn(column)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteColumn(column.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Board */}
      <div ref={kanbanScrollRef} className="flex-1 min-w-0 flex gap-4 p-4 overflow-x-auto">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Crie suas etapas para começar a organizar seus chats
              </p>
              <Button onClick={() => setSettingsOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Etapas
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Leads Column - Fixed on Left */}
            <div
              className="flex-shrink-0 w-72 flex flex-col bg-muted/50 rounded-lg"
              onDrop={(e) => {
                e.preventDefault();
                const chatId = e.dataTransfer.getData("chatId");
                if (chatId && chatColumnMap[chatId]) {
                  supabase
                    .from("disparos_chat_kanban")
                    .delete()
                    .eq("chat_id", chatId)
                    .then(() => {
                      setChatColumnMap((prev) => {
                        const newMap = { ...prev };
                        delete newMap[chatId];
                        return newMap;
                      });
                    });
                }
              }}
              onDragOver={handleDragOver}
            >
              <div className="p-3 rounded-t-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2">
                  {selectionMode && getUnassignedChats().length > 0 && (
                    <Checkbox
                      checked={isColumnFullySelected(null)}
                      ref={(el) => {
                        if (el) {
                          (el as any).indeterminate = isColumnPartiallySelected(null);
                        }
                      }}
                      onCheckedChange={() => selectColumnChats(null)}
                      onClick={(e) => e.stopPropagation()}
                      className="mr-1"
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

              <ScrollArea className="flex-1 p-1.5">
                <div className="space-y-2">
                  {getUnassignedChats().map((chat) => (
                    <Card
                      key={chat.id}
                      draggable={!selectionMode}
                      onDragStart={(e) => !selectionMode && handleDragStart(e, chat)}
                      onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)}
                      className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl ${
                        selectedChatId === chat.id ? "ring-2 ring-inset ring-primary" : ""
                      } ${selectedChats.has(chat.id) ? "ring-2 ring-inset ring-destructive bg-destructive/5" : ""}`}
                    >
                      {selectionMode && (
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox 
                            checked={selectedChats.has(chat.id)} 
                            onCheckedChange={() => toggleChatSelection(chat.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                      <div className={`flex flex-col w-full ${selectionMode ? "pl-6" : ""}`}>
                        <div className="flex items-start gap-2 w-full">
                          <div className="flex-shrink-0">
                            <ChatAvatar chat={chat} size="md" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                              {truncateText(chat.contact_name || formatPhoneNumber(chat.contact_number), 20)}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                              {formatPhoneNumber(chat.contact_number)}
                            </p>
                            {/* Instance indicator - below phone number */}
                            {(chat.instancia_nome || (chat.instancia_id && instanciasMap[chat.instancia_id]?.nome)) && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Phone className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{chat.instancia_nome || instanciasMap[chat.instancia_id]?.nome}</span>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-normal break-words">
                              {truncateText(formatLastMessagePreview(chat.last_message), 160)}
                            </p>
                            {chat.last_message_time && (
                              <span className="text-xs text-muted-foreground mt-2 block">
                                {formatRelativeTime(chat.last_message_time)}
                              </span>
                            )}
                          </div>
                        </div>
                        {renderAgendamentoBadge(chat.id)}
                        {renderReuniaoBadge(chat.id)}
                      </div>
                      {!selectionMode && (chat.unread_count || 0) > 0 && (
                        <Badge
                          variant="default"
                          className="absolute bottom-3 right-3 text-xs h-5 min-w-5 rounded-full"
                        >
                          {chat.unread_count}
                        </Badge>
                      )}
                    </Card>
                  ))}

                  {getUnassignedChats().length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhum lead novo
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Custom Columns */}
            {columns.map((column) => {
              const columnChats = getChatsForColumn(column.id);
              return (
                <div
                  key={column.id}
                  className="flex-shrink-0 w-72 flex flex-col bg-muted/50 rounded-lg"
                  onDrop={(e) => handleDrop(e, column.id)}
                  onDragOver={handleDragOver}
                >
                  {/* Column Header */}
                  <div
                    className="p-3 rounded-t-lg"
                    style={{ backgroundColor: `${column.cor}20` }}
                  >
                    <div className="flex items-center gap-2">
                      {selectionMode && columnChats.length > 0 && (
                        <Checkbox
                          checked={isColumnFullySelected(column.id)}
                          ref={(el) => {
                            if (el) {
                              (el as any).indeterminate = isColumnPartiallySelected(column.id);
                            }
                          }}
                          onCheckedChange={() => selectColumnChats(column.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mr-1"
                        />
                      )}
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: column.cor }}
                      />
                      <h3 className="font-semibold" style={{ color: column.cor }}>
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
                      {columnChats.map((chat) => (
                        <Card
                          key={chat.id}
                          draggable={!selectionMode}
                          onDragStart={(e) => !selectionMode && handleDragStart(e, chat)}
                          onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)}
                          className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl min-w-0 max-w-full overflow-hidden ${
                            selectedChatId === chat.id ? "ring-2 ring-inset ring-primary" : ""
                          } ${selectedChats.has(chat.id) ? "ring-2 ring-inset ring-destructive bg-destructive/5" : ""}`}
                        >
                          {selectionMode && (
                            <div className="absolute top-2 left-2 z-10">
                              <Checkbox 
                                checked={selectedChats.has(chat.id)} 
                                onCheckedChange={() => toggleChatSelection(chat.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                          <div className={`flex flex-col w-full min-w-0 ${selectionMode ? "pl-6" : ""}`}>
                            <div className="flex items-start gap-2 w-full min-w-0">
                              <div className="flex-shrink-0">
                                <ChatAvatar chat={chat} size="md" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                                  {truncateText(chat.contact_name || formatPhoneNumber(chat.contact_number), 20)}
                                </h4>
                                <p className="text-xs text-muted-foreground truncate text-ellipsis whitespace-nowrap overflow-hidden block">
                                  {formatPhoneNumber(chat.contact_number)}
                                </p>
                                {/* Instance indicator - below phone number */}
                                {(chat.instancia_nome || (chat.instancia_id && instanciasMap[chat.instancia_id]?.nome)) && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                    <Phone className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{chat.instancia_nome || instanciasMap[chat.instancia_id]?.nome}</span>
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-normal break-words">
                                  {truncateText(formatLastMessagePreview(chat.last_message), 160)}
                                </p>
                                {chat.last_message_time && (
                                  <span className="text-xs text-muted-foreground mt-2 block">
                                    {formatRelativeTime(chat.last_message_time)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {renderAgendamentoBadge(chat.id)}
                            {renderReuniaoBadge(chat.id)}
                          </div>
                          {!selectionMode && (chat.unread_count || 0) > 0 && (
                            <Badge
                              variant="default"
                              className="absolute bottom-3 right-3 text-xs h-5 min-w-5 rounded-full"
                            >
                              {chat.unread_count}
                            </Badge>
                          )}
                        </Card>
                      ))}

                      {columnChats.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          Arraste chats aqui
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversas selecionadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedChats.size} conversa(s). Esta ação pode ser desfeita posteriormente.
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

      {/* Reunião Summary Dialog */}
      <ReuniaoDetalhesDialog
        reuniao={selectedReuniao}
        open={reuniaoDialogOpen}
        onOpenChange={setReuniaoDialogOpen}
      />
    </div>
  );
}
