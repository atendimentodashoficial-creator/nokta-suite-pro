-- Add keyword_report_period column for the keyword trigger report period (separate from scheduled campaign report period)
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS keyword_report_period text DEFAULT '7';