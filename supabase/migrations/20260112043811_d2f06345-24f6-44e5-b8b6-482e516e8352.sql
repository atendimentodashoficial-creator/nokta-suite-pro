-- Add column to track when chat history was cleared (so we don't show old messages from provider)
ALTER TABLE public.whatsapp_chats
ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.whatsapp_chats.history_cleared_at IS 'When set, messages before this timestamp should be ignored (used when chat is recreated after deletion)';