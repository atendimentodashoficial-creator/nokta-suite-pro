-- Add column to store manual funds balance for postpaid accounts
ALTER TABLE public.facebook_ad_accounts 
ADD COLUMN IF NOT EXISTS manual_funds_balance numeric DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN public.facebook_ad_accounts.manual_funds_balance IS 'Manual input of available funds (Fundos) for postpaid accounts where API cannot fetch this value. Value in the account original currency (USD or BRL).';
