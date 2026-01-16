-- Add layout type column to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN layout_tipo TEXT NOT NULL DEFAULT 'multi_step';

-- Add comment for documentation
COMMENT ON COLUMN public.formularios_templates.layout_tipo IS 'Form layout type: multi_step (default) or single_page';