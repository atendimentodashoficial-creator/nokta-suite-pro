-- Adicionar campos client_id e client_secret à tabela google_calendar_config
ALTER TABLE public.google_calendar_config 
ADD COLUMN IF NOT EXISTS client_id TEXT,
ADD COLUMN IF NOT EXISTS client_secret TEXT;

-- Tornar access_token e refresh_token opcionais (já devem ser, mas garantir)
ALTER TABLE public.google_calendar_config 
ALTER COLUMN access_token DROP NOT NULL;