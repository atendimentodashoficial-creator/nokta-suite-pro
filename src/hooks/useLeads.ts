import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/phoneFormat";

export type LeadStatus = "lead" | "follow_up" | "sem_interesse" | "cliente";

// Represents an instance/origin where the lead appeared
export interface LeadPresence {
  origem: string;
  instancia_nome: string | null;
  created_at: string;
}

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
  respondeu: boolean | null;

  // Attribution fields
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  fb_ad_id?: string | null;
  fb_campaign_name?: string | null;
  fb_adset_name?: string | null;
  fb_ad_name?: string | null;
  ad_thumbnail_url?: string | null;

  created_at: string;
  updated_at: string;

  // New: all places where this contact appeared as lead (ordered by first contact)
  allPresences?: LeadPresence[];
}


export const useLeads = (status?: LeadStatus) => {
  return useQuery({
    queryKey: ["leads", status],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }); // ASC to get first contact first

      if (status) {
        query = query.eq("status", status);
      } else {
        // Quando não há filtro, não mostrar clientes
        query = query.neq("status", "cliente");
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const leadsData = data as Lead[];
      
      // Group all leads by phone (last 8 digits) to collect all presences
      const phonePresencesMap = new Map<string, LeadPresence[]>();
      
      for (const lead of leadsData) {
        const last8 = getLast8Digits(lead.telefone);
        if (!last8) continue;
        
        const presence: LeadPresence = {
          origem: lead.origem || "WhatsApp",
          instancia_nome: lead.instancia_nome,
          created_at: lead.created_at,
        };
        
        if (!phonePresencesMap.has(last8)) {
          phonePresencesMap.set(last8, []);
        }
        phonePresencesMap.get(last8)!.push(presence);
      }
      
      // Sort presences by created_at (first contact first) and dedupe by origem+instancia
      for (const [key, presences] of phonePresencesMap) {
        presences.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        // Dedupe: keep only unique origem+instancia_nome combinations
        const seen = new Set<string>();
        const deduped: LeadPresence[] = [];
        for (const p of presences) {
          const uniqueKey = `${(p.origem || "").toLowerCase()}-${(p.instancia_nome || "").toLowerCase()}`;
          if (!seen.has(uniqueKey)) {
            seen.add(uniqueKey);
            deduped.push(p);
          }
        }
        phonePresencesMap.set(key, deduped);
      }
      
      // Deduplica leads pelo últimos 8 dígitos do telefone + origem
      // Mantém o mais recente de cada combinação (re-sort DESC for this)
      const leadsDescending = [...leadsData].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      const seen = new Map<string, Lead>();
      
      for (const lead of leadsDescending) {
        const last8 = getLast8Digits(lead.telefone);
        const origem = (lead.origem || "").toLowerCase();
        const key = `${last8}-${origem}`;
        
        // Como a lista está ordenada por created_at DESC, o primeiro é o mais recente
        if (!seen.has(key)) {
          // Attach all presences to the lead
          const allPresences = phonePresencesMap.get(last8) || [];
          seen.set(key, { ...lead, allPresences });
        }
      }
      
      // Sort final results by created_at DESC (most recent first)
      return Array.from(seen.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
};

export const useLeadStats = () => {
  return useQuery({
    queryKey: ["lead-stats"],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("status, valor_tratamento")
        .is("deleted_at", null);

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
