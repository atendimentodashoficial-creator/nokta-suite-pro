-- Add column to toggle progress bar visibility
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS barra_progresso_visivel boolean NOT NULL DEFAULT true;