
-- 1) Renomear Setor -> Posto
ALTER TABLE public.fichas_epi RENAME COLUMN setor_snapshot TO posto_snapshot;
ALTER TABLE public.profiles RENAME COLUMN setor TO posto;

-- 2) Vincular Termo de Recebimento à Ficha de EPI
ALTER TABLE public.termos_entrega_epi
  ADD COLUMN IF NOT EXISTS ficha_epi_id UUID REFERENCES public.fichas_epi(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_termos_entrega_epi_ficha ON public.termos_entrega_epi(ficha_epi_id);

-- 3) Tabela de Assinaturas (rastreabilidade)
CREATE TABLE IF NOT EXISTS public.assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_epi_id UUID REFERENCES public.fichas_epi(id) ON DELETE CASCADE,
  termo_id UUID REFERENCES public.termos_entrega_epi(id) ON DELETE CASCADE,
  item_id UUID,
  tipo TEXT NOT NULL CHECK (tipo IN ('ficha','termo')),
  assinante TEXT,
  assinatura_url TEXT,
  ip_assinatura TEXT,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas TO authenticated;
GRANT ALL ON public.assinaturas TO service_role;

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assinaturas"
  ON public.assinaturas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/RH can manage assinaturas"
  ON public.assinaturas FOR ALL TO authenticated
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- 4) RPC: progresso de assinatura
CREATE OR REPLACE FUNCTION public.progresso_assinatura(_ficha_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INT;
  assinados INT;
  total_termo INT;
  assinados_termo INT;
BEGIN
  SELECT COUNT(*) INTO total FROM public.fichas_epi_itens WHERE ficha_id = _ficha_id;
  SELECT COUNT(*) INTO assinados FROM public.fichas_epi_itens
    WHERE ficha_id = _ficha_id AND recebido = true;

  SELECT COUNT(*) INTO total_termo
    FROM public.termos_entrega_epi_itens i
    JOIN public.termos_entrega_epi t ON t.id = i.termo_id
    WHERE t.ficha_epi_id = _ficha_id;
  SELECT COUNT(*) INTO assinados_termo
    FROM public.termos_entrega_epi_itens i
    JOIN public.termos_entrega_epi t ON t.id = i.termo_id
    WHERE t.ficha_epi_id = _ficha_id AND i.assinado_em IS NOT NULL;

  RETURN jsonb_build_object(
    'ficha_total', total, 'ficha_assinados', assinados,
    'termo_total', total_termo, 'termo_assinados', assinados_termo,
    'completo', (total > 0 AND assinados = total
                 AND (total_termo = 0 OR assinados_termo = total_termo))
  );
END;
$$;

-- 5) RPC: dados combinados (ficha + termo) por id de ficha (público)
CREATE OR REPLACE FUNCTION public.get_combo_publico(_ficha_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'ficha', to_jsonb(f.*),
    'itens', COALESCE((SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at)
                       FROM public.fichas_epi_itens i WHERE i.ficha_id = f.id), '[]'::jsonb),
    'termo', (SELECT to_jsonb(t.*) FROM public.termos_entrega_epi t WHERE t.ficha_epi_id = f.id LIMIT 1),
    'termo_itens', COALESCE((SELECT jsonb_agg(to_jsonb(ti.*) ORDER BY ti.ordem)
                              FROM public.termos_entrega_epi_itens ti
                              JOIN public.termos_entrega_epi t ON t.id = ti.termo_id
                              WHERE t.ficha_epi_id = f.id), '[]'::jsonb),
    'progresso', public.progresso_assinatura(f.id)
  ) INTO result
  FROM public.fichas_epi f WHERE f.id = _ficha_id;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.progresso_assinatura(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_combo_publico(UUID) TO anon, authenticated;
