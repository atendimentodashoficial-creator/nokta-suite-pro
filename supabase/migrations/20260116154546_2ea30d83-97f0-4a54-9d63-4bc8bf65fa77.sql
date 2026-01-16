-- Drop the old check constraint and create a new one including all existing types plus multipla_escolha
ALTER TABLE public.formularios_etapas DROP CONSTRAINT IF EXISTS formularios_etapas_tipo_check;

ALTER TABLE public.formularios_etapas ADD CONSTRAINT formularios_etapas_tipo_check 
CHECK (tipo IN ('texto', 'email', 'telefone', 'select', 'radio', 'checkbox', 'textarea', 'numero', 'data', 'multipla_escolha', 'multiplos_campos', 'opcoes'));