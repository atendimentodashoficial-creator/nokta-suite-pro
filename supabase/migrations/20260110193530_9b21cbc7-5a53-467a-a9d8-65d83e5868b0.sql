-- Add column for the button text that releases content when non-follower clicks
ALTER TABLE public.instagram_gatilhos 
ADD COLUMN IF NOT EXISTS botao_liberar_texto text DEFAULT 'Já sigo! Liberar material';

-- Add comment explaining the column
COMMENT ON COLUMN public.instagram_gatilhos.botao_liberar_texto IS 'Texto do botão que libera o material quando não-seguidor clica após seguir';