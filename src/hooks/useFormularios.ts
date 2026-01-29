import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface SideImage {
  url: string;
}

export interface SideVideo {
  url: string;
}

export interface MediaItem {
  url: string;
  titulo: string;
  subtitulo: string;
  sideImages?: SideImage[];
  sideVideos?: SideVideo[];
}

export interface FormularioTemplate {
  id: string;
  user_id: string;
  nome: string;
  descricao: string | null;
  slug: string | null;
  status: string;
  layout_tipo: string;
  cor_primaria: string | null;
  background_color: string | null;
  card_color: string | null;
  font_family: string | null;
  text_color: string | null;
  button_text_color: string | null;
  border_radius: string | null;
  progress_background_color: string | null;
  barra_progresso_visivel: boolean | null;
  fonte_tamanho_indicador_etapa: string | null;
  card_border_color: string | null;
  back_button_color: string | null;
  back_button_text_color: string | null;
  answer_text_color: string | null;
  error_text_color: string | null;
  logo_url: string | null;
  // New title fields
  titulo: string | null;
  subtitulo: string | null;
  titulo_visivel: boolean;
  titulo_cor: string | null;
  fonte_tamanho_titulo: string | null;
  fonte_tamanho_subtitulo: string | null;
  fonte_tamanho_campos: string | null;
  fonte_tamanho_obrigado_titulo: string | null;
  fonte_tamanho_obrigado_texto: string | null;
  // Thank you page
  pagina_obrigado_titulo: string | null;
  pagina_obrigado_mensagem: string | null;
  pagina_obrigado_cta_texto: string | null;
  pagina_obrigado_cta_link: string | null;
  pagina_obrigado_video_url: string | null;
  pagina_obrigado_video_titulo: string | null;
  pagina_obrigado_video_subtitulo: string | null;
  pagina_obrigado_video_posicao: string | null;
  pagina_obrigado_imagem_url: string | null;
  pagina_obrigado_imagem_titulo: string | null;
  pagina_obrigado_imagem_subtitulo: string | null;
  pagina_obrigado_imagens: unknown;
  pagina_obrigado_videos: unknown;
  created_at: string;
  updated_at: string;
  etapas?: FormularioEtapa[];
}

export interface FormularioEtapa {
  id: string;
  template_id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  obrigatorio: boolean;
  ativo: boolean;
  configuracao: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FormularioSessao {
  id: string;
  template_id: string;
  user_id: string;
  session_token: string;
  etapa_atual: number;
  dados_parciais: Record<string, unknown>;
  tempo_por_etapa: Record<string, number>;
  started_at: string;
  last_activity_at: string;
  abandoned_at: string | null;
  completed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  template?: FormularioTemplate;
}

export interface FormularioLead {
  id: string;
  template_id: string;
  sessao_id: string | null;
  user_id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
  dados: Record<string, unknown>;
  tempo_total_segundos: number | null;
  created_at: string;
  updated_at: string;
  template?: FormularioTemplate;
}

export interface FormularioConfig {
  id: string;
  user_id: string;
  google_ads_conversion_id: string | null;
  google_ads_conversion_label: string | null;
  google_ads_enabled: boolean;
  meta_pixel_id: string | null;
  meta_pixel_evento: string | null;
  meta_pixel_enabled: boolean;
  meta_access_token: string | null;
  meta_test_event_code: string | null;
  ga4_measurement_id: string | null;
  ga4_evento: string | null;
  ga4_enabled: boolean;
  scripts_customizados: string | null;
  email_notificacao: string | null;
  webhook_url: string | null;
  timeout_minutos: number;
  created_at: string;
  updated_at: string;
}

// Templates
export function useFormulariosTemplates() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["formularios-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios_templates")
        .select("*, formularios_etapas(*)")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as (FormularioTemplate & { formularios_etapas: FormularioEtapa[] })[];
    },
    enabled: !!user,
  });
}

