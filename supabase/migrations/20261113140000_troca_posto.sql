-- Troca de posto do colaborador (pedido + aprovação).
--
-- Quem tem "criar" no módulo troca_posto pede a troca: escolhe o colaborador
-- ativo da Senior, o posto novo (postos que existem na Senior), a data de
-- início, o motivo e, se quiser, a escala nova. Quem tem "editar" aprova ou
-- recusa. O posto e a escala ATUAIS ficam guardados na solicitação (foto do
-- momento), para o histórico.
--
-- A aprovação NÃO grava na Senior. Depois de aprovada, um ADMINISTRADOR clica em
-- "Enviar à Senior": a função troca-posto-senior (ou o localhost) chama o
-- serviço historicos / Posto_4 e registra a resposta aqui
-- (troca_posto_registrar_senior). "Desfazer na Senior" apaga a troca enviada.
-- Testado em 13/11/2026 na matrícula 3/3008990: o posto leva junto o cargo, o
-- local e o centro de custo padrão dele (R017CAR); codCar mantém o cargo.
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.trocas_posto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT ('TP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada', 'enviada', 'erro_envio')),
  -- Colaborador (chave da Senior + nome no momento do pedido).
  colaborador_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  num_emp integer NOT NULL,
  tip_col integer NOT NULL,
  num_cad integer NOT NULL,
  colaborador_nome text NOT NULL,
  cargo text,
  uf text,
  -- De -> para.
  posto_atual_estrutura integer,
  posto_atual_codigo text,
  posto_atual_descricao text,
  escala_atual_codigo integer,
  escala_atual_nome text,
  local_atual text,
  posto_novo_estrutura integer NOT NULL,
  posto_novo_codigo text NOT NULL,
  posto_novo_descricao text,
  escala_nova_codigo integer,
  escala_nova_nome text,
  data_inicio date NOT NULL,
  motivo text NOT NULL,
  observacao text,
  -- Quem pediu / quem decidiu.
  solicitante_id uuid,
  solicitante_nome text,
  decidido_por uuid,
  decidido_nome text,
  decidido_em timestamptz,
  decisao_obs text,
  -- Envio à Senior (desligado por enquanto).
  senior_enviado_em timestamptz,
  senior_resposta text
);
-- Envio à Senior (13/11): motivo da Senior, manter cargo, o que a Senior aplica com o posto.
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS motivo_senior smallint;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS manter_cargo boolean NOT NULL DEFAULT false;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS cargo_atual_codigo text;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS centro_custo_atual text;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS padrao_posto jsonb;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS senior_enviado_por text;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS senior_desfeito_em timestamptz;
ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS senior_lido jsonb;
ALTER TABLE public.trocas_posto DROP CONSTRAINT IF EXISTS trocas_posto_status_check;
ALTER TABLE public.trocas_posto ADD CONSTRAINT trocas_posto_status_check
  CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada', 'enviada', 'erro_envio', 'desfeita'));

CREATE INDEX IF NOT EXISTS idx_trocas_posto_status ON public.trocas_posto (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trocas_posto_colab ON public.trocas_posto (colaborador_senior_id, created_at DESC);
-- Uma pendente por colaborador.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trocas_posto_pendente ON public.trocas_posto (colaborador_senior_id) WHERE status = 'pendente';

ALTER TABLE public.trocas_posto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trocas_posto ver" ON public.trocas_posto;
CREATE POLICY "trocas_posto ver" ON public.trocas_posto FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'troca_posto', 'view')
         AND (uf IS NULL OR public.pode_acessar_uf(uf)));
-- Gravação só pelas funções abaixo.

CREATE OR REPLACE FUNCTION public._tp_nome_usuario()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(p.nome_completo), ''), p.email, 'usuário')
  FROM profiles p WHERE p.id = public.current_profile_id()
$$;

