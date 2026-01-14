-- Adicionar coluna de tipo de moeda (BRL ou USD) na tabela facebook_ad_accounts
ALTER TABLE public.facebook_ad_accounts 
ADD COLUMN IF NOT EXISTS currency_type text DEFAULT 'BRL';

-- Comentário explicativo
COMMENT ON COLUMN public.facebook_ad_accounts.currency_type IS 'Tipo de moeda da conta: BRL (Real) ou USD (Dólar)';