-- Add columns to allow triggers to work on both DM and comments
ALTER TABLE public.instagram_gatilhos 
ADD COLUMN IF NOT EXISTS ativo_em_dm boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ativo_em_comentario boolean DEFAULT false;

-- Set default values based on existing tipo
UPDATE public.instagram_gatilhos 
SET ativo_em_dm = true 
WHERE tipo = 'dm';

UPDATE public.instagram_gatilhos 
SET ativo_em_comentario = true 
WHERE tipo = 'comentario';

-- For primeira_interacao, keep as DM only
UPDATE public.instagram_gatilhos 
SET ativo_em_dm = true 
WHERE tipo = 'primeira_interacao';