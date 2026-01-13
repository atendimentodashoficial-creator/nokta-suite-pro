import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Procedimento {
  id: string;
  user_id: string;
  nome: string;
  categoria: string | null;
  descricao: string | null;
  valor_medio: number | null;
  duracao_minutos: number | null;
  tempo_atendimento_minutos: number | null;
  ativo: boolean;
  ordem: number | null;
  created_at: string;
  updated_at: string;
}

export const useProcedimentos = (apenasAtivos = false) => {
  return useQuery({
    queryKey: ["procedimentos", apenasAtivos],
    queryFn: async () => {
      let query = supabase
        .from("procedimentos")
        .select("*")
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("nome", { ascending: true });

      if (apenasAtivos) {
        query = query.eq("ativo", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Procedimento[];
    },
  });
};

export const useCreateProcedimento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (procedimento: Partial<Omit<Procedimento, "id" | "created_at" | "updated_at" | "user_id">> & { nome: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("procedimentos")
        .insert({ ...procedimento, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedimentos"] });
    },
  });
};

export const useUpdateProcedimento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...procedimento }: Partial<Procedimento> & { id: string }) => {
      const { data, error } = await supabase
        .from("procedimentos")
        .update(procedimento)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedimentos"] });
    },
  });
};

export const useDeleteProcedimento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("procedimentos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedimentos"] });
    },
  });
};