-- Add columns for multiple images and videos with titles/subtitles
ALTER TABLE public.formularios_templates
ADD COLUMN pagina_obrigado_imagens jsonb DEFAULT '[]'::jsonb,
ADD COLUMN pagina_obrigado_videos jsonb DEFAULT '[]'::jsonb;

-- Add title/subtitle for single image (for backward compatibility)
ALTER TABLE public.formularios_templates
ADD COLUMN pagina_obrigado_imagem_titulo text,
ADD COLUMN pagina_obrigado_imagem_subtitulo text;

-- Migrate existing single image to new array format if exists
UPDATE public.formularios_templates
SET pagina_obrigado_imagens = jsonb_build_array(
  jsonb_build_object(
    'url', pagina_obrigado_imagem_url,
    'titulo', '',
    'subtitulo', ''
  )
)
WHERE pagina_obrigado_imagem_url IS NOT NULL AND pagina_obrigado_imagem_url != '';

-- Migrate existing single video to new array format if exists
UPDATE public.formularios_templates
SET pagina_obrigado_videos = jsonb_build_array(
  jsonb_build_object(
    'url', pagina_obrigado_video_url,
    'titulo', COALESCE(pagina_obrigado_video_titulo, ''),
    'subtitulo', COALESCE(pagina_obrigado_video_subtitulo, '')
  )
)
WHERE pagina_obrigado_video_url IS NOT NULL AND pagina_obrigado_video_url != '';