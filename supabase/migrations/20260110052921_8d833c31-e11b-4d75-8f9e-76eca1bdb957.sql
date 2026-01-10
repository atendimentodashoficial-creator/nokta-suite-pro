-- Add titulo_botoes column for customizing the button title
ALTER TABLE public.instagram_gatilhos
ADD COLUMN IF NOT EXISTS titulo_botoes text;