-- Busca de colaborador ativo na Senior (nome 3+ letras, matrícula ou CPF), com o posto atual.
CREATE OR REPLACE FUNCTION public.troca_posto_buscar_colaborador(_busca text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t text := trim(coalesce(_busca, ''));
  _dig text := regexp_replace(coalesce(_busca, ''), '\D', '', 'g');
  _palavras text[] := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(coalesce(_busca, ''))), '\s+'), '');
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'create') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF _t !~ '^[\d.\-\s]+$' AND length(array_to_string(_palavras, '')) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', x.id, 'nome', x.nome, 'matricula', x.num_cad, 'num_emp', x.num_emp, 'tip_col', x.tip_col,
            'cargo', x.cargo, 'uf', x.uf, 'local', x.nome_local, 'empresa', x.empresa_nome,
            'posto_estrutura', x.posto_estrutura, 'posto_codigo', x.posto_codigo, 'posto_descricao', x.posto_descricao,
            'escala_codigo', x.escala_codigo, 'escala_nome', x.escala_nome,
            'cod_cargo', x.cod_cargo, 'centro_custo', nullif(concat_ws(' - ', x.cod_centro_custo, x.centro_custo), ''),
            'pendente', (SELECT t.codigo FROM trocas_posto t WHERE t.colaborador_senior_id = x.id AND t.status = 'pendente'))
          ORDER BY x.nome), '[]')
          FROM (SELECT c.* FROM colaboradores_senior c
                WHERE c.ativo AND (c.uf IS NULL OR public.pode_acessar_uf(c.uf))
                  AND CASE
                        WHEN length(_dig) = 11 AND _t ~ '^[\d.\-\s]+$' THEN c.cpf = _dig
                        WHEN _t ~ '^\d{1,9}$' THEN c.num_cad = _t::integer
                        ELSE (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w)
                      END
                ORDER BY c.nome LIMIT 15) x);
END $$;

-- Postos e escalas que existem na Senior (tirados dos colaboradores sincronizados).
CREATE OR REPLACE FUNCTION public.troca_posto_opcoes()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'create') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  RETURN jsonb_build_object(
    'postos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'estrutura', p.posto_estrutura, 'codigo', p.posto_codigo, 'descricao', p.descricao,
                 'uf', p.uf, 'colaboradores', p.qtd, 'empresas', to_jsonb(p.empresas)) ORDER BY p.descricao NULLS LAST, p.posto_codigo), '[]')
               FROM (SELECT c.posto_estrutura, c.posto_codigo, max(c.posto_descricao) AS descricao,
                            mode() WITHIN GROUP (ORDER BY c.uf) AS uf, count(*) AS qtd,
                            array_agg(DISTINCT c.num_emp ORDER BY c.num_emp) AS empresas
                     FROM colaboradores_senior c
                     WHERE c.ativo AND c.posto_codigo IS NOT NULL AND c.posto_estrutura IS NOT NULL
                       AND (c.uf IS NULL OR public.pode_acessar_uf(c.uf))
                     GROUP BY c.posto_estrutura, c.posto_codigo) p),
    'escalas', (SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', e.escala_codigo, 'nome', e.nome, 'colaboradores', e.qtd)
                 ORDER BY e.nome NULLS LAST, e.escala_codigo), '[]')
               FROM (SELECT c.escala_codigo, max(c.escala_nome) AS nome, count(*) AS qtd
                     FROM colaboradores_senior c WHERE c.ativo AND c.escala_codigo IS NOT NULL
                     GROUP BY c.escala_codigo) e));
END $$;

