import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, format } from "date-fns";

export interface DespesaExclusaoMensal {
  id: string;
  despesa_id: string;
  mes: string;
  motivo: string | null;
  created_at: string;
}

export const useDespesasExclusoes = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["despesas-exclusoes", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("despesas_exclusoes_mensais")
        .select("*")
        .order("mes", { ascending: false });

      if (error) throw error;
      return data as DespesaExclusaoMensal[];
    },
    enabled: !!user?.id,
  });
};

export const useCreateDespesaExclusao = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      despesa_id: string;
      mes: Date;
      motivo?: string;
    }) => {
      // Normaliza para primeiro dia do mês
      const mesNormalizado = format(startOfMonth(data.mes), "yyyy-MM-dd");

      const { data: result, error } = await supabase
        .from("despesas_exclusoes_mensais")
        .insert({
          despesa_id: data.despesa_id,
          mes: mesNormalizado,
          motivo: data.motivo || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["despesas-exclusoes"] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
    },
  });
};

export const useDeleteDespesaExclusao = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("despesas_exclusoes_mensais")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["despesas-exclusoes"] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
    },
  });
};

// Helper para verificar se uma despesa está excluída em um mês específico
export const isDespesaExcluidaNoMes = (
  exclusoes: DespesaExclusaoMensal[],
  despesaId: string,
  mes: Date
): boolean => {
  const mesNormalizado = format(startOfMonth(mes), "yyyy-MM-dd");
  return exclusoes.some(
    (e) => e.despesa_id === despesaId && e.mes === mesNormalizado
  );
};
