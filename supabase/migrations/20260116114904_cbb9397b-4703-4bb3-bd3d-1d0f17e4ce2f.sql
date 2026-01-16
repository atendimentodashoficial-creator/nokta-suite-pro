-- Tabela de Templates de Formulários
CREATE TABLE public.formularios_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    cor_primaria TEXT DEFAULT '#8B5CF6',
    pagina_obrigado_titulo TEXT DEFAULT 'Obrigado!',
    pagina_obrigado_mensagem TEXT DEFAULT 'Recebemos suas informações. Em breve entraremos em contato.',
    pagina_obrigado_cta_texto TEXT,
    pagina_obrigado_cta_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Etapas dos Templates
CREATE TABLE public.formularios_etapas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES public.formularios_templates(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 1,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'email', 'telefone', 'opcoes', 'multiplos_campos', 'textarea', 'numero')),
    obrigatorio BOOLEAN NOT NULL DEFAULT true,
    ativo BOOLEAN NOT NULL DEFAULT true,
    configuracao JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Sessões de Formulário (rastreamento)
CREATE TABLE public.formularios_sessoes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES public.formularios_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    etapa_atual INTEGER NOT NULL DEFAULT 1,
    dados_parciais JSONB DEFAULT '{}',
    tempo_por_etapa JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    abandoned_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    ip_address TEXT,
    user_agent TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    fbclid TEXT,
    gclid TEXT
);

-- Tabela de Leads capturados
CREATE TABLE public.formularios_leads (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES public.formularios_templates(id) ON DELETE CASCADE,
    sessao_id UUID REFERENCES public.formularios_sessoes(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    nome TEXT,
    email TEXT,
    telefone TEXT,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'contactado', 'fechado', 'negado')),
    dados JSONB DEFAULT '{}',
    tempo_total_segundos INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Configurações de Pixels
CREATE TABLE public.formularios_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    google_ads_conversion_id TEXT,
    google_ads_conversion_label TEXT,
    google_ads_enabled BOOLEAN DEFAULT false,
    meta_pixel_id TEXT,
    meta_pixel_evento TEXT DEFAULT 'Lead',
    meta_pixel_enabled BOOLEAN DEFAULT false,
    ga4_measurement_id TEXT,
    ga4_evento TEXT DEFAULT 'form_submission',
    ga4_enabled BOOLEAN DEFAULT false,
    scripts_customizados TEXT,
    email_notificacao TEXT,
    webhook_url TEXT,
    timeout_minutos INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de Histórico de Status de Leads
CREATE TABLE public.formularios_leads_historico (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.formularios_leads(id) ON DELETE CASCADE,
    status_anterior TEXT,
    status_novo TEXT NOT NULL,
    observacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.formularios_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formularios_leads_historico ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Templates
CREATE POLICY "Users can view their own templates" ON public.formularios_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own templates" ON public.formularios_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own templates" ON public.formularios_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.formularios_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Etapas (through template ownership)
CREATE POLICY "Users can view etapas of their templates" ON public.formularios_etapas FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.formularios_templates WHERE id = template_id AND user_id = auth.uid())
);
CREATE POLICY "Users can create etapas in their templates" ON public.formularios_etapas FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.formularios_templates WHERE id = template_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update etapas in their templates" ON public.formularios_etapas FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.formularios_templates WHERE id = template_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete etapas in their templates" ON public.formularios_etapas FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.formularios_templates WHERE id = template_id AND user_id = auth.uid())
);

-- RLS Policies for Sessões
CREATE POLICY "Users can view their own sessions" ON public.formularios_sessoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can create sessions" ON public.formularios_sessoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.formularios_sessoes FOR UPDATE USING (true);

-- RLS Policies for Leads
CREATE POLICY "Users can view their own leads" ON public.formularios_leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can create leads" ON public.formularios_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own leads" ON public.formularios_leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own leads" ON public.formularios_leads FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Config
CREATE POLICY "Users can view their own config" ON public.formularios_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own config" ON public.formularios_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own config" ON public.formularios_config FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for Histórico
CREATE POLICY "Users can view historico of their leads" ON public.formularios_leads_historico FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.formularios_leads WHERE id = lead_id AND user_id = auth.uid())
);
CREATE POLICY "Anyone can create historico" ON public.formularios_leads_historico FOR INSERT WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_formularios_templates_updated_at BEFORE UPDATE ON public.formularios_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_formularios_etapas_updated_at BEFORE UPDATE ON public.formularios_etapas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_formularios_leads_updated_at BEFORE UPDATE ON public.formularios_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_formularios_config_updated_at BEFORE UPDATE ON public.formularios_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_formularios_templates_user_id ON public.formularios_templates(user_id);
CREATE INDEX idx_formularios_etapas_template_id ON public.formularios_etapas(template_id);
CREATE INDEX idx_formularios_sessoes_template_id ON public.formularios_sessoes(template_id);
CREATE INDEX idx_formularios_sessoes_user_id ON public.formularios_sessoes(user_id);
CREATE INDEX idx_formularios_leads_template_id ON public.formularios_leads(template_id);
CREATE INDEX idx_formularios_leads_user_id ON public.formularios_leads(user_id);
CREATE INDEX idx_formularios_leads_status ON public.formularios_leads(status);