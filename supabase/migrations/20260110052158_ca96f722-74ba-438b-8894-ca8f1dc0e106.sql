-- Add botao_formulario_texto column for the button text
ALTER TABLE public.instagram_gatilhos
ADD COLUMN IF NOT EXISTS botao_formulario_texto text DEFAULT 'Preencher Formulário';