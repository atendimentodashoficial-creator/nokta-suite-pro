-- Add UTM and attribution fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS utm_source text,
ADD COLUMN IF NOT EXISTS utm_medium text,
ADD COLUMN IF NOT EXISTS utm_campaign text,
ADD COLUMN IF NOT EXISTS utm_content text,
ADD COLUMN IF NOT EXISTS utm_term text,
ADD COLUMN IF NOT EXISTS fbclid text,
ADD COLUMN IF NOT EXISTS gclid text;

-- Create meta_pixel_config table for storing Pixel configuration
CREATE TABLE IF NOT EXISTS public.meta_pixel_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pixel_id text NOT NULL,
  access_token text NOT NULL,
  test_event_code text,
  eventos_ativos jsonb DEFAULT '{"lead": true, "initiate_checkout": true, "purchase": true, "complete_registration": true}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meta_pixel_config_user_id_unique UNIQUE (user_id)
);

-- Create meta_conversion_events table for logging sent events
CREATE TABLE IF NOT EXISTS public.meta_conversion_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  fatura_id uuid REFERENCES public.faturas(id) ON DELETE SET NULL,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_id text NOT NULL,
  event_time timestamp with time zone NOT NULL DEFAULT now(),
  value numeric,
  currency text DEFAULT 'BRL',
  utm_source text,
  utm_campaign text,
  fbclid text,
  status text DEFAULT 'pending',
  response jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meta_pixel_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for meta_pixel_config
CREATE POLICY "Users can view their own pixel config"
ON public.meta_pixel_config FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pixel config"
ON public.meta_pixel_config FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pixel config"
ON public.meta_pixel_config FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pixel config"
ON public.meta_pixel_config FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for meta_conversion_events
CREATE POLICY "Users can view their own conversion events"
ON public.meta_conversion_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversion events"
ON public.meta_conversion_events FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON public.leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_fbclid ON public.leads(fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_lead_id ON public.meta_conversion_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_user_id ON public.meta_conversion_events(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_meta_pixel_config_updated_at
BEFORE UPDATE ON public.meta_pixel_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();