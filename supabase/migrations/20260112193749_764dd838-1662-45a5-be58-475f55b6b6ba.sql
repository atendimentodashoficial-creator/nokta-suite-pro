-- Add scheduling columns to avisos_agendamento for reliable scheduling
ALTER TABLE public.avisos_agendamento 
ADD COLUMN IF NOT EXISTS next_check_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_check_at timestamptz DEFAULT NULL;

-- Index for efficient scheduling queries
CREATE INDEX IF NOT EXISTS idx_avisos_agendamento_next_check 
ON public.avisos_agendamento(user_id, ativo, next_check_at) 
WHERE ativo = true;