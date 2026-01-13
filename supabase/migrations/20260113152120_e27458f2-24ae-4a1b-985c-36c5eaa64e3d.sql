-- Add DELETE policy for avisos_enviados_log so users can only delete their own logs
CREATE POLICY "Users can delete their own logs"
ON public.avisos_enviados_log
FOR DELETE
USING (auth.uid() = user_id);