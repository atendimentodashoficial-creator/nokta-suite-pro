-- Enable realtime for Disparos chats/messages tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_messages;