export function useFormularioTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ["formularios-template", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("formularios_templates")
        .select("*, formularios_etapas(*)")
        .eq("id", id)
        .single();
      
      if (error) throw error;
      return data as FormularioTemplate & { formularios_etapas: FormularioEtapa[] };
    },
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (data: Partial<FormularioTemplate>) => {
      const { data: template, error } = await supabase
        .from("formularios_templates")
        .insert({ ...data, user_id: user?.id } as any)
        .select()
        .single();
      
      if (error) throw error;
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      toast.success("Template criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar template: " + error.message);
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<FormularioTemplate> & { id: string }) => {
      const { data: template, error } = await supabase
        .from("formularios_templates")
        .update(data as any)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      toast.success("Template atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar template: " + error.message);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formularios_templates")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      toast.success("Template excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir template: " + error.message);
    },
  });
}

// Etapas
export function useCreateEtapa() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Partial<FormularioEtapa>) => {
      const { data: etapa, error } = await supabase
        .from("formularios_etapas")
        .insert(data as any)
        .select()
        .single();
      
      if (error) throw error;
      return etapa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      queryClient.invalidateQueries({ queryKey: ["formularios-template"] });
      toast.success("Etapa criada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar etapa: " + error.message);
    },
  });
}

export function useUpdateEtapa() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<FormularioEtapa> & { id: string }) => {
      const { data: etapa, error } = await supabase
        .from("formularios_etapas")
        .update(data as any)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return etapa;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      queryClient.invalidateQueries({ queryKey: ["formularios-template"] });
      toast.success("Etapa atualizada com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar etapa: " + error.message);
    },
  });
}

export function useDeleteEtapa() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formularios_etapas")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      queryClient.invalidateQueries({ queryKey: ["formularios-template"] });
      toast.success("Etapa excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir etapa: " + error.message);
    },
  });
}

export function useReorderEtapas() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (etapas: { id: string; ordem: number }[]) => {
      const updates = etapas.map(({ id, ordem }) =>
        supabase.from("formularios_etapas").update({ ordem }).eq("id", id)
      );
      
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw errors[0].error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-templates"] });
      queryClient.invalidateQueries({ queryKey: ["formularios-template"] });
    },
  });
}

// Leads
export function useFormulariosLeads(filters?: { status?: string; templateId?: string; dateStart?: Date; dateEnd?: Date }) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["formularios-leads", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("formularios_leads")
        .select("*, formularios_templates(nome, formularios_etapas(*))")
        .order("created_at", { ascending: false });
      
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.templateId) {
        query = query.eq("template_id", filters.templateId);
      }
      if (filters?.dateStart) {
        query = query.gte("created_at", filters.dateStart.toISOString());
      }
      if (filters?.dateEnd) {
        query = query.lte("created_at", filters.dateEnd.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (FormularioLead & { formularios_templates: { nome: string; formularios_etapas: FormularioEtapa[] } | null })[];
    },
    enabled: !!user,
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status, observacao }: { id: string; status: string; observacao?: string }) => {
      // Get current status
      const { data: lead } = await supabase
        .from("formularios_leads")
        .select("status")
        .eq("id", id)
        .single();
      
      // Update lead
      const { error: updateError } = await supabase
        .from("formularios_leads")
        .update({ status })
        .eq("id", id);
      
      if (updateError) throw updateError;
      
      // Create history entry
      const { error: historyError } = await supabase
        .from("formularios_leads_historico")
        .insert({
          lead_id: id,
          status_anterior: lead?.status,
          status_novo: status,
          observacao,
        });
      
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-leads"] });
      toast.success("Status atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formularios_leads")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-leads"] });
      toast.success("Lead excluído com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir lead: " + error.message);
    },
  });
}

// Sessões/Abandonos
export function useFormulariosSessoes(filters?: { templateId?: string; dateStart?: Date; dateEnd?: Date }) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["formularios-sessoes", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("formularios_sessoes")
        .select("*, formularios_templates(nome, layout_tipo, formularios_etapas(*))")
        .is("completed_at", null)
        .not("abandoned_at", "is", null)
        .order("abandoned_at", { ascending: false });
      
      if (filters?.templateId) {
        query = query.eq("template_id", filters.templateId);
      }
      if (filters?.dateStart) {
        query = query.gte("started_at", filters.dateStart.toISOString());
      }
      if (filters?.dateEnd) {
        query = query.lte("started_at", filters.dateEnd.toISOString());
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (FormularioSessao & { 
        formularios_templates: { nome: string; layout_tipo: string; formularios_etapas: FormularioEtapa[] } | null 
      })[];
    },
    enabled: !!user,
  });
}

