-- Create reunioes table for storing meeting data from Fireflies
CREATE TABLE public.reunioes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fireflies_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  data_reuniao TIMESTAMP WITH TIME ZONE NOT NULL,
  duracao_minutos INTEGER,
  participantes TEXT[],
  transcricao TEXT,
  resumo_ia TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, fireflies_id)
);

-- Enable Row Level Security
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own reunioes" 
ON public.reunioes 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reunioes" 
ON public.reunioes 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reunioes" 
ON public.reunioes 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reunioes" 
ON public.reunioes 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_reunioes_updated_at
BEFORE UPDATE ON public.reunioes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();