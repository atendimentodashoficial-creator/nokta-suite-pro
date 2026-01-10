-- Create table to store user OpenAI API keys
CREATE TABLE IF NOT EXISTS public.openai_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.openai_config ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own OpenAI config"
ON public.openai_config
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OpenAI config"
ON public.openai_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OpenAI config"
ON public.openai_config
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OpenAI config"
ON public.openai_config
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_openai_config_user_id ON public.openai_config(user_id);