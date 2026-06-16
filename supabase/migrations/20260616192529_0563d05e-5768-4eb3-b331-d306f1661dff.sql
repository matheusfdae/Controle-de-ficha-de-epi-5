
-- Status do termo coletivo
DO $$ BEGIN
  CREATE TYPE public.termo_coletivo_status AS ENUM ('rascunho','em_assinatura','finalizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Cabeçalho
CREATE TABLE public.termos_epi_coletivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  posto TEXT NOT NULL,
  mes_referencia TEXT NOT NULL, -- ex: "06/2026"
  lider TEXT,
  empresa TEXT,
  observacoes TEXT,
  status public.termo_coletivo_status NOT NULL DEFAULT 'em_assinatura',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.termos_epi_coletivos TO authenticated;
GRANT ALL ON public.termos_epi_coletivos TO service_role;
ALTER TABLE public.termos_epi_coletivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins/rh gerenciam termos coletivos"
  ON public.termos_epi_coletivos FOR ALL TO authenticated
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

CREATE POLICY "leitura por autenticados"
  ON public.termos_epi_coletivos FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_termos_coletivos_updated
  BEFORE UPDATE ON public.termos_epi_coletivos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Itens (1 material por linha)
CREATE TABLE public.termos_epi_coletivos_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termo_id UUID NOT NULL REFERENCES public.termos_epi_coletivos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  colaborador_nome TEXT NOT NULL,
  colaborador_cpf TEXT,
  epi_id UUID REFERENCES public.epis(id) ON DELETE SET NULL,
  material TEXT NOT NULL,
  ca TEXT,
  tamanho TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  assinatura_url TEXT,
  data_assinatura TIMESTAMPTZ,
  ip_assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.termos_epi_coletivos_itens TO authenticated;
GRANT ALL ON public.termos_epi_coletivos_itens TO service_role;
ALTER TABLE public.termos_epi_coletivos_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins/rh gerenciam itens coletivos"
  ON public.termos_epi_coletivos_itens FOR ALL TO authenticated
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

CREATE POLICY "leitura itens autenticados"
  ON public.termos_epi_coletivos_itens FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_termos_coletivos_itens_updated
  BEFORE UPDATE ON public.termos_epi_coletivos_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_termos_itens_termo ON public.termos_epi_coletivos_itens(termo_id);

-- 3) Função pública para buscar termo via link público
CREATE OR REPLACE FUNCTION public.get_termo_coletivo_publico(_termo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'termo', to_jsonb(t.*),
    'itens', COALESCE(
      (SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.ordem, i.created_at)
       FROM public.termos_epi_coletivos_itens i WHERE i.termo_id = t.id),
      '[]'::jsonb
    )
  ) INTO result
  FROM public.termos_epi_coletivos t
  WHERE t.id = _termo_id;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_termo_coletivo_publico(UUID) TO anon, authenticated;

-- 4) Função pública para assinar um item (uma linha)
CREATE OR REPLACE FUNCTION public.assinar_termo_coletivo_item(
  _item_id UUID,
  _assinatura TEXT,
  _ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ja_assinado TIMESTAMPTZ;
BEGIN
  SELECT data_assinatura INTO ja_assinado
  FROM public.termos_epi_coletivos_itens WHERE id = _item_id;

  IF ja_assinado IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_assinado');
  END IF;

  UPDATE public.termos_epi_coletivos_itens
     SET assinatura_url = _assinatura,
         data_assinatura = now(),
         ip_assinatura = _ip
   WHERE id = _item_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assinar_termo_coletivo_item(UUID, TEXT, TEXT) TO anon, authenticated;
