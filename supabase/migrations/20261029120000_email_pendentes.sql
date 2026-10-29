-- Relatório semanal de fichas pendentes de assinatura por e-mail (Microsoft 365):
-- planilha com todas as pendentes + resumo por estado (há quantos dias, fichas
-- sem itens, situação do link). Envio automático no dia escolhido, 7h, e botão
-- "Enviar agora" em Configurações > E-mail. Mesmo padrão de email_estoque_config. Re-executável.

CREATE TABLE IF NOT EXISTS public.email_pendentes_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  destinatarios text[] NOT NULL DEFAULT '{}',
  copia text[] NOT NULL DEFAULT '{}',
  automatico boolean NOT NULL DEFAULT false,
  -- 0 = domingo ... 6 = sábado (Brasília). Padrão: segunda.
  dia_semana smallint NOT NULL DEFAULT 1 CHECK (dia_semana BETWEEN 0 AND 6),
  -- Estados do relatório (vazio = os que têm ficha pendente).
  ufs text[] NOT NULL DEFAULT '{}',
  ultimo_envio_automatico date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_pendentes_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_email_pendentes_config_updated ON public.email_pendentes_config;
CREATE TRIGGER trg_email_pendentes_config_updated BEFORE UPDATE ON public.email_pendentes_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_pendentes_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_pendentes_config FROM anon;
DROP POLICY IF EXISTS "email_pendentes select" ON public.email_pendentes_config;
CREATE POLICY "email_pendentes select" ON public.email_pendentes_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'view'));
DROP POLICY IF EXISTS "email_pendentes update" ON public.email_pendentes_config;
CREATE POLICY "email_pendentes update" ON public.email_pendentes_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'));
