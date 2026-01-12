-- Create tombstones table for disparos (same pattern as whatsapp)
CREATE TABLE IF NOT EXISTS public.disparos_chat_deletions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_last8 TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instancia_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_last8, instancia_id)
);

-- Enable RLS
ALTER TABLE public.disparos_chat_deletions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own deletions" 
ON public.disparos_chat_deletions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deletions" 
ON public.disparos_chat_deletions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deletions" 
ON public.disparos_chat_deletions FOR DELETE 
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_disparos_chat_deletions_lookup 
ON public.disparos_chat_deletions (user_id, phone_last8, instancia_id);