CREATE OR REPLACE FUNCTION public.troca_posto_solicitar(_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.colaboradores_senior;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _data date;
  _est integer;
  _cod text := nullif(trim(coalesce(_dados ->> 'posto_codigo', '')), '');
  _desc text;
  _esc integer;
  _esc_nome text;
  _motivo text := nullif(trim(coalesce(_dados ->> 'motivo', '')), '');
  _mot_senior smallint;
  _t public.trocas_posto;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'create') THEN RAISE EXCEPTION 'Sem permissão para pedir troca de posto.'; END IF;
  SELECT * INTO _c FROM colaboradores_senior WHERE id = (_dados ->> 'colaborador_senior_id')::uuid AND ativo;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado (ou inativo) na Senior.'; END IF;
  IF _c.uf IS NOT NULL AND NOT public.pode_acessar_uf(_c.uf) THEN RAISE EXCEPTION 'Sem acesso ao estado deste colaborador.'; END IF;
  IF EXISTS (SELECT 1 FROM trocas_posto WHERE colaborador_senior_id = _c.id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Já existe uma troca pendente para este colaborador.';
  END IF;

  BEGIN _est := (_dados ->> 'posto_estrutura')::integer; EXCEPTION WHEN others THEN _est := NULL; END;
  IF _est IS NULL OR _cod IS NULL THEN RAISE EXCEPTION 'Escolha o posto novo.'; END IF;
  SELECT max(posto_descricao) INTO _desc FROM colaboradores_senior WHERE posto_estrutura = _est AND posto_codigo = _cod;
  IF _est = _c.posto_estrutura AND _cod = _c.posto_codigo THEN RAISE EXCEPTION 'O posto novo é o mesmo posto atual.'; END IF;
  -- Só dentro da MESMA EMPRESA: empresa 1 -> postos da empresa 1; empresa 3 -> postos da empresa 3.
  -- O posto é "da empresa" quando quem está lotado nele é dessa empresa; a estrutura de postos
  -- (empresa 1 = 101, empresa 3 = 103) tem que ser a mesma do colaborador.
  IF _c.posto_estrutura IS NULL THEN RAISE EXCEPTION 'Colaborador sem posto na Senior: não dá para conferir a empresa do posto.'; END IF;
  IF _est <> _c.posto_estrutura
     OR NOT EXISTS (SELECT 1 FROM colaboradores_senior x WHERE x.ativo AND x.num_emp = _c.num_emp
                      AND x.posto_estrutura = _est AND x.posto_codigo = _cod) THEN
    RAISE EXCEPTION 'Movimentação entre empresas não é permitida: o colaborador é da empresa % e o posto escolhido não é dessa empresa.', _c.num_emp;
  END IF;

  BEGIN _data := (_dados ->> 'data_inicio')::date; EXCEPTION WHEN others THEN _data := NULL; END;
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe a data de início no posto novo.'; END IF;
  IF _data < _hoje - 30 OR _data > _hoje + 90 THEN RAISE EXCEPTION 'A data de início tem que ser entre 30 dias atrás e 90 dias à frente.'; END IF;
  IF _motivo IS NULL THEN RAISE EXCEPTION 'Informe o motivo da troca.'; END IF;
  BEGIN _mot_senior := (_dados ->> 'motivo_senior')::smallint; EXCEPTION WHEN others THEN _mot_senior := NULL; END;
  IF _mot_senior IS NULL OR _mot_senior NOT IN (2, 4, 10, 998) THEN RAISE EXCEPTION 'Motivo da Senior inválido.'; END IF;

  IF nullif(_dados ->> 'escala_codigo', '') IS NOT NULL THEN
    _esc := (_dados ->> 'escala_codigo')::integer;
    SELECT max(escala_nome) INTO _esc_nome FROM colaboradores_senior WHERE escala_codigo = _esc;
  END IF;

  INSERT INTO trocas_posto (colaborador_senior_id, num_emp, tip_col, num_cad, colaborador_nome, cargo, uf,
    posto_atual_estrutura, posto_atual_codigo, posto_atual_descricao, escala_atual_codigo, escala_atual_nome, local_atual,
    posto_novo_estrutura, posto_novo_codigo, posto_novo_descricao, escala_nova_codigo, escala_nova_nome,
    data_inicio, motivo, observacao, solicitante_id, solicitante_nome,
    motivo_senior, manter_cargo, cargo_atual_codigo, centro_custo_atual, padrao_posto)
  VALUES (_c.id, _c.num_emp, _c.tip_col, _c.num_cad, _c.nome, _c.cargo, _c.uf,
    _c.posto_estrutura, _c.posto_codigo, _c.posto_descricao, _c.escala_codigo, _c.escala_nome, _c.nome_local,
    _est, _cod, _desc, _esc, _esc_nome,
    _data, left(_motivo, 120), nullif(left(trim(coalesce(_dados ->> 'observacao', '')), 500), ''),
    public.current_profile_id(), public._tp_nome_usuario(),
    _mot_senior, coalesce((_dados ->> 'manter_cargo')::boolean, false), _c.cod_cargo,
    nullif(concat_ws(' - ', _c.cod_centro_custo, _c.centro_custo), ''),
    CASE WHEN jsonb_typeof(_dados -> 'padrao_posto') = 'object' THEN _dados -> 'padrao_posto' END)
  RETURNING * INTO _t;
  RETURN jsonb_build_object('id', _t.id, 'codigo', _t.codigo);
END $$;

-- Aprovar (true) ou recusar (false). Recusa pede o motivo.
CREATE OR REPLACE FUNCTION public.troca_posto_decidir(_id uuid, _aprovar boolean, _obs text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.trocas_posto;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'edit') THEN RAISE EXCEPTION 'Sem permissão para aprovar troca de posto.'; END IF;
  SELECT * INTO _t FROM trocas_posto WHERE id = _id FOR UPDATE;
  IF _t.id IS NULL OR (_t.uf IS NOT NULL AND NOT public.pode_acessar_uf(_t.uf)) THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF _t.status <> 'pendente' THEN RAISE EXCEPTION 'Esta solicitação já foi %.', _t.status; END IF;
  IF NOT _aprovar AND nullif(trim(coalesce(_obs, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da recusa.'; END IF;
  UPDATE trocas_posto SET status = CASE WHEN _aprovar THEN 'aprovada' ELSE 'recusada' END,
    decidido_por = public.current_profile_id(), decidido_nome = public._tp_nome_usuario(), decidido_em = now(),
    decisao_obs = nullif(left(trim(coalesce(_obs, '')), 500), '')
  WHERE id = _id;
END $$;

-- Cancelar uma pendente: quem pediu ou quem aprova.
CREATE OR REPLACE FUNCTION public.troca_posto_cancelar(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.trocas_posto;
BEGIN
  SELECT * INTO _t FROM trocas_posto WHERE id = _id FOR UPDATE;
  IF _t.id IS NULL OR (_t.uf IS NOT NULL AND NOT public.pode_acessar_uf(_t.uf)) THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF NOT (public.has_permission(public.current_profile_id(), 'troca_posto', 'edit')
          OR (_t.solicitante_id = public.current_profile_id() AND public.has_permission(public.current_profile_id(), 'troca_posto', 'create'))) THEN
    RAISE EXCEPTION 'Só quem pediu ou quem aprova pode cancelar.';
  END IF;
  IF _t.status <> 'pendente' THEN RAISE EXCEPTION 'Só dá para cancelar solicitação pendente.'; END IF;
  UPDATE trocas_posto SET status = 'cancelada', decidido_por = public.current_profile_id(),
    decidido_nome = public._tp_nome_usuario(), decidido_em = now() WHERE id = _id;
END $$;

-- Nomes dos códigos que a Senior aplica com o posto (cargo e centro de custo),
-- tirados dos colaboradores sincronizados.
CREATE OR REPLACE FUNCTION public.troca_posto_nomes(_cargos text[], _centros text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'view') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  RETURN jsonb_build_object(
    'cargos', (SELECT coalesce(jsonb_object_agg(cod_cargo, nome), '{}') FROM (
      SELECT cod_cargo, max(cargo) AS nome FROM colaboradores_senior WHERE cod_cargo = ANY(coalesce(_cargos, '{}')) GROUP BY cod_cargo) x),
    'centros', (SELECT coalesce(jsonb_object_agg(cod_centro_custo, nome), '{}') FROM (
      SELECT cod_centro_custo, max(centro_custo) AS nome FROM colaboradores_senior WHERE cod_centro_custo = ANY(coalesce(_centros, '{}')) GROUP BY cod_centro_custo) x));
END $$;

-- Só administrador manda para a Senior (ou a função da VM, com o service role).
CREATE OR REPLACE FUNCTION public._tp_pode_senior()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = public.current_profile_id() AND role = 'admin')
$$;

-- Resultado do envio/desfazer na Senior. _erro null = deu certo. _lido = situação relida na Senior.
-- _quem: nome de quem clicou (a função da VM informa; no localhost vem do usuário logado).
CREATE OR REPLACE FUNCTION public.troca_posto_registrar_senior(_id uuid, _acao text, _erro text, _lido jsonb, _quem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t public.trocas_posto;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _nome text := coalesce(nullif(_quem, ''), public._tp_nome_usuario(), 'sistema');
BEGIN
  IF NOT public._tp_pode_senior() THEN RAISE EXCEPTION 'Só administrador pode enviar à Senior.'; END IF;
  SELECT * INTO _t FROM trocas_posto WHERE id = _id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;

  IF _acao = 'enviar' THEN
    IF _t.status NOT IN ('aprovada', 'erro_envio') THEN RAISE EXCEPTION 'Só troca aprovada vai para a Senior (esta está %).', _t.status; END IF;
    UPDATE trocas_posto SET status = CASE WHEN _erro IS NULL THEN 'enviada' ELSE 'erro_envio' END,
      senior_enviado_em = CASE WHEN _erro IS NULL THEN now() ELSE senior_enviado_em END,
      senior_enviado_por = _nome, senior_resposta = coalesce(left(_erro, 1000), 'Gravada na Senior.'), senior_lido = _lido
    WHERE id = _id;
    -- Já valendo: atualiza a lista local na hora (a sincronização com a Senior confirma depois).
    IF _erro IS NULL AND _t.data_inicio <= _hoje AND _t.colaborador_senior_id IS NOT NULL THEN
      UPDATE colaboradores_senior SET posto_estrutura = _t.posto_novo_estrutura, posto_codigo = _t.posto_novo_codigo,
        posto_descricao = _t.posto_novo_descricao,
        escala_codigo = coalesce(_t.escala_nova_codigo, escala_codigo),
        escala_nome = CASE WHEN _t.escala_nova_codigo IS NULL THEN escala_nome ELSE _t.escala_nova_nome END
      WHERE id = _t.colaborador_senior_id;
    END IF;
  ELSIF _acao = 'desfazer' THEN
    IF _t.status <> 'enviada' THEN RAISE EXCEPTION 'Só dá para desfazer troca já gravada na Senior.'; END IF;
    IF _erro IS NULL THEN
      UPDATE trocas_posto SET status = 'desfeita', senior_desfeito_em = now(), senior_lido = _lido,
        senior_resposta = 'Desfeita na Senior por ' || _nome || '.' WHERE id = _id;
      IF _t.colaborador_senior_id IS NOT NULL THEN
        UPDATE colaboradores_senior SET posto_estrutura = _t.posto_atual_estrutura, posto_codigo = _t.posto_atual_codigo,
          posto_descricao = _t.posto_atual_descricao, escala_codigo = _t.escala_atual_codigo, escala_nome = _t.escala_atual_nome
        WHERE id = _t.colaborador_senior_id AND posto_codigo = _t.posto_novo_codigo;
      END IF;
    ELSE
      UPDATE trocas_posto SET senior_resposta = 'Erro ao desfazer: ' || left(_erro, 900) WHERE id = _id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;
  RETURN (SELECT to_jsonb(x) FROM trocas_posto x WHERE x.id = _id);
END $$;

REVOKE ALL ON FUNCTION public.troca_posto_nomes(text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._tp_pode_senior() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_registrar_senior(uuid, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.troca_posto_nomes(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._tp_pode_senior() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.troca_posto_registrar_senior(uuid, text, text, jsonb, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._tp_nome_usuario() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_buscar_colaborador(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_opcoes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_solicitar(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_decidir(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.troca_posto_cancelar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._tp_nome_usuario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.troca_posto_buscar_colaborador(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.troca_posto_opcoes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.troca_posto_solicitar(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.troca_posto_decidir(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.troca_posto_cancelar(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
