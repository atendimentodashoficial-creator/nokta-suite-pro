-- Ensure forms are active by default and fix existing nulls
UPDATE public.instagram_formularios
SET ativo = true
WHERE ativo IS NULL;

ALTER TABLE public.instagram_formularios
ALTER COLUMN ativo SET DEFAULT true;

-- Recreate public read policy to treat NULL as active (backward compatibility)
DROP POLICY IF EXISTS "Anyone can view active forms" ON public.instagram_formularios;

CREATE POLICY "Anyone can view active forms"
ON public.instagram_formularios
FOR SELECT
USING (COALESCE(ativo, true) = true);