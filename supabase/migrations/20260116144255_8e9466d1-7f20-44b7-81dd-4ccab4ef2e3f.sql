-- Add new customization columns to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS card_color TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter',
ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#1f2937',
ADD COLUMN IF NOT EXISTS button_text_color TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS border_radius TEXT DEFAULT '12';