-- Add ad thumbnail to leads so campaign previews match WhatsApp
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS ad_thumbnail_url text;