-- Selfie do colaborador tirada logo após a rubrica (prova de quem assinou).
-- Fica numa tabela própria que SÓ admin/RH leem (dado pessoal, LGPD): não
-- aparece na ficha nem no PDF, só no quadro "Comprovação da assinatura".
-- Uma selfie por ASSINATURA: quando a ficha é reenviada para assinatura, a
-- selfie anterior continua guardada (prova da assinatura anterior) e a tela
-- mostra a mais recente. Re-executável.

CREATE TABLE IF NOT EXISTS public.fichas_selfies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_epi(id) ON DELETE CASCADE,
  selfie text NOT NULL CHECK (selfie ~ '^data:image/(jpeg|png);base64,' AND length(selfie) <= 1400000),
  tirada_em timestamptz NOT NULL DEFAULT now(),
  -- Quem estava logado colhendo a assinatura (null quando foi pelo link/tablet).
  colhida_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Versão de teste anterior tinha ficha_id como chave (uma selfie por ficha).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'fichas_selfies' AND column_name = 'id') THEN
    ALTER TABLE public.fichas_selfies DROP CONSTRAINT IF EXISTS fichas_selfies_pkey;
    ALTER TABLE public.fichas_selfies ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE public.fichas_selfies ADD PRIMARY KEY (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_fichas_selfies_ficha ON public.fichas_selfies (ficha_id, tirada_em DESC);
ALTER TABLE public.fichas_selfies ALTER COLUMN colhida_por SET DEFAULT public.current_profile_id();
ALTER TABLE public.fichas_selfies ENABLE ROW LEVEL SECURITY;

-- Versão anterior desta migration guardava na própria ficha: move e apaga.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'fichas_epi' AND column_name = 'selfie_colaborador') THEN
    INSERT INTO public.fichas_selfies (ficha_id, selfie, tirada_em)
    SELECT id, selfie_colaborador, coalesce(selfie_em, data_assinatura_colaborador, now())
    FROM public.fichas_epi WHERE selfie_colaborador IS NOT NULL;
    ALTER TABLE public.fichas_epi DROP COLUMN selfie_colaborador;
    ALTER TABLE public.fichas_epi DROP COLUMN IF EXISTS selfie_em;
  END IF;
END $$;

-- Ver: só admin/RH. Gravar: quem cria/edita fichas (assinatura presencial).
DROP POLICY IF EXISTS "selfies select admin rh" ON public.fichas_selfies;
CREATE POLICY "selfies select admin rh" ON public.fichas_selfies FOR SELECT TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()));
DROP POLICY IF EXISTS "selfies insert por permissao" ON public.fichas_selfies;
CREATE POLICY "selfies insert por permissao" ON public.fichas_selfies FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(public.current_profile_id(), 'fichas_epi', 'create')
    OR public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'create')
    OR public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit')
  );
-- Sem UPDATE/DELETE pelo app: a selfie da assinatura não é trocada depois.

-- Assinatura pelo link/tablet (sem login): agora exige a selfie.
DROP FUNCTION IF EXISTS public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT);
DROP FUNCTION IF EXISTS public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT, TEXT);

CREATE FUNCTION public.assinar_ficha_publica_por_token(
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

  -- Selfie obrigatória: JPEG/PNG em data URL e de tamanho razoável (até ~1 MB).
  IF _selfie IS NULL OR _selfie !~ '^data:image/(jpeg|png);base64,' OR length(_selfie) > 1400000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'selfie_obrigatoria');
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

  INSERT INTO public.fichas_selfies (ficha_id, selfie, tirada_em)
  VALUES (v_ficha_id, _selfie, now());

  UPDATE public.assinatura_tokens
     SET usado = true, usado_em = now()
   WHERE token = _token;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT, TEXT) TO anon, authenticated;
