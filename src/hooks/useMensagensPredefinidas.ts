import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MensagemPredefinida {
  id: string;
  user_id: string;
  titulo: string;
  conteudo: string;
  ordem: number;
  bloco_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useMensagensPredefinidas = () => {
  const queryClient = useQueryClient();

  const { data: mensagens, isLoading } = useQuery({
    queryKey: ["mensagens-predefinidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mensagens_predefinidas")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) throw error;
      return data as MensagemPredefinida[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newMensagem: { titulo: string; conteudo: string; bloco_id?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get max ordem for same bloco
      const { data: existing } = await supabase
        .from("mensagens_predefinidas")
        .select("ordem")
        .eq("user_id", user.id)
        .order("ordem", { ascending: false })
        .limit(1);

      const maxOrdem = existing?.[0]?.ordem ?? -1;

      const { data, error } = await supabase
        .from("mensagens_predefinidas")
        .insert({
          user_id: user.id,
          titulo: newMensagem.titulo,
          conteudo: newMensagem.conteudo,
          bloco_id: newMensagem.bloco_id || null,
          ordem: maxOrdem + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens-predefinidas"] });
      toast.success("Mensagem criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar mensagem");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (mensagem: { id: string; titulo: string; conteudo: string; bloco_id?: string | null }) => {
      const { error } = await supabase
        .from("mensagens_predefinidas")
        .update({
          titulo: mensagem.titulo,
          conteudo: mensagem.conteudo,
          bloco_id: mensagem.bloco_id ?? null,
        })
        .eq("id", mensagem.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens-predefinidas"] });
      toast.success("Mensagem atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar mensagem");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mensagens_predefinidas")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens-predefinidas"] });
      toast.success("Mensagem excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir mensagem");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordem: number; bloco_id?: string | null }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from("mensagens_predefinidas")
          .update({ ordem: update.ordem, bloco_id: update.bloco_id ?? null })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensagens-predefinidas"] });
    },
  });

  return {
    mensagens: mensagens || [],
    isLoading,
    createMensagem: createMutation.mutate,
    updateMensagem: updateMutation.mutate,
    deleteMensagem: deleteMutation.mutate,
    reorderMensagens: reorderMutation.mutate,
  };
};
