-- Add error_text_color column to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS error_text_color TEXT DEFAULT '#ef4444';