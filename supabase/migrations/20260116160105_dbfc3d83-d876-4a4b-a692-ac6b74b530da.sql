-- Add new fields for thank you page customization
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS pagina_obrigado_video_titulo TEXT,
ADD COLUMN IF NOT EXISTS pagina_obrigado_video_subtitulo TEXT,
ADD COLUMN IF NOT EXISTS pagina_obrigado_video_posicao TEXT DEFAULT 'abaixo';