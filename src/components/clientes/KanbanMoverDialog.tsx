import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Columns3, Ban } from "lucide-react";
import { toast } from "sonner";
import { getLast8Digits } from "@/utils/phoneFormat";

interface KanbanMoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed?: () => void;
  clienteTelefone: string | null;
  titulo?: string;
  descricao?: string;
}

async function moveWhatsAppKanbanCard(userId: string, telefone: string, columnId: string) {
  const last8 = getLast8Digits(telefone);
  if (!last8) return;

  // Find matching WhatsApp chats
  const { data: chats } = await supabase
    .from("whatsapp_chats")
    .select("id")
    .eq("user_id", userId)
    .like("normalized_number", `%${last8}`)
    .is("deleted_at", null);

  if (!chats || chats.length === 0) return;

  for (const chat of chats) {
    // Check if assignment already exists
    const { data: existing } = await supabase
      .from("whatsapp_chat_kanban")
      .select("id")
      .eq("chat_id", chat.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("whatsapp_chat_kanban")
        .update({ column_id: columnId })
        .eq("chat_id", chat.id);
    } else {
      await supabase
        .from("whatsapp_chat_kanban")
        .insert({ chat_id: chat.id, column_id: columnId, user_id: userId });
    }
  }
}

export function KanbanMoverDialog({
  open,
  onOpenChange,
  onConfirmed,
  clienteTelefone,
  titulo = "Mover card no Kanban",
  descricao = "Selecione para qual coluna do Kanban o card do cliente deve ser movido.",
}: KanbanMoverDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const { data: columns, isLoading } = useQuery({
    queryKey: ["whatsapp-kanban-columns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_kanban_columns")
        .select("id, nome, cor")
        .eq("user_id", user!.id)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; nome: string; cor: string }>;
    },
    enabled: !!user?.id && open,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedColumnId || !user || !clienteTelefone) throw new Error("Dados incompletos");
      await moveWhatsAppKanbanCard(user.id, clienteTelefone, selectedColumnId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chat-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-kanban"] });
      toast.success("Card movido no Kanban!");
      onConfirmed?.();
      handleClose();
    },
    onError: (error) => {
      console.error("Erro ao mover card:", error);
      toast.error("Erro ao mover card no Kanban");
    },
  });

  const handleClose = () => {
    setSelectedColumnId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns3 className="w-5 h-5 text-primary" />
            {titulo}
          </DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : columns && columns.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Columns3 className="w-4 h-4" />
                <span>Escolha a coluna destino:</span>
              </div>
              {columns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setSelectedColumnId(col.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                    selectedColumnId === col.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.cor }}
                  />
                  <span className="font-medium text-sm">{col.nome}</span>
                  {selectedColumnId === col.id && (
                    <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Columns3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma coluna do Kanban encontrada.</p>
              <p className="text-xs mt-1">Configure as colunas na aba WhatsApp.</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={() => {
              onConfirmed?.();
              handleClose();
            }}>
              <Ban className="w-4 h-4" />
              Não mover
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={!selectedColumnId || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              <CheckCircle2 className="w-4 h-4" />
              Mover
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
