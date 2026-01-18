-- Add column to track disabled instances per campaign
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS disabled_instancias_ids uuid[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.disparos_campanhas.disabled_instancias_ids IS 'Instances that were automatically disabled due to connection issues during campaign execution';