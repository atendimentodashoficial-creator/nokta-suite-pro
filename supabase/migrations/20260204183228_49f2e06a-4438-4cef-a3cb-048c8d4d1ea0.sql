-- Adicionar campos de instância no log de avisos de reunião para auditoria
ALTER TABLE public.avisos_reuniao_log 
ADD COLUMN IF NOT EXISTS instancia_id uuid,
ADD COLUMN IF NOT EXISTS instancia_nome text;