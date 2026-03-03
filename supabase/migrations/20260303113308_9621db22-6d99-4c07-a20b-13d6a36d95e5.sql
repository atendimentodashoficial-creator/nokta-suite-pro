
-- Create table for partial payments
CREATE TABLE public.fatura_pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fatura_id UUID NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  valor NUMERIC NOT NULL,
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_proximo_pagamento DATE,
  comprovante_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fatura_pagamentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own payments"
ON public.fatura_pagamentos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own payments"
ON public.fatura_pagamentos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payments"
ON public.fatura_pagamentos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payments"
ON public.fatura_pagamentos FOR DELETE
USING (auth.uid() = user_id);

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('comprovantes', 'comprovantes', true);

CREATE POLICY "Users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'comprovantes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Receipts are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprovantes');

CREATE POLICY "Users can delete their receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'comprovantes' AND auth.uid()::text = (storage.foldername(name))[1]);
