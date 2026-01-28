-- Add fields for scheduled report day/time and low balance cooldown
ALTER TABLE public.admin_client_notifications
ADD COLUMN IF NOT EXISTS report_day_of_week integer DEFAULT 1, -- 0=Domingo, 1=Segunda, etc.
ADD COLUMN IF NOT EXISTS report_time text DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS low_balance_cooldown_hours integer DEFAULT 24,
ADD COLUMN IF NOT EXISTS low_balance_last_sent_at timestamptz;