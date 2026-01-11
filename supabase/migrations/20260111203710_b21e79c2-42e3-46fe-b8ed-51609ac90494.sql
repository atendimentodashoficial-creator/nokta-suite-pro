-- Ensure deleted appointments log is accessible to the owning user
ALTER TABLE public.agendamentos_excluidos_log ENABLE ROW LEVEL SECURITY;

-- Read own deletion logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'agendamentos_excluidos_log'
      AND policyname = 'Users can view their own deleted appointments'
  ) THEN
    CREATE POLICY "Users can view their own deleted appointments"
    ON public.agendamentos_excluidos_log
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Insert own deletion logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public'
      AND tablename = 'agendamentos_excluidos_log'
      AND policyname = 'Users can create their own deleted appointments logs'
  ) THEN
    CREATE POLICY "Users can create their own deleted appointments logs"
    ON public.agendamentos_excluidos_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;