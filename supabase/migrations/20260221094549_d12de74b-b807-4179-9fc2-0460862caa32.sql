
-- Add retorno_fatura_id to agendamentos to track return visits
ALTER TABLE public.agendamentos 
ADD COLUMN retorno_fatura_id uuid REFERENCES public.faturas(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_agendamentos_retorno_fatura_id ON public.agendamentos(retorno_fatura_id);
