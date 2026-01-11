-- Create table to log deleted invoices
CREATE TABLE public.faturas_excluidas_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  procedimento_id UUID NULL,
  procedimento_nome TEXT NULL,
  profissional_id UUID NULL,
  profissional_nome TEXT NULL,
  valor NUMERIC NOT NULL,
  status TEXT NOT NULL,
  observacoes TEXT NULL,
  meio_pagamento TEXT NULL,
  forma_pagamento TEXT NULL,
  motivo_exclusao TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  excluido_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faturas_excluidas_log ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own deleted invoices"
ON public.faturas_excluidas_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own deleted invoices logs"
ON public.faturas_excluidas_log
FOR INSERT
WITH CHECK (auth.uid() = user_id);