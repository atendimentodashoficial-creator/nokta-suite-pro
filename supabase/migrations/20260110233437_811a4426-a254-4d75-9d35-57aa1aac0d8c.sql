-- Add column order for funnel table
ALTER TABLE public.metricas_preferencias 
ADD COLUMN IF NOT EXISTS funnel_column_order jsonb DEFAULT NULL;