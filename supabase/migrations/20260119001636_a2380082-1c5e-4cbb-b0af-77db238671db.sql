-- Add field to track original instance when a chat is migrated
ALTER TABLE public.disparos_chats 
ADD COLUMN IF NOT EXISTS instancia_original_id uuid REFERENCES public.disparos_instancias(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS instancia_original_nome text;