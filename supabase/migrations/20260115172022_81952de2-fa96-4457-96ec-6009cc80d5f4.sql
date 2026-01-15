-- Create table to store campaign report snapshots when campaigns are edited
CREATE TABLE public.disparos_campanha_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  nome_versao TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disparos_campanha_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own snapshots"
  ON public.disparos_campanha_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own snapshots"
  ON public.disparos_campanha_snapshots
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own snapshots"
  ON public.disparos_campanha_snapshots
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_disparos_campanha_snapshots_campanha_id 
  ON public.disparos_campanha_snapshots(campanha_id);

CREATE INDEX idx_disparos_campanha_snapshots_user_id 
  ON public.disparos_campanha_snapshots(user_id);