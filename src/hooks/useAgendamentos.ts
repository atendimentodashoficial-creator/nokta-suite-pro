import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDayBrasilia, endOfDayBrasilia, parseDateStringBrasilia } from "@/utils/timezone";

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
  meta_event_sent_at: string | null;
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
        // Usar timezone de Brasília para criar os limites do dia
        const dateToFilter = parseDateStringBrasilia(filters.data);
        const startDate = startOfDayBrasilia(dateToFilter);
        const endDate = endOfDayBrasilia(dateToFilter);
        
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
    mutationFn: async (agendamento: Omit<Agendamento, "id" | "created_at" | "updated_at" | "user_id" | "meta_event_sent_at">) => {
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
      // First, fetch the agendamento to check if CompleteRegistration was already sent
      const { data: agendamento, error: fetchError } = await supabase
        .from("agendamentos")
        .select("*, meta_event_sent_at, cliente_id, data_agendamento")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from("agendamentos")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Return both the updated data and original agendamento info for onSuccess
      return { 
        ...data, 
        _wasNotSent: !agendamento.meta_event_sent_at,
        _clienteId: agendamento.cliente_id,
        _dataAgendamento: agendamento.data_agendamento,
        _newStatus: status
      };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      
      // Send CompleteRegistration when status changes to "realizado" (compareceu) - idempotent
      if (data._newStatus === "realizado" && data._wasNotSent) {
        try {
          // Dynamically import to avoid circular dependencies
          const { sendCompleteRegistrationConversion } = await import("@/hooks/useMetaConversions");
          
          const result = await sendCompleteRegistrationConversion(
            data.id,
            data._clienteId,
            data._dataAgendamento
          );
          
          if (result.success) {
            // Mark as sent
            await supabase
              .from("agendamentos")
              .update({ meta_event_sent_at: new Date().toISOString() })
              .eq("id", data.id);
            
            console.log("Meta Conversion: CompleteRegistration sent automatically for agendamento (compareceu)", data.id);
          }
        } catch (error) {
          console.error("Meta Conversion: Failed to send CompleteRegistration", error);
          // Don't throw - this shouldn't block the status update
        }
      }
    },
  });
};

export const useDeleteAgendamento = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agendamentoId: string) => {
      // Primeiro buscar os dados do agendamento para logar
      const { data: agendamento, error: fetchError } = await supabase
        .from("agendamentos")
        .select(`
          *,
          leads:cliente_id(nome, telefone),
          procedimentos:procedimento_id(nome),
          profissionais:profissional_id(nome)
        `)
        .eq("id", agendamentoId)
        .single();

      if (fetchError) throw fetchError;
      if (!agendamento) throw new Error("Agendamento não encontrado");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Logar a exclusão antes de deletar
      const { error: logError } = await supabase
        .from("agendamentos_excluidos_log")
        .insert({
          user_id: user.id,
          cliente_id: agendamento.cliente_id,
          cliente_nome: agendamento.leads?.nome || "Desconhecido",
          cliente_telefone: agendamento.leads?.telefone || "",
          procedimento_id: agendamento.procedimento_id,
          procedimento_nome: agendamento.procedimentos?.nome || null,
          profissional_id: agendamento.profissional_id,
          profissional_nome: agendamento.profissionais?.nome || null,
          tipo: agendamento.tipo,
          status: agendamento.status,
          data_agendamento: agendamento.data_agendamento,
          observacoes: agendamento.observacoes,
          motivo_exclusao: "Excluído manualmente"
        });

      if (logError) {
        console.error("Erro ao logar exclusão:", logError);
        // Não bloquear a exclusão se falhar o log
      }

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
      queryClient.invalidateQueries({ queryKey: ["agendamentos-excluidos"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
};

// Hook para buscar agendamentos excluídos (para métricas)
export const useAgendamentosExcluidos = (dateStart?: Date, dateEnd?: Date) => {
  return useQuery({
    queryKey: ["agendamentos-excluidos", dateStart?.toISOString(), dateEnd?.toISOString()],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from("agendamentos_excluidos_log")
        .select("*")
        .eq("user_id", user.id)
        .order("excluido_em", { ascending: false });

      // Filtrar por período do agendamento (não pela data de exclusão)
      // Usar timezone de Brasília para consistência
      if (dateStart) {
        const startOfDayDate = startOfDayBrasilia(dateStart);
        query = query.gte("data_agendamento", startOfDayDate.toISOString());
      }

      if (dateEnd) {
        const endOfDayDate = endOfDayBrasilia(dateEnd);
        query = query.lte("data_agendamento", endOfDayDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
};

// Hook para deletar log de agendamento excluído
export const useDeleteAgendamentoExcluidoLog = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from("agendamentos_excluidos_log")
        .delete()
        .eq("id", logId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos-excluidos"] });
    },
  });
};