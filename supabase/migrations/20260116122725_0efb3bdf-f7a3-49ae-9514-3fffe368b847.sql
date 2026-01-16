-- Fix permissive historico insert policy
DROP POLICY IF EXISTS "Anyone can create historico" ON public.formularios_leads_historico;

CREATE POLICY "Users can create historico for their leads"
ON public.formularios_leads_historico
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.formularios_leads l
    WHERE l.id = formularios_leads_historico.lead_id
      AND l.user_id = auth.uid()
  )
);

-- Harden generate_slug function search_path
CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  slug TEXT;
BEGIN
  slug := lower(input_text);
  slug := regexp_replace(slug, '[àáâãäå]', 'a', 'gi');
  slug := regexp_replace(slug, '[èéêë]', 'e', 'gi');
  slug := regexp_replace(slug, '[ìíîï]', 'i', 'gi');
  slug := regexp_replace(slug, '[òóôõö]', 'o', 'gi');
  slug := regexp_replace(slug, '[ùúûü]', 'u', 'gi');
  slug := regexp_replace(slug, '[ç]', 'c', 'gi');
  slug := regexp_replace(slug, '[ñ]', 'n', 'gi');
  slug := regexp_replace(slug, '\s+', '-', 'g');
  slug := regexp_replace(slug, '[^a-z0-9\-]', '', 'g');
  slug := regexp_replace(slug, '-+', '-', 'g');
  slug := trim(both '-' from slug);
  RETURN slug;
END;
$$;