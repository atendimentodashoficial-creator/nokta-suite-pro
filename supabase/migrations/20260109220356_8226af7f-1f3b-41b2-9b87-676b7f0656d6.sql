-- Adicionar campos para mídia e botões nos gatilhos
ALTER TABLE public.instagram_gatilhos
ADD COLUMN IF NOT EXISTS resposta_midia_url TEXT,
ADD COLUMN IF NOT EXISTS resposta_midia_tipo TEXT CHECK (resposta_midia_tipo IN ('image', 'video', 'audio', 'file')),
ADD COLUMN IF NOT EXISTS resposta_botoes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS resposta_link_url TEXT,
ADD COLUMN IF NOT EXISTS resposta_link_texto TEXT;

-- Expandir tabela de fluxos para suportar etapas visuais
ALTER TABLE public.instagram_fluxos
ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS edges JSONB DEFAULT '[]'::jsonb;

-- Criar bucket de storage para mídia do Instagram
INSERT INTO storage.buckets (id, name, public)
VALUES ('instagram-media', 'instagram-media', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para o bucket de mídia
CREATE POLICY "Users can upload instagram media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'instagram-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their instagram media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'instagram-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their instagram media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'instagram-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public can view instagram media"
ON storage.objects FOR SELECT
USING (bucket_id = 'instagram-media');