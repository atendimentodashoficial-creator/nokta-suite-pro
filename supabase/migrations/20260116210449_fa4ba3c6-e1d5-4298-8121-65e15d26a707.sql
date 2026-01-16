-- Add DELETE policy for formularios_sessoes table
CREATE POLICY "Users can delete their own sessions" 
ON public.formularios_sessoes 
FOR DELETE 
USING (auth.uid() = user_id);