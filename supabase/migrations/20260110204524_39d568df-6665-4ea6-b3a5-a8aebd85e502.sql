-- Add custom form message field to meta_pixel_config
ALTER TABLE public.meta_pixel_config 
ADD COLUMN IF NOT EXISTS mensagem_formulario TEXT DEFAULT 'Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:';