-- Add quoted message columns to whatsapp_messages
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS quoted_message_id text,
ADD COLUMN IF NOT EXISTS quoted_content text,
ADD COLUMN IF NOT EXISTS quoted_sender_type text;

-- Add quoted message columns to disparos_messages
ALTER TABLE public.disparos_messages 
ADD COLUMN IF NOT EXISTS quoted_message_id text,
ADD COLUMN IF NOT EXISTS quoted_content text,
ADD COLUMN IF NOT EXISTS quoted_sender_type text;