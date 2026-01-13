-- Add ordem column to procedimentos table
ALTER TABLE public.procedimentos ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- Add ordem column to profissionais table
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- Update existing rows with ordem based on created_at
WITH numbered_procedimentos AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
  FROM public.procedimentos
)
UPDATE public.procedimentos p
SET ordem = np.rn
FROM numbered_procedimentos np
WHERE p.id = np.id;

WITH numbered_profissionais AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
  FROM public.profissionais
)
UPDATE public.profissionais p
SET ordem = np.rn
FROM numbered_profissionais np
WHERE p.id = np.id;