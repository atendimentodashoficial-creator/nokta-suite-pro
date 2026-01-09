-- Add columns to store the real campaign name and ad_id from Facebook
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS fb_ad_id TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS fb_campaign_name TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS fb_adset_name TEXT;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS fb_ad_name TEXT;

ALTER TABLE disparos_messages ADD COLUMN IF NOT EXISTS fb_ad_id TEXT;
ALTER TABLE disparos_messages ADD COLUMN IF NOT EXISTS fb_campaign_name TEXT;
ALTER TABLE disparos_messages ADD COLUMN IF NOT EXISTS fb_adset_name TEXT;
ALTER TABLE disparos_messages ADD COLUMN IF NOT EXISTS fb_ad_name TEXT;

-- Add same columns to leads table for persistent attribution
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_ad_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_campaign_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_adset_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_ad_name TEXT;