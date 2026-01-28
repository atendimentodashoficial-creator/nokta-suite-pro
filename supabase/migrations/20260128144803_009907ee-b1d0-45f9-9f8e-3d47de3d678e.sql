-- Add numero_reagendamentos column to reunioes to track how many times meeting was rescheduled
ALTER TABLE public.reunioes 
ADD COLUMN IF NOT EXISTS numero_reagendamentos integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.reunioes.numero_reagendamentos IS 'Número de vezes que a reunião foi reagendada';