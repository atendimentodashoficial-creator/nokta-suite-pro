-- Add column to track when the next contact can be sent
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMP WITH TIME ZONE;

-- Add index for efficient querying of campaigns ready to send
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_next_send_at 
ON public.disparos_campanhas (next_send_at) 
WHERE status = 'running';