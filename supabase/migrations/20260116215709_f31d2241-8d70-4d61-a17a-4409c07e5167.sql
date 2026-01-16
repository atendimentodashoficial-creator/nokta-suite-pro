-- Add WhatsApp notification fields to formularios_templates
ALTER TABLE public.formularios_templates 
ADD COLUMN whatsapp_instancia_id uuid REFERENCES public.disparos_instancias(id) ON DELETE SET NULL,
ADD COLUMN whatsapp_mensagem_sucesso text,
ADD COLUMN whatsapp_notificacao_ativa boolean DEFAULT false;