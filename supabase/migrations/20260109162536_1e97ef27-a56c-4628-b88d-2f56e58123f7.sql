-- Add unique constraint on message_id for whatsapp_messages table
-- This is needed for upsert operations to work properly with onConflict: 'message_id'
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_message_id_unique ON public.whatsapp_messages (message_id);

-- Also add unique constraint on (chat_id, message_id) for extra safety
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_chat_message_unique ON public.whatsapp_messages (chat_id, message_id);