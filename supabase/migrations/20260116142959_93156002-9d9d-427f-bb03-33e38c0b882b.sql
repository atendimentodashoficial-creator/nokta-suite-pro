-- Add logo_url column to formularios_templates
ALTER TABLE public.formularios_templates
ADD COLUMN logo_url TEXT;

-- Add comment
COMMENT ON COLUMN public.formularios_templates.logo_url IS 'URL da logo do formulário';