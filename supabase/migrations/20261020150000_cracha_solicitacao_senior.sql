-- Solicitação de crachá pelo link público, com os dados da Senior.
--
-- Sem login: quem solicita se identifica com a PRÓPRIA matrícula OU CPF (precisa
-- estar ativo na lista da Senior; qualquer cargo), informa a matrícula ou o CPF
-- do colaborador e o sistema preenche o resto. Ele só
-- manda foto, motivo, tipo sanguíneo e CNV. Tudo passa pela aprovação do RH
-- (tela Solicitações); a foto nova só vira a foto do crachá quando aprovada.
--
-- As funções são SECURITY DEFINER e liberadas para anon: elas mesmas validam
-- o solicitante a cada chamada e nunca devolvem CPF. Re-executável.

-- Qualquer colaborador ativo pode solicitar (decisão de 20/10): não há lista
-- de cargos. Remove a tabela de uma versão anterior desta migration.
DROP TABLE IF EXISTS public.cracha_solicitantes_cargos;

-- ---------- Campos novos da solicitação ----------
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS request_motivo text;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS request_photo_url text;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS requester_senior_id uuid
  REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS requester_matricula text;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS requester_cargo text;

-- ---------- Limite de tentativas (CPF/matrícula errados) ----------
CREATE TABLE IF NOT EXISTS public.cracha_solicitacao_tentativas (
  id bigserial PRIMARY KEY,
  ip text,
  matricula text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cracha_tentativas_ip ON public.cracha_solicitacao_tentativas (ip, criado_em);
CREATE INDEX IF NOT EXISTS idx_cracha_tentativas_mat ON public.cracha_solicitacao_tentativas (matricula, criado_em);
-- Sem políticas: ninguém lê nem grava direto, só as funções abaixo.
ALTER TABLE public.cracha_solicitacao_tentativas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._cracha_ip()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(trim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '')
$$;

-- Chave das tentativas: a matrícula ou o CPF (só dígitos) informado.
CREATE OR REPLACE FUNCTION public._cracha_chave(_matricula integer, _cpf text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(_matricula::text, nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), ''), '?')
$$;

-- Confere o solicitante: matrícula OU CPF de um colaborador ativo (se vierem
-- os dois, vale o CPF). Erro de identificação (P0401) conta tentativa; 10 por
-- IP ou 5 pela mesma matrícula/CPF em 15 minutos bloqueiam.
CREATE OR REPLACE FUNCTION public._cracha_solicitante(_matricula integer, _cpf text)
RETURNS public.colaboradores_senior
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ip text := public._cracha_ip();
  _doc text := nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '');
  _chave text := public._cracha_chave(_matricula, _cpf);
  _c public.colaboradores_senior;
BEGIN
  IF _matricula IS NULL AND _doc IS NULL THEN
    RAISE EXCEPTION 'Informe a sua matrícula ou o seu CPF.';
  END IF;
  IF (_ip IS NOT NULL AND (SELECT count(*) FROM cracha_solicitacao_tentativas
        WHERE criado_em > now() - interval '15 minutes' AND ip = _ip) >= 10)
     OR (SELECT count(*) FROM cracha_solicitacao_tentativas
           WHERE criado_em > now() - interval '15 minutes' AND matricula = _chave) >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas. Aguarde 15 minutos e tente de novo.';
  END IF;

  SELECT * INTO _c FROM colaboradores_senior
  WHERE ativo AND (CASE WHEN _doc IS NOT NULL THEN cpf = lpad(_doc, 11, '0') ELSE num_cad = _matricula END)
  ORDER BY data_admissao DESC NULLS LAST LIMIT 1;

  IF _c.id IS NULL THEN
    -- Código próprio: quem chama grava a tentativa depois de desfazer o resto.
    RAISE EXCEPTION USING ERRCODE = 'P0401', MESSAGE = CASE WHEN _doc IS NOT NULL
      THEN 'Não encontramos um colaborador ativo na Senior com esse CPF.'
      ELSE 'Não encontramos um colaborador ativo na Senior com essa matrícula.' END;
  END IF;
  RETURN _c;
END $$;

-- Colaborador ativo por matrícula ou CPF.
CREATE OR REPLACE FUNCTION public._cracha_colaborador(_matricula integer, _cpf text)
RETURNS public.colaboradores_senior
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _doc text := nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '');
  _c public.colaboradores_senior;
BEGIN
  IF _matricula IS NULL AND _doc IS NULL THEN
    RAISE EXCEPTION 'Informe a matrícula ou o CPF do colaborador.';
  END IF;
  SELECT * INTO _c FROM colaboradores_senior
  WHERE ativo AND (CASE WHEN _matricula IS NOT NULL THEN num_cad = _matricula ELSE cpf = lpad(_doc, 11, '0') END)
  ORDER BY data_admissao DESC NULLS LAST LIMIT 1;
  IF _c.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado entre os ativos da Senior. Se foi admitido hoje, tente de novo mais tarde.';
  END IF;
  RETURN _c;
