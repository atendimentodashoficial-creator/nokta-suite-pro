-- Criar tabela para controle de acesso às features por usuário
CREATE TABLE public.user_feature_access (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, feature_key)
);

-- Enable RLS
ALTER TABLE public.user_feature_access ENABLE ROW LEVEL SECURITY;

-- Política para admin (via edge function com service role) - admin pode gerenciar tudo
-- Usuários podem ler suas próprias permissões
CREATE POLICY "Users can view their own feature access"
ON public.user_feature_access
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_user_feature_access_updated_at
BEFORE UPDATE ON public.user_feature_access
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();