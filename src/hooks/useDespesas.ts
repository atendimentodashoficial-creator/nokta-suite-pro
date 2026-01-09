import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
