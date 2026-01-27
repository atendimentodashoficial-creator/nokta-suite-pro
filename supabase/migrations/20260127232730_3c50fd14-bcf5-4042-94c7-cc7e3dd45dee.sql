-- Tabela para armazenar os campos do template
CREATE TABLE public.reuniao_template_campos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para armazenar os valores preenchidos por reunião (versionamento)
-- Guarda uma cópia do nome do campo no momento do preenchimento
CREATE TABLE public.reuniao_campos_preenchidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id UUID NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  campo_nome TEXT NOT NULL,
  campo_descricao TEXT,
  valor TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_reuniao_template_campos_user_id ON public.reuniao_template_campos(user_id);
CREATE INDEX idx_reuniao_template_campos_ordem ON public.reuniao_template_campos(user_id, ordem);
CREATE INDEX idx_reuniao_campos_preenchidos_reuniao ON public.reuniao_campos_preenchidos(reuniao_id);

-- Enable RLS
ALTER TABLE public.reuniao_template_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reuniao_campos_preenchidos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para template_campos
CREATE POLICY "Users can view own template campos"
ON public.reuniao_template_campos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own template campos"
ON public.reuniao_template_campos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own template campos"
ON public.reuniao_template_campos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own template campos"
ON public.reuniao_template_campos FOR DELETE
USING (auth.uid() = user_id);

-- Políticas RLS para campos_preenchidos (via reunião)
CREATE POLICY "Users can view campos of own reunioes"
ON public.reuniao_campos_preenchidos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reunioes r 
    WHERE r.id = reuniao_id AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert campos for own reunioes"
ON public.reuniao_campos_preenchidos FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reunioes r 
    WHERE r.id = reuniao_id AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete campos of own reunioes"
ON public.reuniao_campos_preenchidos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reunioes r 
    WHERE r.id = reuniao_id AND r.user_id = auth.uid()
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_reuniao_template_campos_updated_at
BEFORE UPDATE ON public.reuniao_template_campos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();