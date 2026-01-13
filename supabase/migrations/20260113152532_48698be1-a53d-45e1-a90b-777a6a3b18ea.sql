-- Add ordem column to produtos table
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;