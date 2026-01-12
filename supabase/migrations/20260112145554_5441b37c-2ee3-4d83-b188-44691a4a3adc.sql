-- Add next_send_at column for optimistic locking in campaign processing
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS next_send_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_next_send_at 
ON public.disparos_campanhas(next_send_at) 
WHERE next_send_at IS NOT NULL;