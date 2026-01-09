-- Enable realtime for WhatsApp chats/messages so the UI receives new messages instantly
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'supabase_realtime publication not found';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'supabase_realtime publication not found';
  END;
END $$;