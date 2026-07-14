-- =========================================================
-- SECURITY FIXES (revisão de segurança 2026-07-14)
--
-- 1) user_roles: RH não pode mais conceder/remover o papel 'admin'
--    (fechava uma escalada de privilégio: RH -> admin)
-- 2) assinatura_tokens: RLS deixa de expor todas as linhas para
--    anon (leitura/consumo abertos); passa a exigir admin/rh/
--    supervisor para gerenciar, e o fluxo público passa a usar
--    função SECURITY DEFINER validando o token específico.
-- 3) fichas_epi: rotas públicas de leitura/assinatura passam a
--    exigir um token de assinatura_tokens (com expiração e
--    consumo único), em vez do UUID cru da ficha.
-- 4) termos_epi_coletivos: mesmo tratamento (nova tabela de
--    tokens dedicada, já que a tabela assinatura_tokens só
--    cobre fichas epi/uniforme).
-- 5) storage.objects (bucket epi-assets): uploads/updates deixam
--    de ser liberados para qualquer usuário autenticado no
--    bucket inteiro.
-- 6) profiles: usuário comum não pode mais alterar campos
--    administrativos do próprio perfil via UPDATE direto.
-- =========================================================

-- =========================================================
-- 1) user_roles — RH não pode conceder/remover papel 'admin'
-- =========================================================
DROP POLICY IF EXISTS "user_roles manage admin or rh" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles all admin" ON public.user_roles;

CREATE POLICY "user_roles manage admin or rh (sem escalar admin)"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'rh') AND role <> 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'rh') AND role <> 'admin')
  );

-- =========================================================
-- 2) assinatura_tokens — remove exposição pública total
-- =========================================================
DROP POLICY IF EXISTS "tokens select public" ON public.assinatura_tokens;
DROP POLICY IF EXISTS "tokens update public (consume)" ON public.assinatura_tokens;
DROP POLICY IF EXISTS "tokens insert authenticated" ON public.assinatura_tokens;

-- Só quem pode gerenciar a ficha de origem pode criar/ver o token.
-- O consumo público (leitura/assinatura via link) passa a ser feito
-- exclusivamente pelas funções SECURITY DEFINER abaixo — nenhuma
-- policy libera SELECT/UPDATE direto para anon.
CREATE POLICY "tokens select admin/rh/supervisor/dono"
  ON public.assinatura_tokens FOR SELECT TO authenticated
  USING (
    public.is_admin_or_rh(auth.uid())
    OR (tipo_ficha = 'epi' AND EXISTS (
          SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id
            AND (f.colaborador_id = auth.uid() OR public.is_supervisor_of(auth.uid(), f.colaborador_id))
        ))
    OR (tipo_ficha = 'uniforme' AND EXISTS (
          SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id
            AND (f.colaborador_id = auth.uid() OR public.is_supervisor_of(auth.uid(), f.colaborador_id))
        ))
  );

CREATE POLICY "tokens insert admin/rh/supervisor/dono"
  ON public.assinatura_tokens FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_rh(auth.uid())
    OR (tipo_ficha = 'epi' AND EXISTS (
          SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id
            AND (f.colaborador_id = auth.uid() OR public.is_supervisor_of(auth.uid(), f.colaborador_id))
        ))
    OR (tipo_ficha = 'uniforme' AND EXISTS (
          SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id
            AND (f.colaborador_id = auth.uid() OR public.is_supervisor_of(auth.uid(), f.colaborador_id))
        ))
  );

-- =========================================================
-- 3) Funções públicas de assinatura de ficha_epi por TOKEN
--    (substituem get_ficha_publica / assinar_ficha_publica,
--    que usavam o UUID da ficha como se fosse um segredo)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ficha_publica_por_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ficha_id UUID;
  result JSONB;
