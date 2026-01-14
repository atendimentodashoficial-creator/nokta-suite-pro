import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CategoriaDespesa {
  id: string;
  user_id: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  created_at?: string | null;
}

export const useCategoriasDespesas = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["categorias-despesas", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("categorias_despesas")
        .select("*")
        .eq("user_id", user.id)
        .order("nome");

      if (error) throw error;
      return data as CategoriaDespesa[];
    },
    enabled: !!user?.id,
  });
};

export const useCreateCategoriaDespesa = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: Omit<CategoriaDespesa, "id" | "user_id" | "created_at">) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      const { data: result, error } = await supabase
        .from("categorias_despesas")
        .insert({ ...data, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias-despesas"] });
    },
  });
};

export const useUpdateCategoriaDespesa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CategoriaDespesa> & { id: string }) => {
      const { data: result, error } = await supabase
        .from("categorias_despesas")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias-despesas"] });
    },
  });
};

export const useDeleteCategoriaDespesa = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categorias_despesas")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias-despesas"] });
    },
  });
};
