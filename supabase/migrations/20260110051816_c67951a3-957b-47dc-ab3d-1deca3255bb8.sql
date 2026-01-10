-- Add mensagem_formulario column to instagram_gatilhos
ALTER TABLE public.instagram_gatilhos
ADD COLUMN IF NOT EXISTS mensagem_formulario text;