-- Add media fields to formularios_templates for thank you page
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS pagina_obrigado_video_url TEXT,
ADD COLUMN IF NOT EXISTS pagina_obrigado_imagem_url TEXT;