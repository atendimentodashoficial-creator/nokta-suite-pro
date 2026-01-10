-- Add Meta Pixel tracking columns to faturas table
ALTER TABLE public.faturas 
ADD COLUMN IF NOT EXISTS pixel_status TEXT DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS pixel_form_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pixel_data_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pixel_event_sent_at TIMESTAMP WITH TIME ZONE;

-- Comment on columns
COMMENT ON COLUMN public.faturas.pixel_status IS 'Status do envio para Meta Pixel: pendente, formulario_enviado, dados_completos, evento_enviado';
COMMENT ON COLUMN public.faturas.pixel_form_sent_at IS 'Quando o formulário foi enviado para o cliente';
COMMENT ON COLUMN public.faturas.pixel_data_completed_at IS 'Quando o cliente completou o formulário';
COMMENT ON COLUMN public.faturas.pixel_event_sent_at IS 'Quando o evento foi enviado para o Meta Pixel';