-- Add independent color and style settings for the Thank You page
ALTER TABLE public.formularios_templates
ADD COLUMN IF NOT EXISTS obrigado_background_color text,
ADD COLUMN IF NOT EXISTS obrigado_card_color text,
ADD COLUMN IF NOT EXISTS obrigado_cor_primaria text,
ADD COLUMN IF NOT EXISTS obrigado_button_text_color text,
ADD COLUMN IF NOT EXISTS obrigado_card_border_color text,
ADD COLUMN IF NOT EXISTS obrigado_border_radius text;