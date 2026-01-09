import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusAgendamento = "agendado" | "confirmado" | "realizado" | "cancelado";

export interface Agendamento {
  id: string;
  user_id: string;
  cliente_id: string;
  procedimento_id: string | null;
  profissional_id: string | null;
  tipo: string; // Custom types are now allowed
  status: StatusAgendamento;
  data_agendamento: string;
  observacoes: string | null;
  data_follow_up: string | null;
  numero_reagendamentos: number;
  aviso_dia_anterior: boolean;
  aviso_dia: boolean;
  aviso_3dias: boolean;
  origem_agendamento: string | null;
  origem_instancia_nome: string | null;
  created_at: string;
  updated_at: string;
}

export const useAgendamentos = (filters?: { 
  data?: string;
  status?: StatusAgendamento;
  tipo?: string;
}) => {
  return useQuery({
    queryKey: ["agendamentos", filters],
    queryFn: async () => {
      let query = supabase
        .from("agendamentos")
        .select(`
          *,
          leads:cliente_id(nome, telefone, origem),
          procedimentos:procedimento_id(nome),
          profissionais:profissional_id(nome)
        `)
        .order("data_agendamento", { ascending: true });

      if (filters?.data) {
        const startDate = new Date(filters.data);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(filters.data);
        endDate.setHours(23, 59, 59, 999);
        
        query = query
          .gte("data_agendamento", startDate.toISOString())
          .lte("data_agendamento", endDate.toISOString());
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      if (filters?.tipo) {
        query = query.eq("tipo", filters.tipo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateAgendamento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agendamento: Omit<Agendamento, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("agendamentos")
        .insert({ ...agendamento, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
  });
};

export const useUpdateAgendamentoStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StatusAgendamento }) => {
      const { data, error } = await supabase
        .from("agendamentos")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    },
  });
};

export const useDeleteAgendamento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agendamentoId: string) => {
      // Delete related fatura_agendamentos first
      await supabase.from("fatura_agendamentos").delete().eq("agendamento_id", agendamentoId);
      
      const { error } = await supabase
        .from("agendamentos")
        .delete()
        .eq("id", agendamentoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
};