-- Selfie da assinatura passa a ser OPCIONAL (pedido do Matheus, 22/10/2026).
-- Assinatura pelo link/tablet: com selfie, ela é validada e guardada como antes;
-- sem selfie, a ficha é assinada só com a rubrica. Re-executável.

CREATE OR REPLACE FUNCTION public.assinar_ficha_publica_por_token(
  _token TEXT,
  _assinatura TEXT,
  _itens_recebidos UUID[],
  _ip TEXT DEFAULT NULL,
  _selfie TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ficha_id UUID;
  cur_status public.ficha_status;
BEGIN
  SELECT ficha_id INTO v_ficha_id
  FROM public.assinatura_tokens
  WHERE token = _token AND tipo_ficha = 'epi' AND usado = false AND expira_em > now();

  IF v_ficha_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  -- Selfie opcional; se vier, JPEG/PNG em data URL e de tamanho razoável (até ~1 MB).
  IF _selfie IS NOT NULL AND (_selfie !~ '^data:image/(jpeg|png);base64,' OR length(_selfie) > 1400000) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'selfie_invalida');
  END IF;

  SELECT status INTO cur_status FROM public.fichas_epi WHERE id = v_ficha_id;
  IF cur_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ficha_nao_encontrada');
  END IF;
  IF cur_status <> 'pendente_assinatura' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_assinada');
  END IF;

  UPDATE public.fichas_epi_itens
     SET recebido = (id = ANY(_itens_recebidos))
   WHERE ficha_id = v_ficha_id;

  UPDATE public.fichas_epi
     SET assinatura_colaborador_url = _assinatura,
         data_assinatura_colaborador = now(),
         ip_assinatura = _ip,
         status = 'assinada'
   WHERE id = v_ficha_id;

  IF _selfie IS NOT NULL THEN
    INSERT INTO public.fichas_selfies (ficha_id, selfie, tirada_em)
    VALUES (v_ficha_id, _selfie, now());
  END IF;

  UPDATE public.assinatura_tokens
     SET usado = true, usado_em = now()
   WHERE token = _token;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT, TEXT) TO anon, authenticated;
