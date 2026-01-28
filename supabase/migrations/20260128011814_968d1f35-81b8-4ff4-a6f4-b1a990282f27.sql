-- Add columns for Google Calendar integration
ALTER TABLE public.reunioes 
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS meet_link TEXT;

-- Make fireflies_id nullable for Google Calendar meetings
ALTER TABLE public.reunioes 
  ALTER COLUMN fireflies_id DROP NOT NULL;