BEGIN
  SELECT ficha_id INTO v_ficha_id
  FROM public.assinatura_tokens
  WHERE token = _token AND tipo_ficha = 'epi' AND usado = false AND expira_em > now();

  IF v_ficha_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'ficha', to_jsonb(f.*),
    'itens', COALESCE(
      (SELECT jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at)
       FROM public.fichas_epi_itens i WHERE i.ficha_id = f.id),
      '[]'::jsonb
    )
  ) INTO result
  FROM public.fichas_epi f
  WHERE f.id = v_ficha_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assinar_ficha_publica_por_token(
  _token TEXT,
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
  v_ficha_id UUID;
  cur_status public.ficha_status;
BEGIN
  SELECT ficha_id INTO v_ficha_id
  FROM public.assinatura_tokens
  WHERE token = _token AND tipo_ficha = 'epi' AND usado = false AND expira_em > now();

  IF v_ficha_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
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

  UPDATE public.assinatura_tokens
     SET usado = true, usado_em = now()
   WHERE token = _token;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ficha_publica_por_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_ficha_publica_por_token(TEXT, TEXT, UUID[], TEXT) TO anon, authenticated;

-- Desativa as funções antigas (chave = UUID cru da ficha, sem expiração).
-- Mantidas apenas para uso interno/administrativo autenticado, nunca anon.
REVOKE EXECUTE ON FUNCTION public.get_ficha_publica(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assinar_ficha_publica(UUID, TEXT, UUID[], TEXT) FROM anon, authenticated;

-- =========================================================
-- 4) Termos coletivos — tabela de tokens dedicada + funções
--    por token (substituem get_termo_coletivo_publico /
--    assinar_termo_coletivo_item no fluxo público)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.termo_coletivo_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  item_id UUID NOT NULL REFERENCES public.termos_epi_coletivos_itens(id) ON DELETE CASCADE,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  usado BOOLEAN NOT NULL DEFAULT false,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_termo_coletivo_token ON public.termo_coletivo_tokens(token);

ALTER TABLE public.termo_coletivo_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "termo tokens admin/rh manage" ON public.termo_coletivo_tokens;
CREATE POLICY "termo tokens admin/rh manage"
  ON public.termo_coletivo_tokens FOR ALL TO authenticated
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_termo_coletivo_item_por_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
  result JSONB;
BEGIN
  SELECT item_id INTO v_item_id
  FROM public.termo_coletivo_tokens
  WHERE token = _token AND expira_em > now();

  IF v_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'termo', jsonb_build_object('posto', t.posto, 'mes_referencia', t.mes_referencia),
    'item', to_jsonb(i.*)
  ) INTO result
  FROM public.termos_epi_coletivos_itens i
  JOIN public.termos_epi_coletivos t ON t.id = i.termo_id
  WHERE i.id = v_item_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assinar_termo_coletivo_item_por_token(
  _token TEXT,
  _assinatura TEXT,
  _ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
  ja_assinado TIMESTAMPTZ;
BEGIN
  SELECT item_id INTO v_item_id
  FROM public.termo_coletivo_tokens
  WHERE token = _token AND expira_em > now();

  IF v_item_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT data_assinatura INTO ja_assinado
  FROM public.termos_epi_coletivos_itens WHERE id = v_item_id;

  IF ja_assinado IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_assinado');
  END IF;

  UPDATE public.termos_epi_coletivos_itens
     SET assinatura_url = _assinatura,
         data_assinatura = now(),
         ip_assinatura = _ip
   WHERE id = v_item_id;

  UPDATE public.termo_coletivo_tokens
     SET usado = true, usado_em = now()
   WHERE token = _token;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_termo_coletivo_item_por_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_termo_coletivo_item_por_token(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Função antiga expunha o cadastro inteiro do termo (nomes/CPFs de todos
-- os colaboradores do posto) para quem soubesse/adivinhasse o termo_id.
REVOKE EXECUTE ON FUNCTION public.get_termo_coletivo_publico(UUID) FROM anon, authenticated;
-- assinar_termo_coletivo_item(UUID,...) continua disponível apenas para
-- authenticated (fluxo presencial no tablet, logado como admin/rh);
-- deixa de aceitar chamadas anônimas.
REVOKE EXECUTE ON FUNCTION public.assinar_termo_coletivo_item(UUID, TEXT, TEXT) FROM anon;

-- =========================================================
-- 5) storage.objects (bucket epi-assets) — restringe uploads
-- =========================================================
DROP POLICY IF EXISTS "epi-assets auth upload" ON storage.objects;
DROP POLICY IF EXISTS "epi-assets auth update" ON storage.objects;

-- Autenticados podem subir apenas em pastas de gestão (catálogo de EPIs,
-- fotos de perfil, etc.), nunca sobrescrever a pasta pública de assinaturas.
CREATE POLICY "epi-assets auth upload (exceto assinaturas)"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'epi-assets' AND (storage.foldername(name))[1] <> 'assinaturas');

CREATE POLICY "epi-assets auth update (exceto assinaturas)"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'epi-assets' AND (storage.foldername(name))[1] <> 'assinaturas');

-- =========================================================
-- 6) profiles — impede que o próprio usuário altere campos
--    administrativos (cargo, setor, supervisor, matrícula,
--    situação de ativo/inativo etc.) via UPDATE direto.
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_rh(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Usuário comum: mantém apenas os campos de "dados de contato" editáveis;
  -- qualquer campo administrativo volta ao valor anterior.
  NEW.cpf := OLD.cpf;
  NEW.matricula := OLD.matricula;
  NEW.cargo := OLD.cargo;
  NEW.setor := OLD.setor;
  NEW.departamento := OLD.departamento;
  NEW.data_admissao := OLD.data_admissao;
  NEW.supervisor_id := OLD.supervisor_id;
  NEW.ativo := OLD.ativo;
  NEW.inativado_em := OLD.inativado_em;
  NEW.motivo_inativacao := OLD.motivo_inativacao;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();
