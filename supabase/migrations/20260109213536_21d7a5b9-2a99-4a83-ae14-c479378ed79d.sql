-- Tabela de configuração do Instagram
CREATE TABLE public.instagram_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  instagram_account_id TEXT,
  webhook_verify_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.instagram_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own Instagram config"
ON public.instagram_config FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram config"
ON public.instagram_config FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Instagram config"
ON public.instagram_config FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Instagram config"
ON public.instagram_config FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_instagram_config_updated_at
BEFORE UPDATE ON public.instagram_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de gatilhos/palavras-chave
CREATE TABLE public.instagram_gatilhos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  palavras_chave TEXT[] NOT NULL DEFAULT '{}',
  tipo TEXT NOT NULL DEFAULT 'dm', -- 'dm' ou 'comentario'
  resposta_texto TEXT,
  fluxo_id UUID,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_gatilhos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own Instagram triggers"
ON public.instagram_gatilhos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram triggers"
ON public.instagram_gatilhos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Instagram triggers"
ON public.instagram_gatilhos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Instagram triggers"
ON public.instagram_gatilhos FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_instagram_gatilhos_updated_at
BEFORE UPDATE ON public.instagram_gatilhos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de fluxos de conversa
CREATE TABLE public.instagram_fluxos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  etapas JSONB NOT NULL DEFAULT '[]',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_fluxos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own Instagram flows"
ON public.instagram_fluxos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram flows"
ON public.instagram_fluxos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Instagram flows"
ON public.instagram_fluxos FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Instagram flows"
ON public.instagram_fluxos FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_instagram_fluxos_updated_at
BEFORE UPDATE ON public.instagram_fluxos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de histórico de mensagens/interações
CREATE TABLE public.instagram_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT,
  tipo TEXT NOT NULL, -- 'dm_recebida', 'dm_enviada', 'comentario_recebido', 'comentario_resposta'
  conteudo TEXT,
  media_url TEXT,
  post_id TEXT,
  gatilho_id UUID REFERENCES public.instagram_gatilhos(id) ON DELETE SET NULL,
  fluxo_id UUID REFERENCES public.instagram_fluxos(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_mensagens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own Instagram messages"
ON public.instagram_mensagens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Instagram messages"
ON public.instagram_mensagens FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_mensagens;