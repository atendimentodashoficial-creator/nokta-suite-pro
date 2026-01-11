-- Add fb_adset_id column to leads table for unique adset identification
ALTER TABLE public.leads
ADD COLUMN fb_adset_id TEXT;

-- Add index for faster lookups by adset_id
CREATE INDEX idx_leads_fb_adset_id ON public.leads(fb_adset_id);

-- Add comment for documentation
COMMENT ON COLUMN public.leads.fb_adset_id IS 'Unique Facebook Ad Set ID for attribution tracking';