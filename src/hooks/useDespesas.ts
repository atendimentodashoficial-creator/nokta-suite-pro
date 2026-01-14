import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useDespesasTotal = () => {
  return useQuery({
    queryKey: ["despesas-total"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas")
        .select("valor");

      if (error) throw error;

      const total = data?.reduce((sum, d) => sum + Number(d.valor), 0) || 0;
      return total;
    },
  });
};

export interface DespesaResumo {
  id: string;
  descricao: string;
  valor: number;
  categoria_id: string | null;
  data_despesa: string | null;
  recorrente: boolean | null;
  parcelada: boolean | null;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string | null;
  categorias_despesas: {
    id: string;
    nome: string;
    cor: string | null;
  } | null;
}

export const useDespesasRelatorio = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["despesas-relatorio", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("despesas")
        .select(`
          id,
          descricao,
          valor,
          categoria_id,
          data_despesa,
          recorrente,
          parcelada,
          data_inicio,
          data_fim,
          created_at,
          categorias_despesas (
            id,
            nome,
            cor
          )
        `)
        .eq("user_id", user.id)
        .order("data_despesa", { ascending: false });

      if (error) throw error;
      return data as DespesaResumo[];
    },
    enabled: !!user?.id,
  });
};
