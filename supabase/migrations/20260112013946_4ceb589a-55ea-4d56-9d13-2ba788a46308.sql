-- Adicionar coluna data_fatura para registrar a data da consulta/fatura
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS data_fatura date DEFAULT CURRENT_DATE;