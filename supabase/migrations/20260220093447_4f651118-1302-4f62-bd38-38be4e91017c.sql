
-- Add column for auto-move on meeting scheduled
ALTER TABLE public.disparos_kanban_config
  ADD COLUMN IF NOT EXISTS auto_move_reuniao_column_id uuid NULL REFERENCES public.disparos_kanban_columns(id) ON DELETE SET NULL;
