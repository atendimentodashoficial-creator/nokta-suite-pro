-- Tombstones for deleted WhatsApp chats (prevents re-importing old history)
CREATE TABLE IF NOT EXISTS public.whatsapp_chat_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_last8 text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

-- One tombstone per user+phone
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_chat_deletions_user_last8_key'
  ) THEN
    ALTER TABLE public.whatsapp_chat_deletions
      ADD CONSTRAINT whatsapp_chat_deletions_user_last8_key UNIQUE (user_id, phone_last8);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_deletions_user_last8
  ON public.whatsapp_chat_deletions (user_id, phone_last8);

ALTER TABLE public.whatsapp_chat_deletions ENABLE ROW LEVEL SECURITY;

-- RLS: only the owner can manage their tombstones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_chat_deletions'
      AND policyname = 'Users can read their whatsapp chat deletions'
  ) THEN
    CREATE POLICY "Users can read their whatsapp chat deletions"
    ON public.whatsapp_chat_deletions
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_chat_deletions'
      AND policyname = 'Users can insert their whatsapp chat deletions'
  ) THEN
    CREATE POLICY "Users can insert their whatsapp chat deletions"
    ON public.whatsapp_chat_deletions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_chat_deletions'
      AND policyname = 'Users can update their whatsapp chat deletions'
  ) THEN
    CREATE POLICY "Users can update their whatsapp chat deletions"
    ON public.whatsapp_chat_deletions
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_chat_deletions'
      AND policyname = 'Users can delete their whatsapp chat deletions'
  ) THEN
    CREATE POLICY "Users can delete their whatsapp chat deletions"
    ON public.whatsapp_chat_deletions
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;