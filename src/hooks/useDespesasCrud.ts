import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Despesa {
  id: string;
  user_id: string;
  descricao: string;
  valor: number;
  categoria_id?: string | null;
  data_despesa?: string | null;
  recorrente?: boolean | null;
  parcelada?: boolean | null;
  numero_parcelas?: number | null;
  parcela_atual?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  observacoes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DespesaComCategoria extends Despesa {
  categorias_despesas?: {
    id: string;
    nome: string;
    cor?: string | null;
  } | null;
}

export const useDespesas = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["despesas", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("despesas")
        .select(`
          *,
          categorias_despesas (
            id,
            nome,
            cor
          )
        `)
        .eq("user_id", user.id)
        .order("data_despesa", { ascending: false });

      if (error) throw error;
      return data as DespesaComCategoria[];
    },
    enabled: !!user?.id,
  });
};

export const useCreateDespesa = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: Omit<Despesa, "id" | "user_id" | "created_at" | "updated_at">) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { data: result, error } = await supabase
        .from("despesas")
        .insert({ ...data, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
      queryClient.invalidateQueries({ queryKey: ["despesas-total"] });
    },
  });
};

export const useUpdateDespesa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Despesa> & { id: string }) => {
      const { data: result, error } = await supabase
        .from("despesas")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
      queryClient.invalidateQueries({ queryKey: ["despesas-total"] });
    },
  });
};

export const useDeleteDespesa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("despesas")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
      queryClient.invalidateQueries({ queryKey: ["despesas-total"] });
    },
  });
};
