-- Create table to store Fireflies.ai configuration
CREATE TABLE public.fireflies_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.fireflies_config ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own fireflies config" 
ON public.fireflies_config 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fireflies config" 
ON public.fireflies_config 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fireflies config" 
ON public.fireflies_config 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fireflies config" 
ON public.fireflies_config 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_fireflies_config_updated_at
BEFORE UPDATE ON public.fireflies_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();