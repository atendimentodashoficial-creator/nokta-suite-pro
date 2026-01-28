-- Add destination fields to admin_client_notifications
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS destination_type text DEFAULT 'number',
ADD COLUMN IF NOT EXISTS destination_value text;

-- Create admin notification instances table (instances owned by admin for sending)
CREATE TABLE IF NOT EXISTS public.admin_notification_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  base_url text NOT NULL,
  api_key text NOT NULL,
  instance_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_notification_instances ENABLE ROW LEVEL SECURITY;

-- Remove old instancia_id foreign key constraint if exists and drop column
ALTER TABLE public.admin_client_notifications DROP COLUMN IF EXISTS instancia_id;

-- Add new admin_instancia_id column
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS admin_instancia_id uuid REFERENCES public.admin_notification_instances(id);