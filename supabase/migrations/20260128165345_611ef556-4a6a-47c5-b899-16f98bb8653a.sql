-- Add campaign_report_period column to admin_client_notifications
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS campaign_report_period text DEFAULT '7';