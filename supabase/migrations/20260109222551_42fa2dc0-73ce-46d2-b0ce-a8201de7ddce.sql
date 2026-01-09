-- Add follower check fields to each trigger instead of global config
ALTER TABLE public.instagram_gatilhos 
ADD COLUMN IF NOT EXISTS verificar_seguidor boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS mensagem_pedir_seguir text DEFAULT NULL;