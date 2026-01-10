-- Add form base URL field to instagram_config
ALTER TABLE public.instagram_config ADD COLUMN IF NOT EXISTS form_base_url text;