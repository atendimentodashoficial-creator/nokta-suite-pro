-- Tabela para configurações globais do admin (instância de avisos por cliente)
CREATE TABLE public.admin_client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instancia_id uuid REFERENCES public.disparos_instancias(id) ON DELETE SET NULL,
  low_balance_enabled boolean DEFAULT true,
  low_balance_threshold numeric DEFAULT 100,
  campaign_reports_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.admin_client_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: apenas admins podem ver/editar (via edge function com service role)
-- Não criamos policy direta pois será acessada apenas via edge function com service role

-- Trigger para atualizar updated_at
CREATE TRIGGER update_admin_client_notifications_updated_at
BEFORE UPDATE ON public.admin_client_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentário explicativo
COMMENT ON TABLE public.admin_client_notifications IS 'Configurações de notificações por cliente (instância WhatsApp para avisos de saldo e relatórios de campanha)';