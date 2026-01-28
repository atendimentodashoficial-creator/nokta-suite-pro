-- Add procedimento_id column to avisos_agendamento table
-- When null, the notification applies to all procedures
-- When set, the notification only applies to that specific procedure

ALTER TABLE public.avisos_agendamento
ADD COLUMN procedimento_id UUID REFERENCES public.procedimentos(id) ON DELETE SET NULL;

-- Add index for better performance when filtering by procedure
CREATE INDEX idx_avisos_agendamento_procedimento ON public.avisos_agendamento(procedimento_id);