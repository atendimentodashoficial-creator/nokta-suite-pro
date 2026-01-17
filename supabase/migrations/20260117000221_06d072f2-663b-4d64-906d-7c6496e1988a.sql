-- Add pagination font size and color fields
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS fonte_tamanho_paginacao text DEFAULT '14px',
ADD COLUMN IF NOT EXISTS cor_paginacao text DEFAULT '#6b7280';