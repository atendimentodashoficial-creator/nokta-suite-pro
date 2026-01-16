-- Add subtitulo_cor column to formularios_templates table
ALTER TABLE public.formularios_templates
ADD COLUMN IF NOT EXISTS subtitulo_cor TEXT DEFAULT '#6b7280';