END $$;

-- Linha do crachá ligada ao colaborador (o espelho da Senior já cria; garante).
CREATE OR REPLACE FUNCTION public._cracha_linha(_c public.colaboradores_senior)
RETURNS public.cracha_employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e public.cracha_employees;
BEGIN
  SELECT * INTO _e FROM cracha_employees WHERE senior_id = _c.id;
  IF _e.id IS NULL THEN
    INSERT INTO cracha_employees (senior_id, employee_id, full_name, role, company, cpf, phone)
    VALUES (_c.id, _c.num_cad::text, _c.nome, _c.cargo, _c.empresa_nome, _c.cpf, _c.telefone)
    RETURNING * INTO _e;
  END IF;
  RETURN _e;
END $$;

-- ---------- 1. Identificar o solicitante (interna) ----------
CREATE OR REPLACE FUNCTION public._cracha_identificar(_matricula integer, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
BEGIN
  RETURN jsonb_build_object('nome', _s.nome, 'cargo', _s.cargo, 'uf', _s.uf);
END $$;

-- ---------- 2. Buscar o colaborador (interna) ----------
CREATE OR REPLACE FUNCTION public._cracha_buscar(
  _sol_matricula integer, _sol_cpf text, _matricula integer, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _c public.colaboradores_senior := public._cracha_colaborador(_matricula, _cpf);
  _e public.cracha_employees;
BEGIN
  SELECT * INTO _e FROM cracha_employees WHERE senior_id = _c.id;
  RETURN jsonb_build_object(
    'nome', _c.nome,
    'matricula', _c.num_cad,
    'cargo', _c.cargo,
    'empresa', _c.empresa_nome,
    'local', _c.nome_local,
    'posto', _c.posto_descricao,
    'uf', _c.uf,
    'situacao', _c.situacao_descricao,
    'vigilante', coalesce(_c.cargo ILIKE '%vigilant%', false),
    'tem_foto', _e.photo_url IS NOT NULL,
    'tipo_sanguineo', _e.blood_type,
    'cnv', _e.cnv,
    'solicitacao', CASE WHEN _e.request_status IS NULL THEN NULL ELSE jsonb_build_object(
      'status', _e.request_status,
      'enviada_em', _e.requested_at,
      'motivo_recusa', _e.rejection_reason) END
  );
END $$;

-- ---------- 3. Enviar a solicitação (interna) ----------
CREATE OR REPLACE FUNCTION public._cracha_enviar(
  _sol_matricula integer, _sol_cpf text, _sol_telefone text,
  _matricula integer, _cpf text,
  _motivo text, _observacao text, _foto text, _tipo_sanguineo text, _cnv text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _c public.colaboradores_senior := public._cracha_colaborador(_matricula, _cpf);
  _e public.cracha_employees;
  _motivos jsonb := '{"primeira_via":"1ª via","perda":"2ª via — perda","dano":"2ª via — dano/desgaste",
    "mudanca_cargo":"Mudança de cargo/posto","mudanca_nome":"Mudança de nome","outro":"Outro"}';
  _tel text := nullif(regexp_replace(coalesce(_sol_telefone, ''), '\D', '', 'g'), '');
  _cnv_limpa text := nullif(regexp_replace(coalesce(_cnv, ''), '\D', '', 'g'), '');
  _obs text := nullif(left(trim(coalesce(_observacao, '')), 500), '');
  _foto_url text;
BEGIN
  IF NOT _motivos ? coalesce(_motivo, '') THEN
    RAISE EXCEPTION 'Escolha o motivo da solicitação.';
  END IF;
  IF _motivo = 'outro' AND _obs IS NULL THEN
    RAISE EXCEPTION 'Explique o motivo na observação.';
  END IF;
  IF _tel IS NULL OR length(_tel) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'Informe seu telefone com DDD.';
  END IF;
  IF _tipo_sanguineo IS NOT NULL AND _tipo_sanguineo <> ''
     AND _tipo_sanguineo NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') THEN
    RAISE EXCEPTION 'Tipo sanguíneo inválido.';
  END IF;
  IF _c.cargo ILIKE '%vigilant%' AND _cnv_limpa IS NULL THEN
    RAISE EXCEPTION 'Para vigilante, a CNV é obrigatória.';
  END IF;
  IF _cnv_limpa IS NOT NULL AND length(_cnv_limpa) > 20 THEN
    RAISE EXCEPTION 'CNV inválida.';
  END IF;

  IF _foto IS NOT NULL AND _foto <> '' THEN
    IF _foto !~ '^solicitacoes/[0-9a-f-]{36}\.jpg$'
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'cracha-fotos' AND name = _foto) THEN
      RAISE EXCEPTION 'Foto não recebida. Envie a foto de novo.';
    END IF;
    _foto_url := '/storage/v1/object/public/cracha-fotos/' || _foto;
  END IF;

  _e := public._cracha_linha(_c);
  IF _e.request_status IN ('recebida', 'em_analise') THEN
    RAISE EXCEPTION 'Já existe uma solicitação em análise para este colaborador (enviada em %).',
      to_char(_e.requested_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  END IF;
  IF _foto_url IS NULL AND _e.photo_url IS NULL THEN
    RAISE EXCEPTION 'O colaborador ainda não tem foto: envie uma foto.';
  END IF;

  UPDATE cracha_employees SET
    request_status = 'recebida',
    request_motivo = _motivo,
    request_reason = (_motivos ->> _motivo) || coalesce(' — ' || _obs, ''),
    request_photo_url = _foto_url,
    requested_at = now(),
    requester_senior_id = _s.id,
    requester_name = _s.nome,
    requester_matricula = _s.num_cad::text,
    requester_cargo = _s.cargo,
    requester_phone = _tel,
    blood_type = coalesce(nullif(_tipo_sanguineo, ''), blood_type),
    cnv = coalesce(_cnv_limpa, cnv),
    rejection_reason = NULL,
    reviewed_at = NULL,
    reviewed_by = NULL,
    updated_at = now()
  WHERE id = _e.id;

  RETURN jsonb_build_object('ok', true, 'nome', _c.nome);
END $$;

-- ---------- Funções do link público ----------
-- Devolvem {erro: '...'} em vez de estourar: assim a tentativa errada fica
-- gravada (uma exceção desfaria a gravação junto).
DROP FUNCTION IF EXISTS public._cracha_erro(text, text, integer);
CREATE OR REPLACE FUNCTION public._cracha_erro(_estado text, _mensagem text, _chave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _estado = 'P0401' THEN
    INSERT INTO cracha_solicitacao_tentativas (ip, matricula) VALUES (public._cracha_ip(), _chave);
  END IF;
  RETURN jsonb_build_object('erro', _mensagem);
END $$;

CREATE OR REPLACE FUNCTION public.cracha_solicitacao_identificar(_matricula integer, _cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._cracha_identificar(_matricula, _cpf);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.cracha_solicitacao_buscar(
  _sol_matricula integer, _sol_cpf text, _matricula integer DEFAULT NULL, _cpf text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._cracha_buscar(_sol_matricula, _sol_cpf, _matricula, _cpf);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

CREATE OR REPLACE FUNCTION public.cracha_solicitacao_enviar(
  _sol_matricula integer, _sol_cpf text, _sol_telefone text,
  _matricula integer, _cpf text,
  _motivo text, _observacao text DEFAULT NULL, _foto text DEFAULT NULL,
  _tipo_sanguineo text DEFAULT NULL, _cnv text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._cracha_enviar(_sol_matricula, _sol_cpf, _sol_telefone, _matricula, _cpf,
    _motivo, _observacao, _foto, _tipo_sanguineo, _cnv);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

DO $$
DECLARE f text;
BEGIN
  -- Internas: só as funções acima chamam.
  FOREACH f IN ARRAY ARRAY[
    'public._cracha_solicitante(integer, text)', 'public._cracha_colaborador(integer, text)',
    'public._cracha_linha(public.colaboradores_senior)', 'public._cracha_identificar(integer, text)',
    'public._cracha_buscar(integer, text, integer, text)',
    'public._cracha_enviar(integer, text, text, integer, text, text, text, text, text, text)',
    'public._cracha_erro(text, text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.cracha_solicitacao_identificar(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cracha_solicitacao_buscar(integer, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cracha_solicitacao_enviar(integer, text, text, integer, text, text, text, text, text, text) TO anon, authenticated;

-- ---------- Foto: o link público só envia para cracha-fotos/solicitacoes/ ----------
DROP POLICY IF EXISTS "cracha solicitacao foto" ON storage.objects;
CREATE POLICY "cracha solicitacao foto" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'cracha-fotos' AND name ~ '^solicitacoes/[0-9a-f-]{36}\.jpg$');

-- Limite de tamanho e tipo no bucket (versões do Storage que têm as colunas).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types') THEN
    UPDATE storage.buckets SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
    WHERE id = 'cracha-fotos';
  END IF;
END $$;

-- A API (PostgREST) passa a enxergar as funções novas na hora.
NOTIFY pgrst, 'reload schema';
