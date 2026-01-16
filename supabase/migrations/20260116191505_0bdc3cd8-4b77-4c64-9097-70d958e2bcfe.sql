-- Add missing columns to formularios_templates table
ALTER TABLE public.formularios_templates
ADD COLUMN IF NOT EXISTS fonte_tamanho_botoes TEXT DEFAULT '16px';