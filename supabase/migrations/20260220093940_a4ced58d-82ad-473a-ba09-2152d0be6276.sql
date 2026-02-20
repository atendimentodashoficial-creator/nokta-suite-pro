ALTER TABLE public.avisos_reuniao
  ADD COLUMN IF NOT EXISTS instancia_id uuid NULL REFERENCES public.disparos_instancias(id) ON DELETE SET NULL;