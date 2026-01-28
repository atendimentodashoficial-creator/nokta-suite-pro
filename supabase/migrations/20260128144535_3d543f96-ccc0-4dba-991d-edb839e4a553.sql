-- Add tipo_gatilho column to avisos_reuniao (default 'dias_antes' for existing rows)
ALTER TABLE public.avisos_reuniao 
ADD COLUMN IF NOT EXISTS tipo_gatilho text NOT NULL DEFAULT 'dias_antes';

-- Add tracking column for rescheduling notifications in reunioes
ALTER TABLE public.reunioes 
ADD COLUMN IF NOT EXISTS ultimo_reagendamento_avisado integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.avisos_reuniao.tipo_gatilho IS 'Tipo de gatilho: dias_antes (padrão) ou reagendamento';
COMMENT ON COLUMN public.reunioes.ultimo_reagendamento_avisado IS 'Controle de reagendamentos já notificados';