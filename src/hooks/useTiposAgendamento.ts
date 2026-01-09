import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TipoAgendamento {
  id: string;
  user_id: string;
  nome: string;
  cor: string | null;
  ordem: number | null;
  ativo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useTiposAgendamento() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tipos = [], isLoading, refetch } = useQuery({
    queryKey: ["tipos-agendamento", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("tipo_agendamento_custom")
        .select("*")
        .eq("user_id", user.id)
        .order("ordem", { ascending: true });

      if (error) throw error;
      return data as TipoAgendamento[];
    },
    enabled: !!user?.id,
  });

  // Get active types for forms
  const tiposAtivos = tipos.filter(t => t.ativo !== false);

  const createTipo = useMutation({
    mutationFn: async (data: { nome: string; cor?: string }) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const maxOrdem = tipos.length > 0 ? Math.max(...tipos.map(t => t.ordem || 0)) : 0;

      const { data: newTipo, error } = await supabase
        .from("tipo_agendamento_custom")
        .insert({
          user_id: user.id,
          nome: data.nome,
          cor: data.cor || "#10b981",
          ordem: maxOrdem + 1,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;
      return newTipo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-agendamento"] });
      toast.success("Tipo criado com sucesso!");
    },
    onError: (error) => {
      console.error("Error creating tipo:", error);
      toast.error("Erro ao criar tipo");
    },
  });

  const updateTipo = useMutation({
    mutationFn: async ({ id, ...data }: Partial<TipoAgendamento> & { id: string }) => {
      const { error } = await supabase
        .from("tipo_agendamento_custom")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-agendamento"] });
      toast.success("Tipo atualizado com sucesso!");
    },
    onError: (error) => {
      console.error("Error updating tipo:", error);
      toast.error("Erro ao atualizar tipo");
    },
  });

  const deleteTipo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tipo_agendamento_custom")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-agendamento"] });
      toast.success("Tipo excluído com sucesso!");
    },
    onError: (error) => {
      console.error("Error deleting tipo:", error);
      toast.error("Erro ao excluir tipo");
    },
  });

  return {
    tipos,
    tiposAtivos,
    isLoading,
    refetch,
    createTipo,
    updateTipo,
    deleteTipo,
  };
}
