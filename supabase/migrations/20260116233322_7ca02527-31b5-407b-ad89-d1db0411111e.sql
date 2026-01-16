-- Add column for page indicator font size
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS fonte_tamanho_indicador_etapa text DEFAULT '14px';