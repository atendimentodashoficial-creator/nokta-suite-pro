
CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text DEFAULT 'Sistema em manutenção. Tente novamente mais tarde.',
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_settings" ON public.app_settings FOR SELECT USING (true);

INSERT INTO public.app_settings (id, maintenance_mode) VALUES ('global', false);
