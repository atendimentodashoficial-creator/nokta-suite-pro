-- Add thumbnail URL column for ad preview
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS ad_thumbnail_url TEXT;
ALTER TABLE disparos_messages ADD COLUMN IF NOT EXISTS ad_thumbnail_url TEXT;