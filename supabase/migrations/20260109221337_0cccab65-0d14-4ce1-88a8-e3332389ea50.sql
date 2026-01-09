-- Add ice_breakers to instagram_config and first_interaction flag to gatilhos
ALTER TABLE public.instagram_config 
ADD COLUMN IF NOT EXISTS ice_breakers jsonb DEFAULT '[]'::jsonb;

-- Add new trigger type for first interaction
ALTER TABLE public.instagram_gatilhos 
DROP CONSTRAINT IF EXISTS instagram_gatilhos_tipo_check;

-- No need for check constraint, just allow any value

-- Create table to track first interactions (to know if someone already chatted)
CREATE TABLE IF NOT EXISTS public.instagram_interacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  instagram_user_id text NOT NULL,
  primeira_interacao_em timestamp with time zone NOT NULL DEFAULT now(),
  ultima_interacao_em timestamp with time zone NOT NULL DEFAULT now(),
  total_mensagens integer DEFAULT 1,
  UNIQUE(user_id, instagram_user_id)
);

-- Enable RLS
ALTER TABLE public.instagram_interacoes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own interactions"
  ON public.instagram_interacoes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions"
  ON public.instagram_interacoes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interactions"
  ON public.instagram_interacoes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role needs access for webhook
CREATE POLICY "Service role full access"
  ON public.instagram_interacoes
  FOR ALL
  USING (true)
  WITH CHECK (true);