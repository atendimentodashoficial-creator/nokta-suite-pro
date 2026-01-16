-- Add more customization options to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS back_button_color TEXT DEFAULT '#6b7280',
ADD COLUMN IF NOT EXISTS back_button_text_color TEXT DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS answer_text_color TEXT DEFAULT '#1f2937';