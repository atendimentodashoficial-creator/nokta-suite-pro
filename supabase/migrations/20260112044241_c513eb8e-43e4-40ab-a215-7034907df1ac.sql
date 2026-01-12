-- Add performance indexes for WhatsApp tables

-- Index for fast chat lookups by user and status
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_user_active 
ON public.whatsapp_chats (user_id, deleted_at) 
WHERE deleted_at IS NULL;

-- Index for fast message lookups by chat
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_timestamp 
ON public.whatsapp_messages (chat_id, timestamp DESC);

-- Index for chat ordering (most recent first)
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_user_last_message 
ON public.whatsapp_chats (user_id, last_message_time DESC NULLS LAST) 
WHERE deleted_at IS NULL;

-- Index for normalized number lookups (used in webhook)
CREATE INDEX IF NOT EXISTS idx_whatsapp_chats_normalized_number 
ON public.whatsapp_chats (user_id, normalized_number) 
WHERE deleted_at IS NULL;

-- Index for tombstone lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_deletions_lookup 
ON public.whatsapp_chat_deletions (user_id, phone_last8);

-- Index for dedup table (cleanup old records faster)
CREATE INDEX IF NOT EXISTS idx_webhook_message_dedup_created 
ON public.webhook_message_dedup (created_at);

-- Cleanup old dedup records (older than 24 hours) to keep table small
DELETE FROM public.webhook_message_dedup 
WHERE created_at < NOW() - INTERVAL '24 hours';

-- Index for kanban lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_kanban_user 
ON public.whatsapp_chat_kanban (user_id, chat_id);