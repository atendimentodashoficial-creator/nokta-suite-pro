-- Enable realtime broadcasts for WhatsApp tables (so /whatsapp updates instantly)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;
