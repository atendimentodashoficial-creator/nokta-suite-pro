-- Add column to store customer data sent in conversion events
ALTER TABLE public.meta_conversion_events 
ADD COLUMN IF NOT EXISTS customer_data_sent jsonb DEFAULT NULL;