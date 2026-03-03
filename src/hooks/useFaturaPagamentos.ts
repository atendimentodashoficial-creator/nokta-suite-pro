import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FaturaPagamento {
  id: string;
  fatura_id: string;
  user_id: string;
  valor: number;
  data_pagamento: string;
  data_proximo_pagamento: string | null;
  comprovante_url: string | null;
  observacoes: string | null;
  created_at: string;
}

export const useFaturaPagamentos = (faturaId: string | null) => {
  return useQuery({
    queryKey: ["fatura-pagamentos", faturaId],
    queryFn: async () => {
      if (!faturaId) return [];
      const { data, error } = await supabase
        .from("fatura_pagamentos")
        .select("*")
        .eq("fatura_id", faturaId)
        .order("data_pagamento", { ascending: true });
      if (error) throw error;
      return (data || []) as FaturaPagamento[];
    },
    enabled: !!faturaId,
  });
};

// Bulk fetch pagamentos for multiple faturas at once
export const useAllFaturaPagamentos = () => {
  return useQuery({
    queryKey: ["fatura-pagamentos-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatura_pagamentos")
        .select("*")
        .order("data_pagamento", { ascending: true });
      if (error) throw error;
      
      // Group by fatura_id
      const grouped: Record<string, FaturaPagamento[]> = {};
      (data || []).forEach((p: FaturaPagamento) => {
        if (!grouped[p.fatura_id]) grouped[p.fatura_id] = [];
        grouped[p.fatura_id].push(p);
      });
      return grouped;
    },
  });
};

export const useCreateFaturaPagamento = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pagamento: {
      fatura_id: string;
      valor: number;
      data_pagamento: string;
      data_proximo_pagamento?: string | null;
      comprovante_url?: string | null;
      observacoes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from("fatura_pagamentos")
        .insert({ ...pagamento, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["fatura-pagamentos", variables.fatura_id] });
    },
  });
};

export const useDeleteFaturaPagamento = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, faturaId }: { id: string; faturaId: string }) => {
      const { error } = await supabase
        .from("fatura_pagamentos")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return faturaId;
    },
    onSuccess: (faturaId) => {
      queryClient.invalidateQueries({ queryKey: ["fatura-pagamentos", faturaId] });
    },
  });
};

export const uploadComprovante = async (file: File): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("comprovantes")
    .upload(path, file);
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("comprovantes")
    .getPublicUrl(path);

  return urlData.publicUrl;
};
