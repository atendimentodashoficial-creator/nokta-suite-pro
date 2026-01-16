-- Add button font size column for thank you page
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS fonte_tamanho_obrigado_botao TEXT DEFAULT '16px';