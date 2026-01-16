-- Tighten RLS for public form usage and fix overly permissive policies

-- Sessions
DROP POLICY IF EXISTS "Anyone can update sessions" ON public.formularios_sessoes;
DROP POLICY IF EXISTS "Anyone can create sessions" ON public.formularios_sessoes;
DROP POLICY IF EXISTS "Anon can create sessions for active templates" ON public.formularios_sessoes;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.formularios_sessoes;

CREATE POLICY "Anon can create sessions for active templates"
ON public.formularios_sessoes
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.formularios_templates t
    WHERE t.id = formularios_sessoes.template_id
      AND t.status = 'ativo'
      AND t.user_id = formularios_sessoes.user_id
  )
);

CREATE POLICY "Users can update their own sessions"
ON public.formularios_sessoes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Leads
DROP POLICY IF EXISTS "Anyone can create leads" ON public.formularios_leads;
DROP POLICY IF EXISTS "Anon can create leads for active templates" ON public.formularios_leads;

CREATE POLICY "Anon can create leads for active templates"
ON public.formularios_leads
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.formularios_templates t
    WHERE t.id = formularios_leads.template_id
      AND t.status = 'ativo'
      AND t.user_id = formularios_leads.user_id
  )
);

-- Public read access needed by the public form (ONLY for anon)
DROP POLICY IF EXISTS "Anon can view active templates" ON public.formularios_templates;
CREATE POLICY "Anon can view active templates"
ON public.formularios_templates
FOR SELECT
TO anon
USING (status = 'ativo');

DROP POLICY IF EXISTS "Anon can view etapas of active templates" ON public.formularios_etapas;
CREATE POLICY "Anon can view etapas of active templates"
ON public.formularios_etapas
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.formularios_templates t
    WHERE t.id = formularios_etapas.template_id
      AND t.status = 'ativo'
  )
);