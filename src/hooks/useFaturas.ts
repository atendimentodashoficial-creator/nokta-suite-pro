import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StatusFatura = "negociacao" | "fechado";

export interface Fatura {
  id: string;
  user_id: string;
  cliente_id: string;
  procedimento_id: string | null;
  profissional_id: string | null;
  valor: number;
  status: StatusFatura;
  observacoes: string | null;
  data_follow_up: string | null;
  created_at: string;
  updated_at: string;
  meio_pagamento: string | null;
  forma_pagamento: string | null;
  valor_entrada: number | null;
  numero_parcelas: number | null;
  valor_parcela: number | null;
  taxa_parcelamento: number | null;
  juros_pago_por: string | null;
}

export const useFaturas = (status?: StatusFatura) => {
  return useQuery({
    queryKey: ["faturas", status],
    queryFn: async () => {
      let query = supabase
        .from("faturas")
        .select(`
          *,
          leads:cliente_id(nome, telefone, origem),
          procedimentos:procedimento_id(nome),
          profissionais:profissional_id(nome),
          fatura_agendamentos(
            agendamento_id,
            agendamentos:agendamento_id(data_agendamento)
          ),
          fatura_upsells(
            id,
            tipo,
            descricao,
            valor,
            produto_id,
            procedimento_id
          )
        `)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateFatura = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (fatura: Omit<Fatura, "id" | "created_at" | "updated_at" | "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("faturas")
        .insert({ ...fatura, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
    },
  });
};

export const useDeleteFatura = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (faturaId: string) => {
      // Delete related records first
      await supabase.from("fatura_upsells").delete().eq("fatura_id", faturaId);
      await supabase.from("fatura_agendamentos").delete().eq("fatura_id", faturaId);
      
      const { error } = await supabase
        .from("faturas")
        .delete()
        .eq("id", faturaId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
    },
  });
};