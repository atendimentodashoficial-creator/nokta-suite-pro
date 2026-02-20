
-- Add auto_move_on_first_reply_column_id to store the user's kanban auto-move preference
-- This is stored as a user-level setting in a new config table
CREATE TABLE IF NOT EXISTS public.disparos_kanban_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  auto_move_column_id uuid NULL REFERENCES public.disparos_kanban_columns(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.disparos_kanban_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own kanban config"
  ON public.disparos_kanban_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own kanban config"
  ON public.disparos_kanban_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kanban config"
  ON public.disparos_kanban_config FOR UPDATE
  USING (auth.uid() = user_id);

-- Track which disparo chats have already received a first-reply auto-move
-- We store chat_id + a flag so we never auto-move again after the first reply
ALTER TABLE public.disparos_chat_kanban 
  ADD COLUMN IF NOT EXISTS first_reply_moved boolean NOT NULL DEFAULT false;
