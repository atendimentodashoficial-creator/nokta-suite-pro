-- Add access_token column for Meta Conversions API
ALTER TABLE public.formularios_config 
ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT;