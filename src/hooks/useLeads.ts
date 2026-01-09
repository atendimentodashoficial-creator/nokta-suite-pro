import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/phoneFormat";

export type LeadStatus = "lead" | "follow_up" | "sem_interesse" | "cliente";

export interface Lead {
  id: string;
  user_id: string;
  nome: string;
  telefone: string;
  email: string | null;
  procedimento_id: string | null;
  procedimento_nome: string;
  profissional_id: string | null;
  status: LeadStatus;
  data_contato: string;
  data_agendamento: string | null;
  data_comparecimento: string | null;
  valor_tratamento: number | null;
  observacoes: string | null;
  avaliacao: number | null;
  origem: string | null;
  origem_lead: boolean;
  instancia_nome: string | null;
  created_at: string;
  updated_at: string;
}

export const useLeads = (status?: LeadStatus) => {
  return useQuery({
    queryKey: ["leads", status],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      } else {
        // Quando não há filtro, não mostrar clientes
        query = query.neq("status", "cliente");
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Deduplica leads pelo últimos 8 dígitos do telefone + origem
      // Mantém o mais recente de cada combinação
      const leadsData = data as Lead[];
      const seen = new Map<string, Lead>();
      
      for (const lead of leadsData) {
        const last8 = getLast8Digits(lead.telefone);
        const origem = (lead.origem || "").toLowerCase();
        const key = `${last8}-${origem}`;
        
        // Como a query já vem ordenada por created_at DESC, o primeiro é o mais recente
        if (!seen.has(key)) {
          seen.set(key, lead);
        }
      }
      
      return Array.from(seen.values());
    },
  });
};

export const useLeadStats = () => {
  return useQuery({
    queryKey: ["lead-stats"],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("status, valor_tratamento");

      if (error) throw error;

      const total = leads?.length || 0;
      const leadsAtivos = leads?.filter((l) => l.status === "lead").length || 0;
      const followUps = leads?.filter((l) => l.status === "follow_up").length || 0;
      
      const receitaTotal = leads
        ?.reduce((sum, l) => sum + (l.valor_tratamento || 0), 0) || 0;

      return {
        total,
        leadsAtivos,
        followUps,
        receitaTotal,
      };
    },
  });
};
