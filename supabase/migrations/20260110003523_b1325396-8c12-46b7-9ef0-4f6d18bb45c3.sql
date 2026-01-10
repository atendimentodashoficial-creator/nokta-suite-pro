-- Add fields for success button customization
ALTER TABLE public.instagram_formularios
ADD COLUMN IF NOT EXISTS botao_sucesso_texto text,
ADD COLUMN IF NOT EXISTS botao_sucesso_url text;