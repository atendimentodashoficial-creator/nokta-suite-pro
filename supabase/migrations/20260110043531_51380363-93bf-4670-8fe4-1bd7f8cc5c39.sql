-- Add columns to support replying to comments publicly AND via DM
ALTER TABLE public.instagram_gatilhos 
ADD COLUMN IF NOT EXISTS responder_comentario boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS resposta_comentario_texto text;

COMMENT ON COLUMN public.instagram_gatilhos.responder_comentario IS 'Whether to reply publicly to the comment (in addition to DM)';
COMMENT ON COLUMN public.instagram_gatilhos.resposta_comentario_texto IS 'Text to reply publicly on the comment';