-- Criar tabela para log de agendamentos excluídos
-- Isso permite rastrear quantos agendamentos foram excluídos no período
CREATE TABLE public.agendamentos_excluidos_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  procedimento_id UUID NULL,
  procedimento_nome TEXT NULL,
  profissional_id UUID NULL,
  profissional_nome TEXT NULL,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL,
  data_agendamento TIMESTAMP WITH TIME ZONE NOT NULL,
  observacoes TEXT NULL,
  motivo_exclusao TEXT NULL,
  excluido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.agendamentos_excluidos_log ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own deleted appointments logs"
ON public.agendamentos_excluidos_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own deleted appointments logs"
ON public.agendamentos_excluidos_log
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own deleted appointments logs"
ON public.agendamentos_excluidos_log
FOR DELETE
USING (auth.uid() = user_id);

-- Adicionar índice para buscas por período
CREATE INDEX idx_agendamentos_excluidos_log_excluido_em 
ON public.agendamentos_excluidos_log (user_id, excluido_em);

CREATE INDEX idx_agendamentos_excluidos_log_data_agendamento 
ON public.agendamentos_excluidos_log (user_id, data_agendamento);