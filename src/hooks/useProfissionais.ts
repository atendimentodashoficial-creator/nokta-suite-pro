import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Profissional {
  id: string;
  user_id: string;
  nome: string;
  especialidade: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  ordem: number | null;
  created_at: string;
  updated_at: string;
}

export const useProfissionais = (apenasAtivos = false) => {
  return useQuery({
    queryKey: ["profissionais", apenasAtivos],
    queryFn: async () => {
      let query = supabase
        .from("profissionais")
        .select("*")
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("nome", { ascending: true });

      if (apenasAtivos) {
        query = query.eq("ativo", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Profissional[];
    },
  });
};

export const useCreateProfissional = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (profissional: Omit<Profissional, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("profissionais")
        .insert({ ...profissional, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profissionais"] });
    },
  });
};

export const useUpdateProfissional = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...profissional }: Partial<Profissional> & { id: string }) => {
      const { data, error } = await supabase
        .from("profissionais")
        .update(profissional)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profissionais"] });
    },
  });
};

export const useDeleteProfissional = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("profissionais")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profissionais"] });
    },
  });
};