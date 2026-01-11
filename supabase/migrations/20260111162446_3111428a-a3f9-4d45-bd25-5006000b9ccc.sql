-- Add fb_campaign_id column to leads table for unique campaign identification
ALTER TABLE public.leads
ADD COLUMN fb_campaign_id TEXT;

-- Add index for faster lookups by campaign_id
CREATE INDEX idx_leads_fb_campaign_id ON public.leads(fb_campaign_id);

-- Add comment for documentation
COMMENT ON COLUMN public.leads.fb_campaign_id IS 'Unique Facebook Campaign ID for attribution tracking';