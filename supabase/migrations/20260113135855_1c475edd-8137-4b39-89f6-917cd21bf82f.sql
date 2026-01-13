-- Adicionar campos de horário à tabela de ausências
ALTER TABLE public.ausencias_profissionais 
ADD COLUMN hora_inicio time DEFAULT NULL,
ADD COLUMN hora_fim time DEFAULT NULL;