-- Relatório semanal de fichas pendentes de assinatura por e-mail (Microsoft 365),
-- configurado POR ESTADO: cada UF tem os seus destinatários, cópia, dia da semana
-- e envio automático (7h). O e-mail traz só as fichas daquele estado: resumo,
-- há quantos dias estão paradas, fichas sem itens e situação do link, com planilha.
-- Cada usuário vê e edita só os estados liberados para ele. Re-executável.

-- Versão de teste com uma configuração única (só existiu no banco de dev).
DROP TABLE IF EXISTS public.email_pendentes_config;

CREATE TABLE IF NOT EXISTS public.email_pendentes_estados (
  uf text PRIMARY KEY REFERENCES public.estados(uf) ON DELETE CASCADE,
  destinatarios text[] NOT NULL DEFAULT '{}',
  copia text[] NOT NULL DEFAULT '{}',
  automatico boolean NOT NULL DEFAULT false,
  -- 0 = domingo ... 6 = sábado (Brasília). Padrão: segunda.
  dia_semana smallint NOT NULL DEFAULT 1 CHECK (dia_semana BETWEEN 0 AND 6),
  ultimo_envio_automatico date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Uma linha por estado já cadastrado; estado novo ganha a linha ao salvar na tela.
INSERT INTO public.email_pendentes_estados (uf) SELECT uf FROM public.estados ON CONFLICT (uf) DO NOTHING;

DROP TRIGGER IF EXISTS trg_email_pendentes_estados_updated ON public.email_pendentes_estados;
CREATE TRIGGER trg_email_pendentes_estados_updated BEFORE UPDATE ON public.email_pendentes_estados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_pendentes_estados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_pendentes_estados FROM anon;
DROP POLICY IF EXISTS "email_pendentes select" ON public.email_pendentes_estados;
CREATE POLICY "email_pendentes select" ON public.email_pendentes_estados FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'view') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "email_pendentes insert" ON public.email_pendentes_estados;
CREATE POLICY "email_pendentes insert" ON public.email_pendentes_estados FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "email_pendentes update" ON public.email_pendentes_estados;
CREATE POLICY "email_pendentes update" ON public.email_pendentes_estados FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf));
