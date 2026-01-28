-- Add columns for customizable keyword trigger messages and cooldown tracking
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS keyword_balance_message text DEFAULT '💰 *Saldo Meta Ads*

{saldo_detalhado}',
ADD COLUMN IF NOT EXISTS keyword_report_message text DEFAULT '📊 *Relatório de Campanhas*

Período: {data_inicio} a {data_fim}

🔹 *Gasto:* R$ {gasto}
🔹 *Leads:* {conversas}
🔹 *Custo por Lead:* R$ {custo_conversa}
🔹 *Cliques:* {cliques}
🔹 *Impressões:* {impressoes}',
ADD COLUMN IF NOT EXISTS keyword_last_balance_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS keyword_last_report_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS keyword_cooldown_hours integer DEFAULT 1;