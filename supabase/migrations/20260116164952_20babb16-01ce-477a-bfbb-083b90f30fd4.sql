-- Add new columns for form title customization and font sizes
ALTER TABLE public.formularios_templates 
ADD COLUMN IF NOT EXISTS titulo TEXT,
ADD COLUMN IF NOT EXISTS subtitulo TEXT,
ADD COLUMN IF NOT EXISTS titulo_visivel BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS titulo_cor TEXT DEFAULT '#1f2937',
ADD COLUMN IF NOT EXISTS fonte_tamanho_titulo TEXT DEFAULT '24px',
ADD COLUMN IF NOT EXISTS fonte_tamanho_subtitulo TEXT DEFAULT '16px',
ADD COLUMN IF NOT EXISTS fonte_tamanho_campos TEXT DEFAULT '14px',
ADD COLUMN IF NOT EXISTS fonte_tamanho_obrigado_titulo TEXT DEFAULT '28px',
ADD COLUMN IF NOT EXISTS fonte_tamanho_obrigado_texto TEXT DEFAULT '16px';