-- Tabela para armazenar configuração do Google Calendar (OAuth tokens)
CREATE TABLE public.google_calendar_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  calendar_id TEXT DEFAULT 'primary',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Tabela para armazenar reuniões agendadas via Google Calendar
CREATE TABLE public.reunioes_agendadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  google_event_id TEXT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_reuniao TIMESTAMP WITH TIME ZONE NOT NULL,
  duracao_minutos INTEGER DEFAULT 30,
  participante_nome TEXT,
  participante_telefone TEXT,
  participante_email TEXT,
  google_meet_link TEXT,
  status TEXT NOT NULL DEFAULT 'agendada',
  compareceu BOOLEAN,
  reuniao_fireflies_id UUID REFERENCES public.reunioes(id),
  agendamento_id UUID REFERENCES public.agendamentos(id),
  lead_id UUID REFERENCES public.leads(id),
  origem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_calendar_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reunioes_agendadas ENABLE ROW LEVEL SECURITY;

-- RLS policies for google_calendar_config
CREATE POLICY "Users can view their own config"
ON public.google_calendar_config FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
ON public.google_calendar_config FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
ON public.google_calendar_config FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own config"
ON public.google_calendar_config FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for reunioes_agendadas
CREATE POLICY "Users can view their own meetings"
ON public.reunioes_agendadas FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meetings"
ON public.reunioes_agendadas FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meetings"
ON public.reunioes_agendadas FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meetings"
ON public.reunioes_agendadas FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_google_calendar_config_updated_at
BEFORE UPDATE ON public.google_calendar_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reunioes_agendadas_updated_at
BEFORE UPDATE ON public.reunioes_agendadas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();