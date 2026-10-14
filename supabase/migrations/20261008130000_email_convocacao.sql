-- =========================================================
-- Envio da convocação de troca de uniforme por e-mail (Microsoft 365).
--
--  * email_convocacao_config: destinatários e envio automático (uma linha).
--    Ver/editar: quem tem Configurações. (Não fica em app_config porque
--    app_config é legível sem login — a tela pública de assinatura usa.)
--  * config_segredos: autorização da conta do Microsoft 365 (gravada pela tela
--    Configurações > E-mail > "Conectar conta") e o segredo do agendador
--    (deploy/producao/configurar-email.sh). SÓ o servidor (service_role) lê:
--    RLS sem nenhuma policy + sem GRANT.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.email_convocacao_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  destinatarios text[] NOT NULL DEFAULT '{}',
  automatico boolean NOT NULL DEFAULT false,
  -- 0 = domingo ... 6 = sábado (Brasília). Padrão: segunda.
  dia_semana smallint NOT NULL DEFAULT 1 CHECK (dia_semana BETWEEN 0 AND 6),
  -- Estados incluídos no envio automático (vazio = todos).
  ufs text[] NOT NULL DEFAULT '{}',
  ultimo_envio_automatico date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_convocacao_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- Em cópia (Cc) do envio automático (e sugeridos no envio pelo botão).
ALTER TABLE public.email_convocacao_config ADD COLUMN IF NOT EXISTS copia text[] NOT NULL DEFAULT '{}';

DROP TRIGGER IF EXISTS trg_email_convocacao_config_updated ON public.email_convocacao_config;
CREATE TRIGGER trg_email_convocacao_config_updated BEFORE UPDATE ON public.email_convocacao_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_convocacao_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_convocacao_config FROM anon;
DROP POLICY IF EXISTS "email_convocacao select" ON public.email_convocacao_config;
CREATE POLICY "email_convocacao select" ON public.email_convocacao_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'view'));
DROP POLICY IF EXISTS "email_convocacao update" ON public.email_convocacao_config;
CREATE POLICY "email_convocacao update" ON public.email_convocacao_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'));

CREATE TABLE IF NOT EXISTS public.config_segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.config_segredos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_segredos FROM anon, authenticated;
