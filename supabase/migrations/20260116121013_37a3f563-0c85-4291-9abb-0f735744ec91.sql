-- Add slug column to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN slug TEXT UNIQUE;

-- Create index for faster slug lookups
CREATE INDEX idx_formularios_templates_slug ON public.formularios_templates(slug);

-- Function to generate slug from name
CREATE OR REPLACE FUNCTION public.generate_slug(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
  slug TEXT;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  slug := lower(input_text);
  slug := regexp_replace(slug, '[àáâãäå]', 'a', 'gi');
  slug := regexp_replace(slug, '[èéêë]', 'e', 'gi');
  slug := regexp_replace(slug, '[ìíîï]', 'i', 'gi');
  slug := regexp_replace(slug, '[òóôõö]', 'o', 'gi');
  slug := regexp_replace(slug, '[ùúûü]', 'u', 'gi');
  slug := regexp_replace(slug, '[ç]', 'c', 'gi');
  slug := regexp_replace(slug, '[ñ]', 'n', 'gi');
  slug := regexp_replace(slug, '\s+', '-', 'g');
  slug := regexp_replace(slug, '[^a-z0-9\-]', '', 'g');
  slug := regexp_replace(slug, '-+', '-', 'g');
  slug := trim(both '-' from slug);
  RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing templates with auto-generated slugs
UPDATE public.formularios_templates 
SET slug = generate_slug(nome) || '-' || substring(id::text, 1, 4)
WHERE slug IS NULL;