-- Create table for meeting notifications/reminders
CREATE TABLE public.avisos_reuniao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dias_antes INTEGER NOT NULL DEFAULT 1,
  horario_envio TEXT NOT NULL DEFAULT '09:00',
  intervalo_min INTEGER NOT NULL DEFAULT 15,
  intervalo_max INTEGER NOT NULL DEFAULT 33,
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- Flag to indicate if this is an "immediate" notification (sent right after scheduling)
  envio_imediato BOOLEAN NOT NULL DEFAULT false,
  last_check_at TIMESTAMP WITH TIME ZONE,
  next_check_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.avisos_reuniao ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own meeting notifications"
ON public.avisos_reuniao FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meeting notifications"
ON public.avisos_reuniao FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meeting notifications"
ON public.avisos_reuniao FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meeting notifications"
ON public.avisos_reuniao FOR DELETE
USING (auth.uid() = user_id);

-- Create log table for meeting notification history
CREATE TABLE public.avisos_reuniao_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  aviso_id UUID REFERENCES public.avisos_reuniao(id) ON DELETE SET NULL,
  aviso_nome TEXT NOT NULL,
  reuniao_id UUID REFERENCES public.reunioes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  mensagem_enviada TEXT NOT NULL,
  dias_antes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro TEXT,
  enviado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.avisos_reuniao_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for log
CREATE POLICY "Users can view their own meeting notification logs"
ON public.avisos_reuniao_log FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meeting notification logs"
ON public.avisos_reuniao_log FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add columns to reunioes table for tracking sent notifications
ALTER TABLE public.reunioes 
ADD COLUMN IF NOT EXISTS aviso_dia BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aviso_dia_anterior BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aviso_3dias BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.leads(id),
ADD COLUMN IF NOT EXISTS cliente_telefone TEXT;

-- Create trigger for updated_at
CREATE TRIGGER update_avisos_reuniao_updated_at
BEFORE UPDATE ON public.avisos_reuniao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();