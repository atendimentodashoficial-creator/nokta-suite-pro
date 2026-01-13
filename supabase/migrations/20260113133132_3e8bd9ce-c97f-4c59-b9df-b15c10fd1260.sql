-- Add ordem column to procedimento_profissional table for drag-and-drop ordering
ALTER TABLE public.procedimento_profissional
ADD COLUMN ordem integer DEFAULT 0;