-- Tighten public INSERT policy for form responses (prevent spoofing user_id)
DROP POLICY IF EXISTS "Anyone can submit form responses" ON public.instagram_formularios_respostas;

CREATE POLICY "Anyone can submit form responses"
ON public.instagram_formularios_respostas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.instagram_formularios f
    WHERE f.id = instagram_formularios_respostas.formulario_id
      AND COALESCE(f.ativo, true) = true
      AND f.user_id = instagram_formularios_respostas.user_id
  )
);