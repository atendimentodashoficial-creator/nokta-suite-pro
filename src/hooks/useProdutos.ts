import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Produto {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  valor: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export const useProdutos = (apenasAtivos = false) => {
  return useQuery({
    queryKey: ["produtos", apenasAtivos],
    queryFn: async () => {
      let query = supabase
        .from("produtos")
        .select("*")
        .order("nome", { ascending: true });

      if (apenasAtivos) {
        query = query.eq("ativo", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Produto[];
    },
  });
};

export const useCreateProduto = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (produto: Omit<Produto, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("produtos")
        .insert({ ...produto, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
  });
};

export const useUpdateProduto = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...produto }: Partial<Produto> & { id: string }) => {
      const { data, error } = await supabase
        .from("produtos")
        .update(produto)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
  });
};

export const useDeleteProduto = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("produtos")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
  });
};
