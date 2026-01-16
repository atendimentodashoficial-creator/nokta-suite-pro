-- Add background_color column to formularios_templates
ALTER TABLE public.formularios_templates
ADD COLUMN background_color TEXT DEFAULT '#ffffff';

COMMENT ON COLUMN public.formularios_templates.background_color IS 'Cor de fundo do formulário';