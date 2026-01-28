-- Add procedimento_id column to avisos_reuniao table
-- When null, the notification applies to all meetings
-- When set, the notification only applies to meetings with that specific procedure

ALTER TABLE public.avisos_reuniao
ADD COLUMN procedimento_id UUID REFERENCES public.procedimentos(id) ON DELETE SET NULL;

-- Add index for better performance when filtering by procedure
CREATE INDEX idx_avisos_reuniao_procedimento ON public.avisos_reuniao(procedimento_id);