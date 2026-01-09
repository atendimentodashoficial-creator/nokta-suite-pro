import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BlocoMensagem {
  id: string;
  user_id: string;
  titulo: string;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export const useBlocosMensagens = () => {
  const queryClient = useQueryClient();

  const { data: blocos, isLoading } = useQuery({
    queryKey: ["blocos-mensagens-predefinidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocos_mensagens_predefinidas")
        .select("*")
        .order("ordem", { ascending: true });

      if (error) throw error;
      return data as BlocoMensagem[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newBloco: { titulo: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Get max ordem
      const { data: existing } = await supabase
        .from("blocos_mensagens_predefinidas")
        .select("ordem")
        .eq("user_id", user.id)
        .order("ordem", { ascending: false })
        .limit(1);

      const maxOrdem = existing?.[0]?.ordem ?? -1;

      const { data, error } = await supabase
        .from("blocos_mensagens_predefinidas")
        .insert({
          user_id: user.id,
          titulo: newBloco.titulo,
          ordem: maxOrdem + 1,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocos-mensagens-predefinidas"] });
      toast.success("Bloco criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar bloco");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (bloco: { id: string; titulo: string }) => {
      const { error } = await supabase
        .from("blocos_mensagens_predefinidas")
        .update({ titulo: bloco.titulo })
        .eq("id", bloco.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocos-mensagens-predefinidas"] });
      toast.success("Bloco atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar bloco");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blocos_mensagens_predefinidas")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocos-mensagens-predefinidas"] });
      queryClient.invalidateQueries({ queryKey: ["mensagens-predefinidas"] });
      toast.success("Bloco excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir bloco");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordem: number }[]) => {
      for (const update of updates) {
        const { error } = await supabase
          .from("blocos_mensagens_predefinidas")
          .update({ ordem: update.ordem })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocos-mensagens-predefinidas"] });
    },
  });

  return {
    blocos: blocos || [],
    isLoading,
    createBloco: createMutation.mutate,
    updateBloco: updateMutation.mutate,
    deleteBloco: deleteMutation.mutate,
    reorderBlocos: reorderMutation.mutate,
  };
};
