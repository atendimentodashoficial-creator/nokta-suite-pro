-- Adicionar campos de palavras-chave para gatilhos automáticos
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS keyword_balance text DEFAULT 'saldo',
ADD COLUMN IF NOT EXISTS keyword_report text DEFAULT 'relatorio',
ADD COLUMN IF NOT EXISTS keyword_enabled boolean DEFAULT false;