-- Add field for Instagram username to include in follow request message
ALTER TABLE public.instagram_gatilhos
ADD COLUMN IF NOT EXISTS instagram_seguir text DEFAULT NULL;

COMMENT ON COLUMN public.instagram_gatilhos.instagram_seguir IS 'Username do Instagram (@usuario) para incluir na mensagem de seguir';