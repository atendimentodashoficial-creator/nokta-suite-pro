-- Add follower check configuration to instagram_config
ALTER TABLE public.instagram_config 
ADD COLUMN IF NOT EXISTS verificar_seguidor boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS mensagem_pedir_seguir text DEFAULT NULL;