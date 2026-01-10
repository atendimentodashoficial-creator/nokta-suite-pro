-- Add column to track if lead has responded
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS respondeu boolean DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_respondeu ON public.leads (respondeu) WHERE respondeu = true;

-- Add comment explaining the column
COMMENT ON COLUMN public.leads.respondeu IS 'Indica se o lead respondeu alguma mensagem (true) ou apenas recebeu (false)';