-- Create table for form configurations
CREATE TABLE public.instagram_formularios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  titulo_pagina TEXT NOT NULL DEFAULT 'Preencha seus dados',
  subtitulo_pagina TEXT,
  texto_botao TEXT NOT NULL DEFAULT 'Enviar',
  mensagem_sucesso TEXT NOT NULL DEFAULT 'Obrigado! Seus dados foram enviados com sucesso.',
  campos JSONB NOT NULL DEFAULT '["nome", "telefone", "email"]'::jsonb,
  cor_primaria TEXT DEFAULT '#8B5CF6',
  imagem_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for form submissions
CREATE TABLE public.instagram_formularios_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  formulario_id UUID NOT NULL REFERENCES public.instagram_formularios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  instagram_user_id TEXT,
  tracking_id TEXT,
  nome TEXT,
  telefone TEXT,
  email TEXT,
  dados_extras JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_formularios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_formularios_respostas ENABLE ROW LEVEL SECURITY;

-- RLS policies for formularios
CREATE POLICY "Users can view their own forms" 
ON public.instagram_formularios 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own forms" 
ON public.instagram_formularios 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own forms" 
ON public.instagram_formularios 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own forms" 
ON public.instagram_formularios 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for respostas
CREATE POLICY "Users can view their form submissions" 
ON public.instagram_formularios_respostas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Anyone can submit form responses" 
ON public.instagram_formularios_respostas 
FOR INSERT 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_instagram_formularios_updated_at
BEFORE UPDATE ON public.instagram_formularios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add formulario_id to gatilhos for easy integration
ALTER TABLE public.instagram_gatilhos 
ADD COLUMN formulario_id UUID REFERENCES public.instagram_formularios(id) ON DELETE SET NULL;