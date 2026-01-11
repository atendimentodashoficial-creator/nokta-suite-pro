-- Add DELETE policy for faturas deletion logs
CREATE POLICY "Users can delete their own deleted invoices logs"
ON public.faturas_excluidas_log
FOR DELETE
USING (auth.uid() = user_id);