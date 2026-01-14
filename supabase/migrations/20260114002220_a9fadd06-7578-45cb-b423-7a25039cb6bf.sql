-- Add columns for installment expenses (despesa parcelada)
ALTER TABLE public.despesas
ADD COLUMN parcelada boolean DEFAULT false,
ADD COLUMN numero_parcelas integer DEFAULT null,
ADD COLUMN parcela_atual integer DEFAULT null,
ADD COLUMN data_inicio date DEFAULT null,
ADD COLUMN data_fim date DEFAULT null;