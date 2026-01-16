-- Allow both anon and authenticated users to create sessions/leads for active templates
-- This fixes testing while logged in (role=authenticated) and keeps public access working.

-- formularios_sessoes
DROP POLICY IF EXISTS "Anon can create sessions for active templates" ON public.formularios_sessoes;
CREATE POLICY "Public can create sessions for active templates"
ON public.formularios_sessoes
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.formularios_templates t
    WHERE t.id = public.formularios_sessoes.template_id
      AND t.status = 'ativo'
      AND t.user_id = public.formularios_sessoes.user_id
  )
);

-- formularios_leads
DROP POLICY IF EXISTS "Anon can create leads for active templates" ON public.formularios_leads;
CREATE POLICY "Public can create leads for active templates"
ON public.formularios_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.formularios_templates t
    WHERE t.id = public.formularios_leads.template_id
      AND t.status = 'ativo'
      AND t.user_id = public.formularios_leads.user_id
  )
);
