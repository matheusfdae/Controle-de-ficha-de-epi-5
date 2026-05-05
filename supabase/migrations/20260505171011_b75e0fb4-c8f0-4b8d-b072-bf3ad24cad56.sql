
-- ===== fichas_epi: snapshot fields + nullable FK =====
ALTER TABLE public.fichas_epi
  ALTER COLUMN colaborador_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS nome_funcionario TEXT,
  ADD COLUMN IF NOT EXISTS funcao TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS cpf_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS matricula_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS setor_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS turno TEXT;

-- ===== fichas_epi_itens: free-form snapshot fields + nullable FK =====
ALTER TABLE public.fichas_epi_itens
  ALTER COLUMN epi_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS ca TEXT,
  ADD COLUMN IF NOT EXISTS posto_servico TEXT,
  ADD COLUMN IF NOT EXISTS data_validade DATE,
  ADD COLUMN IF NOT EXISTS recebido BOOLEAN NOT NULL DEFAULT false;

-- ===== Public RPC: read ficha by id (no auth required) =====
CREATE OR REPLACE FUNCTION public.get_ficha_publica(_ficha_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'ficha', to_jsonb(f.*),
    'itens', COALESCE(
      (SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at)
       FROM public.fichas_epi_itens i WHERE i.ficha_id = f.id),
      '[]'::jsonb
    )
  ) INTO result
  FROM public.fichas_epi f
  WHERE f.id = _ficha_id;
  RETURN result;
END;
$$;

-- ===== Public RPC: sign ficha (no auth required) =====
CREATE OR REPLACE FUNCTION public.assinar_ficha_publica(
  _ficha_id UUID,
  _assinatura TEXT,
  _itens_recebidos UUID[],
  _ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status public.ficha_status;
BEGIN
  SELECT status INTO cur_status FROM public.fichas_epi WHERE id = _ficha_id;
  IF cur_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ficha_nao_encontrada');
  END IF;
  IF cur_status <> 'pendente_assinatura' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_assinada');
  END IF;

  UPDATE public.fichas_epi_itens
     SET recebido = (id = ANY(_itens_recebidos))
   WHERE ficha_id = _ficha_id;

  UPDATE public.fichas_epi
     SET assinatura_colaborador_url = _assinatura,
         data_assinatura_colaborador = now(),
         ip_assinatura = _ip,
         status = 'assinada'
   WHERE id = _ficha_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Allow anonymous to call these RPCs
GRANT EXECUTE ON FUNCTION public.get_ficha_publica(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_ficha_publica(UUID, TEXT, UUID[], TEXT) TO anon, authenticated;
