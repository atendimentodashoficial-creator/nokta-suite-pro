-- Add unique constraint on (chat_id, message_id) for proper upsert
ALTER TABLE public.disparos_messages 
ADD CONSTRAINT disparos_messages_chat_id_message_id_key UNIQUE (chat_id, message_id);