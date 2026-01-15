-- Tabela para histórico de ajustes de valor de despesas recorrentes
CREATE TABLE public.despesas_ajustes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  despesa_id UUID NOT NULL REFERENCES public.despesas(id) ON DELETE CASCADE,
  valor_anterior NUMERIC NOT NULL,
  valor_novo NUMERIC NOT NULL,
  data_ajuste DATE NOT NULL,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.despesas_ajustes ENABLE ROW LEVEL SECURITY;

-- Create policy for user access (based on despesa ownership)
CREATE POLICY "Users can view adjustments of their expenses" 
ON public.despesas_ajustes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesas_ajustes.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create adjustments for their expenses" 
ON public.despesas_ajustes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesas_ajustes.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete adjustments of their expenses" 
ON public.despesas_ajustes 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.despesas 
    WHERE despesas.id = despesas_ajustes.despesa_id 
    AND despesas.user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX idx_despesas_ajustes_despesa_id ON public.despesas_ajustes(despesa_id);
CREATE INDEX idx_despesas_ajustes_data ON public.despesas_ajustes(data_ajuste);