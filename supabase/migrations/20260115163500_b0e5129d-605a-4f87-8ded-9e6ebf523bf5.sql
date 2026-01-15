-- Tabela para exclusões mensais de despesas recorrentes
CREATE TABLE public.despesas_exclusoes_mensais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  despesa_id UUID NOT NULL REFERENCES public.despesas(id) ON DELETE CASCADE,
  mes DATE NOT NULL, -- Primeiro dia do mês excluído (ex: 2025-01-01)
  motivo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Constraint para evitar duplicatas
ALTER TABLE public.despesas_exclusoes_mensais 
ADD CONSTRAINT despesas_exclusoes_mensais_unique UNIQUE (despesa_id, mes);

-- Enable Row Level Security
ALTER TABLE public.despesas_exclusoes_mensais ENABLE ROW LEVEL SECURITY;

-- Create policies based on despesa ownership
CREATE POLICY "Users can view exclusions of their expenses"
ON public.despesas_exclusoes_mensais
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.despesas
    WHERE despesas.id = despesas_exclusoes_mensais.despesa_id
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create exclusions for their expenses"
ON public.despesas_exclusoes_mensais
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.despesas
    WHERE despesas.id = despesas_exclusoes_mensais.despesa_id
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete exclusions of their expenses"
ON public.despesas_exclusoes_mensais
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.despesas
    WHERE despesas.id = despesas_exclusoes_mensais.despesa_id
    AND despesas.user_id = auth.uid()
  )
);

-- Create indexes
CREATE INDEX idx_despesas_exclusoes_despesa_id ON public.despesas_exclusoes_mensais(despesa_id);
CREATE INDEX idx_despesas_exclusoes_mes ON public.despesas_exclusoes_mensais(mes);