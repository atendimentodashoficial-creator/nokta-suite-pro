import { useState, useEffect, useMemo, useRef } from "react";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
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
} from "@/utils/whatsapp";
import { Plus, Settings, Trash2, GripVertical, X, Check, Pencil, Calendar, Phone, Filter, CheckSquare, Square, XCircle } from "lucide-react";
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
  const [instanciasMap, setInstanciasMap] = useState<Record<string, DisparosInstancia>>({});
  
  // Filter & Selection state
  const [selectedInstanciaFilter, setSelectedInstanciaFilter] = useState<string>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    }
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
      const { data: columnsData } = await supabase
        .from("disparos_kanban_columns")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });

      setColumns(columnsData || []);

      const { data: assignmentsData } = await supabase
        .from("disparos_chat_kanban")
        .select("chat_id, column_id");

      const map: Record<string, string> = {};
      assignmentsData?.forEach((a) => {
        map[a.chat_id] = a.column_id;
      });
      setChatColumnMap(map);
    } catch (error) {
      console.error("Error loading kanban data:", error);
    } finally {
      setIsLoading(false);
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
      const last8List: string[] = [];
      chats.forEach((chat) => {
        const k = last8(chat?.normalized_number || chat?.contact_number || "");
        if (!k) return;
        chatIdToLast8[chat.id] = k;
        last8List.push(k);
      });

      if (last8List.length === 0) return;

      const { data: leads } = await supabase
        .from("leads")
        .select("id, telefone");

      if (!leads || leads.length === 0) return;

      const last8ToLeadId: Record<string, string> = {};
      leads.forEach((l) => {
        const k = last8(l.telefone);
        if (!k) return;
        if (!last8ToLeadId[k]) last8ToLeadId[k] = l.id;
      });

      const leadIds = Array.from(new Set(Object.values(last8ToLeadId)));
      if (leadIds.length === 0) return;

      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("id, cliente_id, data_agendamento, status")
        .in("cliente_id", leadIds)
        .in("status", ["agendado", "confirmado", "realizado"])
        .order("data_agendamento", { ascending: true });

      const leadIdToAgendamento: Record<string, ChatAgendamento> = {};
      agendamentos?.forEach((ag) => {
        if (!leadIdToAgendamento[ag.cliente_id]) {
          leadIdToAgendamento[ag.cliente_id] = {
            id: ag.id,
            data_agendamento: ag.data_agendamento,
            status: ag.status,
          };
        }
      });

      const chatAgMap: Record<string, ChatAgendamento | null> = {};
      chats.forEach((chat) => {
        const k = chatIdToLast8[chat.id];
        const leadId = k ? last8ToLeadId[k] : undefined;
        chatAgMap[chat.id] = leadId ? (leadIdToAgendamento[leadId] ?? null) : null;
      });

      setChatAgendamentos(chatAgMap);
    } catch (error) {
      console.error("Error loading chat agendamentos:", error);
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

              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {getUnassignedChats().map((chat) => (
                    <Card
                      key={chat.id}
                      draggable={!selectionMode}
                      onDragStart={(e) => !selectionMode && handleDragStart(e, chat)}
                      onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)}
                      className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl ${
                        selectedChatId === chat.id ? "ring-2 ring-primary" : ""
                      } ${selectedChats.has(chat.id) ? "ring-2 ring-destructive bg-destructive/5" : ""}`}
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
                              {chat.contact_name || formatPhoneNumber(chat.contact_number)}
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
                              {formatLastMessagePreview(chat.last_message)}
                            </p>
                            {chat.last_message_time && (
                              <span className="text-xs text-muted-foreground mt-2 block">
                                {formatRelativeTime(chat.last_message_time)}
                              </span>
                            )}
                          </div>
                        </div>
                        {renderAgendamentoBadge(chat.id)}
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
                  <ScrollArea className="flex-1 p-2">
                    <div className="space-y-2">
                      {columnChats.map((chat) => (
                        <Card
                          key={chat.id}
                          draggable={!selectionMode}
                          onDragStart={(e) => !selectionMode && handleDragStart(e, chat)}
                          onClick={() => selectionMode ? toggleChatSelection(chat.id) : onChatSelect(chat)}
                          className={`p-3 cursor-pointer hover:shadow-md transition-all relative rounded-xl ${
                            selectedChatId === chat.id ? "ring-2 ring-primary" : ""
                          } ${selectedChats.has(chat.id) ? "ring-2 ring-destructive bg-destructive/5" : ""}`}
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
                                  {chat.contact_name || formatPhoneNumber(chat.contact_number)}
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
                                  {formatLastMessagePreview(chat.last_message)}
                                </p>
                                {chat.last_message_time && (
                                  <span className="text-xs text-muted-foreground mt-2 block">
                                    {formatRelativeTime(chat.last_message_time)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {renderAgendamentoBadge(chat.id)}
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
    </div>
  );
}
