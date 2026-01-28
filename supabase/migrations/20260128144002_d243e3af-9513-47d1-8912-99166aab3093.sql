-- Add tipo_gatilho column to avisos_agendamento
-- 'dias_antes' = current behavior (X days before appointment)
-- 'reagendamento' = triggered when appointment is rescheduled

ALTER TABLE public.avisos_agendamento 
ADD COLUMN tipo_gatilho text NOT NULL DEFAULT 'dias_antes';

-- Add check constraint for valid values
ALTER TABLE public.avisos_agendamento 
ADD CONSTRAINT avisos_agendamento_tipo_gatilho_check 
CHECK (tipo_gatilho IN ('dias_antes', 'reagendamento'));

-- Add index for faster filtering
CREATE INDEX idx_avisos_agendamento_tipo_gatilho ON public.avisos_agendamento(tipo_gatilho);

-- Add a column to track which agendamentos already received reagendamento avisos
-- This prevents sending multiple times for the same reschedule
ALTER TABLE public.agendamentos 
ADD COLUMN ultimo_reagendamento_avisado integer DEFAULT 0;

COMMENT ON COLUMN public.avisos_agendamento.tipo_gatilho IS 'Type of trigger: dias_antes (days before) or reagendamento (on reschedule)';
COMMENT ON COLUMN public.agendamentos.ultimo_reagendamento_avisado IS 'Last numero_reagendamentos value for which aviso was sent';