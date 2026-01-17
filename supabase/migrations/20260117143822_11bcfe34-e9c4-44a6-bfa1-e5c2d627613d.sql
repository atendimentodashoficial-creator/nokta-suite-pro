-- Enable realtime for disparos tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_messages;