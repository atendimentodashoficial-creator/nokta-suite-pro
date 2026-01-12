-- Add history_cleared_at column to disparos_chats (same as whatsapp_chats)
ALTER TABLE public.disparos_chats
ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.disparos_chats.history_cleared_at IS 'When set, messages before this timestamp should be ignored (used when chat is recreated after deletion)';

-- Add performance indexes for Disparos tables
CREATE INDEX IF NOT EXISTS idx_disparos_chats_user_active 
ON public.disparos_chats (user_id, deleted_at) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_disparos_messages_chat_timestamp 
ON public.disparos_messages (chat_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_disparos_chats_user_last_message 
ON public.disparos_chats (user_id, last_message_time DESC NULLS LAST) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_disparos_chats_normalized_number 
ON public.disparos_chats (user_id, normalized_number) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_disparos_chats_instancia 
ON public.disparos_chats (user_id, instancia_id) 
WHERE deleted_at IS NULL;