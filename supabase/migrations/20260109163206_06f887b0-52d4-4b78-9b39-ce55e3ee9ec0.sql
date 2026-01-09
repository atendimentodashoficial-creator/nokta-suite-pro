-- Fix increment_whatsapp_chat_unread to only update last_message if newer
CREATE OR REPLACE FUNCTION public.increment_whatsapp_chat_unread(
  p_chat_id uuid,
  p_last_message text DEFAULT NULL,
  p_last_message_time timestamp with time zone DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_unread integer;
  v_current_time timestamp with time zone;
BEGIN
  -- Get current last_message_time
  SELECT last_message_time INTO v_current_time
  FROM public.whatsapp_chats
  WHERE id = p_chat_id;

  -- Only update last_message/last_message_time if the incoming message is newer
  IF p_last_message_time IS NOT NULL AND (v_current_time IS NULL OR p_last_message_time > v_current_time) THEN
    UPDATE public.whatsapp_chats
    SET
      unread_count = COALESCE(unread_count, 0) + 1,
      last_message = COALESCE(p_last_message, last_message),
      last_message_time = p_last_message_time,
      updated_at = now()
    WHERE id = p_chat_id
    RETURNING unread_count INTO v_new_unread;
  ELSE
    -- Just increment unread, don't touch last_message
    UPDATE public.whatsapp_chats
    SET
      unread_count = COALESCE(unread_count, 0) + 1,
      updated_at = now()
    WHERE id = p_chat_id
    RETURNING unread_count INTO v_new_unread;
  END IF;

  IF v_new_unread IS NULL THEN
    RAISE EXCEPTION 'Chat não encontrado';
  END IF;

  RETURN v_new_unread;
END;
$$;