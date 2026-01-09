-- Add campaign attribution columns to whatsapp_messages table
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS fbclid TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN public.whatsapp_messages.utm_source IS 'Source of the ad (e.g., facebook, google)';
COMMENT ON COLUMN public.whatsapp_messages.utm_campaign IS 'Campaign name or headline from the ad';
COMMENT ON COLUMN public.whatsapp_messages.utm_content IS 'Ad ID or source ID';
COMMENT ON COLUMN public.whatsapp_messages.utm_term IS 'Body text from the ad';
COMMENT ON COLUMN public.whatsapp_messages.fbclid IS 'Facebook Click ID for attribution';

-- Also add to disparos_messages for consistency
ALTER TABLE public.disparos_messages 
ADD COLUMN IF NOT EXISTS utm_source TEXT,
ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
ADD COLUMN IF NOT EXISTS utm_medium TEXT,
ADD COLUMN IF NOT EXISTS utm_content TEXT,
ADD COLUMN IF NOT EXISTS utm_term TEXT,
ADD COLUMN IF NOT EXISTS fbclid TEXT;