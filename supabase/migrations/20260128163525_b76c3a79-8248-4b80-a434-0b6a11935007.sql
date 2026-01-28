-- Add custom message columns to admin_client_notifications
ALTER TABLE public.admin_client_notifications 
ADD COLUMN IF NOT EXISTS low_balance_message text DEFAULT 'Atenção! O saldo da sua conta de anúncios está baixo (R$ {saldo}). Recomendamos adicionar mais créditos para manter suas campanhas ativas.',
ADD COLUMN IF NOT EXISTS campaign_report_message text DEFAULT 'Relatório de Campanha\n\nCampanha: {nome_campanha}\nEnviados: {enviados}\nFalhas: {falhas}\nStatus: {status}';