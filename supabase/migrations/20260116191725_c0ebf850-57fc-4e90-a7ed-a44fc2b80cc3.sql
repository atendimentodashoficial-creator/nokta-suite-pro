-- Add missing font size columns used by the app
ALTER TABLE public.formularios_templates
ADD COLUMN IF NOT EXISTS fonte_tamanho_perguntas TEXT DEFAULT '16px',
ADD COLUMN IF NOT EXISTS fonte_tamanho_respostas TEXT DEFAULT '14px';