
-- Tabela de campos personalizados do sistema para listas de contatos
CREATE TABLE public.lista_campos_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  chave TEXT NOT NULL, -- slug usado como key no mapeamento
  tipo TEXT NOT NULL DEFAULT 'texto', -- texto, numero, email, link, telefone, data, cpf, cep, select
  opcoes JSONB, -- para tipo "select": lista de opções
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, chave)
);

-- RLS
ALTER TABLE public.lista_campos_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own fields"
  ON public.lista_campos_sistema
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Índices
CREATE INDEX idx_lista_campos_sistema_user_id ON public.lista_campos_sistema(user_id);

-- Trigger para updated_at
CREATE TRIGGER update_lista_campos_sistema_updated_at
  BEFORE UPDATE ON public.lista_campos_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
