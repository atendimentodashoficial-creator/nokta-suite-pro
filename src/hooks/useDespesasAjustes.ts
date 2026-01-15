import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { nowInBrasilia, parseDateStringBrasilia } from "@/utils/timezone";

export interface DespesaAjuste {
  id: string;
  despesa_id: string;
  valor_anterior: number;
  valor_novo: number;
  data_ajuste: string;
  observacao?: string | null;
  created_at: string;
}

export const useDespesasAjustes = (despesaId?: string) => {
  return useQuery({
    queryKey: ["despesas-ajustes", despesaId],
    queryFn: async () => {
      if (!despesaId) return [];
      
      const { data, error } = await supabase
        .from("despesas_ajustes")
        .select("*")
        .eq("despesa_id", despesaId)
        .order("data_ajuste", { ascending: false });

      if (error) throw error;
      return data as DespesaAjuste[];
    },
    enabled: !!despesaId,
  });
};

export const useCreateDespesaAjuste = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      despesa_id: string;
      valor_anterior: number;
      valor_novo: number;
      data_ajuste: string;
      observacao?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("despesas_ajustes")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["despesas-ajustes", variables.despesa_id] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
    },
  });
};

export const useDeleteDespesaAjuste = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, despesaId }: { id: string; despesaId: string }) => {
      const { error } = await supabase
        .from("despesas_ajustes")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return despesaId;
    },
    onSuccess: (despesaId) => {
      queryClient.invalidateQueries({ queryKey: ["despesas-ajustes", despesaId] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
    },
  });
};

/**
 * Retorna o valor atual de uma despesa recorrente considerando ajustes
 * Se houver ajustes, retorna o valor do ajuste mais recente até a data atual
 */
export const getValorAtualDespesa = (
  valorBase: number,
  ajustes: DespesaAjuste[],
  dataReferencia: Date = nowInBrasilia()
): number => {
  if (!ajustes || ajustes.length === 0) return valorBase;
  
  // Ordena por data decrescente e pega o ajuste mais recente que seja anterior ou igual à data de referência
  const ajusteValido = ajustes
    .filter(a => parseDateStringBrasilia(a.data_ajuste) <= dataReferencia)
    .sort((a, b) => parseDateStringBrasilia(b.data_ajuste).getTime() - parseDateStringBrasilia(a.data_ajuste).getTime())[0];
  
  return ajusteValido ? ajusteValido.valor_novo : valorBase;
};
