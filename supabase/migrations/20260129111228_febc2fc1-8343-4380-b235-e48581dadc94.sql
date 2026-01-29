-- Add section_order column to formularios_templates table
-- This will persist the order of sections (titulo, cta, imagens, videos) on the thank you page

ALTER TABLE public.formularios_templates
ADD COLUMN section_order jsonb DEFAULT '["titulo", "cta", "imagens", "videos"]'::jsonb;