export function useDeleteSessao() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("formularios_sessoes")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-sessoes"] });
      queryClient.invalidateQueries({ queryKey: ["formularios-dashboard"] });
      toast.success("Registro de abandono excluído");
    },
    onError: () => {
      toast.error("Erro ao excluir registro");
    },
  });
}

// Dashboard Stats
export function useFormulariosDashboard(dateStart?: Date, dateEnd?: Date) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["formularios-dashboard", user?.id, dateStart?.toISOString(), dateEnd?.toISOString()],
    queryFn: async () => {
      let leadsQuery = supabase
        .from("formularios_leads")
        .select("status, tempo_total_segundos, created_at");
      
      let sessoesQuery = supabase
        .from("formularios_sessoes")
        .select("id, completed_at, abandoned_at, started_at");
      
      if (dateStart) {
        leadsQuery = leadsQuery.gte("created_at", dateStart.toISOString());
        sessoesQuery = sessoesQuery.gte("started_at", dateStart.toISOString());
      }
      if (dateEnd) {
        leadsQuery = leadsQuery.lte("created_at", dateEnd.toISOString());
        sessoesQuery = sessoesQuery.lte("started_at", dateEnd.toISOString());
      }
      
      const [leadsResult, sessoesResult] = await Promise.all([
        leadsQuery,
        sessoesQuery,
      ]);
      
      if (leadsResult.error) throw leadsResult.error;
      if (sessoesResult.error) throw sessoesResult.error;
      
      const leads = leadsResult.data || [];
      const sessoes = sessoesResult.data || [];
      
      const totalLeads = leads.length;
      const novos = leads.filter(l => l.status === "novo").length;
      const contactados = leads.filter(l => l.status === "contactado").length;
      const fechados = leads.filter(l => l.status === "fechado").length;
      const negados = leads.filter(l => l.status === "negado").length;
      
      const abandonados = sessoes.filter(s => s.abandoned_at && !s.completed_at).length;
      // Taxa de conversão: porcentagem de leads que foram fechados
      const taxaConversao = totalLeads > 0 ? ((fechados / totalLeads) * 100).toFixed(1) : "0";
      
      const temposValidos = leads.filter(l => l.tempo_total_segundos).map(l => l.tempo_total_segundos!);
      const tempoMedio = temposValidos.length > 0 
        ? Math.round(temposValidos.reduce((a, b) => a + b, 0) / temposValidos.length)
        : 0;
      
      // Leads por dia (últimos 7 dias)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        date.setHours(0, 0, 0, 0);
        return date;
      });
      
      const leadsPorDia = last7Days.map(day => {
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const count = leads.filter(l => {
          const leadDate = new Date(l.created_at);
          return leadDate >= day && leadDate < nextDay;
        }).length;
        
        return {
          date: day.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
          leads: count,
        };
      });
      
      return {
        totalLeads,
        abandonados,
        novos,
        contactados,
        fechados,
        negados,
        taxaConversao,
        tempoMedio,
        leadsPorDia,
      };
    },
    enabled: !!user,
  });
}

// Config
export function useFormulariosConfig() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["formularios-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios_config")
        .select("*")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as FormularioConfig | null;
    },
    enabled: !!user,
  });
}

export function useSaveFormulariosConfig() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (data: Partial<FormularioConfig>) => {
      const { data: existing } = await supabase
        .from("formularios_config")
        .select("id")
        .single();
      
      if (existing) {
        const { error } = await supabase
          .from("formularios_config")
          .update(data)
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("formularios_config")
          .insert({ ...data, user_id: user?.id });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formularios-config"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao salvar configurações: " + error.message);
    },
  });
}
