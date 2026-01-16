-- Add progress bar background color and card border color to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS progress_background_color TEXT DEFAULT '#e5e5e5',
ADD COLUMN IF NOT EXISTS card_border_color TEXT DEFAULT 'transparent';