import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Escala {
  id: string;
  user_id: string;
  profissional_id: string;
  dia_semana: number; // 0=domingo, 6=sábado
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ausencia {
  id: string;
  user_id: string;
  profissional_id: string;
  data_inicio: string;
  data_fim: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  motivo: string | null;
  created_at: string;
  updated_at: string;
}

export const useEscalas = (profissionalId?: string) => {
  return useQuery({
    queryKey: ["escalas", profissionalId],
    queryFn: async () => {
      let query = supabase
        .from("escalas_profissionais")
        .select("*")
        .eq("ativo", true)
        .order("dia_semana", { ascending: true })
        .order("hora_inicio", { ascending: true });

      if (profissionalId) {
        query = query.eq("profissional_id", profissionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Escala[];
    },
  });
};

export const useCreateEscala = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (escala: Omit<Escala, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("escalas_profissionais")
        .insert({ ...escala, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas"] });
    },
  });
};

export const useUpdateEscala = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...escala }: Partial<Escala> & { id: string }) => {
      const { data, error } = await supabase
        .from("escalas_profissionais")
        .update(escala)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas"] });
    },
  });
};

export const useDeleteEscala = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("escalas_profissionais")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalas"] });
    },
  });
};

export const useAusencias = (profissionalId?: string) => {
  return useQuery({
    queryKey: ["ausencias", profissionalId],
    queryFn: async () => {
      let query = supabase
        .from("ausencias_profissionais")
        .select("*")
        .order("data_inicio", { ascending: true });

      if (profissionalId) {
        query = query.eq("profissional_id", profissionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Ausencia[];
    },
  });
};

export const useCreateAusencia = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ausencia: Omit<Ausencia, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("ausencias_profissionais")
        .insert({ ...ausencia, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
    },
  });
};

export const useUpdateAusencia = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...ausencia }: Partial<Ausencia> & { id: string }) => {
      const { data, error } = await supabase
        .from("ausencias_profissionais")
        .update(ausencia)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
    },
  });
};

export const useDeleteAusencia = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ausencias_profissionais")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
    },
  });
};