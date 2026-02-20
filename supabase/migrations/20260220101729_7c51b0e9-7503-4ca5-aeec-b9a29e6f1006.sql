
-- Tabela principal das listas importadas
CREATE TABLE public.listas_importadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  total_contatos INTEGER DEFAULT 0,
  colunas_mapeamento JSONB, -- salva o mapeamento usado para referência
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de contatos de cada lista importada
CREATE TABLE public.lista_importada_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lista_id UUID NOT NULL REFERENCES public.listas_importadas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  nome TEXT,
  telefone TEXT NOT NULL,
  email TEXT,
  cidade TEXT,
  dados_extras JSONB, -- quaisquer outros campos importados
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_lista_importada_contatos_lista_id ON public.lista_importada_contatos(lista_id);
CREATE INDEX idx_lista_importada_contatos_user_id ON public.lista_importada_contatos(user_id);
CREATE INDEX idx_lista_importada_contatos_telefone ON public.lista_importada_contatos(telefone);
CREATE INDEX idx_listas_importadas_user_id ON public.listas_importadas(user_id);

-- RLS
ALTER TABLE public.listas_importadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lista_importada_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own listas_importadas"
  ON public.listas_importadas
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own lista_importada_contatos"
  ON public.lista_importada_contatos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_listas_importadas_updated_at
  BEFORE UPDATE ON public.listas_importadas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
