-- Adicionar coluna de spread do cartão (margem bancária) em percentual
ALTER TABLE public.facebook_ad_accounts 
ADD COLUMN IF NOT EXISTS currency_spread numeric DEFAULT 0;

COMMENT ON COLUMN public.facebook_ad_accounts.currency_spread IS 'Spread do cartão em percentual (margem bancária) a ser aplicado nas conversões USD→BRL';