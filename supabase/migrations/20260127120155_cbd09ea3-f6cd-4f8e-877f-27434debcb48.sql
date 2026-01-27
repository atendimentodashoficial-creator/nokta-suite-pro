-- Add archived column to disparos_campanha_contatos for soft-delete
-- This preserves sent/failed contacts history when campaigns are edited

ALTER TABLE public.disparos_campanha_contatos 
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_disparos_campanha_contatos_archived 
ON public.disparos_campanha_contatos(archived);

-- Create composite index for comparison queries (includes archived contacts)
CREATE INDEX IF NOT EXISTS idx_disparos_campanha_contatos_campanha_archived 
ON public.disparos_campanha_contatos(campanha_id, archived);