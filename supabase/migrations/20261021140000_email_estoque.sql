-- Relatório de estoque por e-mail (Microsoft 365): estoque completo por estado
-- em planilha + destaque dos itens sem estoque ou abaixo do mínimo. Envio
-- automático semanal (dia escolhido, 7h) e botão "Enviar agora" na tela
-- Configurações > E-mail. Mesmo padrão de email_convocacao_config. Re-executável.

CREATE TABLE IF NOT EXISTS public.email_estoque_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  destinatarios text[] NOT NULL DEFAULT '{}',
  copia text[] NOT NULL DEFAULT '{}',
  automatico boolean NOT NULL DEFAULT false,
  -- 0 = domingo ... 6 = sábado (Brasília). Padrão: segunda.
  dia_semana smallint NOT NULL DEFAULT 1 CHECK (dia_semana BETWEEN 0 AND 6),
  -- Estados do relatório (vazio = os que têm estoque cadastrado).
  ufs text[] NOT NULL DEFAULT '{}',
  ultimo_envio_automatico date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_estoque_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_email_estoque_config_updated ON public.email_estoque_config;
CREATE TRIGGER trg_email_estoque_config_updated BEFORE UPDATE ON public.email_estoque_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_estoque_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_estoque_config FROM anon;
DROP POLICY IF EXISTS "email_estoque select" ON public.email_estoque_config;
CREATE POLICY "email_estoque select" ON public.email_estoque_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'view'));
DROP POLICY IF EXISTS "email_estoque update" ON public.email_estoque_config;
CREATE POLICY "email_estoque update" ON public.email_estoque_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'));
