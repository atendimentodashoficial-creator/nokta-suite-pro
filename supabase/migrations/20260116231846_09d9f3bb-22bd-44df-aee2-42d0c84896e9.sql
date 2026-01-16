-- Add font size and color for step description
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS fonte_tamanho_descricao_etapa TEXT DEFAULT '14px';

ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS cor_descricao_etapa TEXT DEFAULT '#6b7280';

-- Add color for step indicator (1/3, 2/3, etc.)
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS cor_indicador_etapa TEXT DEFAULT '#6b7280';