-- Add column for image layout direction on thank you page
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS imagens_layout TEXT DEFAULT 'horizontal';