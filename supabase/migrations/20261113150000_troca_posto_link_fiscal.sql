-- Troca de posto pelo link do fiscal (/movimentacao-diaria).
--
-- O fiscal, já identificado no link (matrícula ou CPF, mesma trava de
-- tentativas do crachá), pede a troca de posto de um colaborador: aba "Troca
-- de posto". O pedido cai na mesma fila da tela interna (/troca-posto), onde
-- quem tem "editar" aprova ou recusa e o administrador envia à Senior.
--
-- As regras do pedido ficam numa função só (_tp_inserir), usada pela tela
-- interna e pelo link: colaborador ativo, uma pendente por colaborador, posto
-- da MESMA EMPRESA, data entre -30 e +90 dias, motivo.
-- Pelo link: só colaboradores do estado do fiscal; sem escala nova e sem
-- "manter cargo" (o padrão do posto aparece para quem aprova).
-- Re-executável.

ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS solicitante_senior_id uuid
  REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trocas_posto_fiscal ON public.trocas_posto (solicitante_senior_id, created_at DESC)
  WHERE solicitante_senior_id IS NOT NULL;

-- ---------- Regras do pedido (uma só, para a tela e para o link) ----------
CREATE OR REPLACE FUNCTION public._tp_inserir(_dados jsonb, _sol_profile uuid, _sol_nome text, _sol_senior uuid)
RETURNS public.trocas_posto LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  BEGIN SELECT * INTO _c FROM colaboradores_senior WHERE id = (_dados ->> 'colaborador_senior_id')::uuid AND ativo;
  EXCEPTION WHEN invalid_text_representation THEN _c := NULL; END;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado (ou inativo) na Senior.'; END IF;
  IF EXISTS (SELECT 1 FROM trocas_posto WHERE colaborador_senior_id = _c.id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Já existe uma troca pendente para este colaborador.';
  END IF;

  BEGIN _est := (_dados ->> 'posto_estrutura')::integer; EXCEPTION WHEN others THEN _est := NULL; END;
  IF _est IS NULL OR _cod IS NULL THEN RAISE EXCEPTION 'Escolha o posto novo.'; END IF;
  SELECT max(posto_descricao) INTO _desc FROM colaboradores_senior WHERE posto_estrutura = _est AND posto_codigo = _cod;
  IF _est = _c.posto_estrutura AND _cod = _c.posto_codigo THEN RAISE EXCEPTION 'O posto novo é o mesmo posto atual.'; END IF;
  -- Só dentro da MESMA EMPRESA (estrutura de postos igual e alguém da empresa lotado no posto).
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
    BEGIN _esc := (_dados ->> 'escala_codigo')::integer; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Escala inválida.'; END;
    SELECT max(escala_nome) INTO _esc_nome FROM colaboradores_senior WHERE escala_codigo = _esc;
  END IF;

  INSERT INTO trocas_posto (colaborador_senior_id, num_emp, tip_col, num_cad, colaborador_nome, cargo, uf,
    posto_atual_estrutura, posto_atual_codigo, posto_atual_descricao, escala_atual_codigo, escala_atual_nome, local_atual,
    posto_novo_estrutura, posto_novo_codigo, posto_novo_descricao, escala_nova_codigo, escala_nova_nome,
    data_inicio, motivo, observacao, solicitante_id, solicitante_nome, solicitante_senior_id,
    motivo_senior, manter_cargo, cargo_atual_codigo, centro_custo_atual, padrao_posto)
  VALUES (_c.id, _c.num_emp, _c.tip_col, _c.num_cad, _c.nome, _c.cargo, _c.uf,
    _c.posto_estrutura, _c.posto_codigo, _c.posto_descricao, _c.escala_codigo, _c.escala_nome, _c.nome_local,
    _est, _cod, _desc, _esc, _esc_nome,
    _data, left(_motivo, 120), nullif(left(trim(coalesce(_dados ->> 'observacao', '')), 500), ''),
    _sol_profile, _sol_nome, _sol_senior,
    _mot_senior, coalesce((_dados ->> 'manter_cargo')::boolean, false), _c.cod_cargo,
    nullif(concat_ws(' - ', _c.cod_centro_custo, _c.centro_custo), ''),
    CASE WHEN jsonb_typeof(_dados -> 'padrao_posto') = 'object' THEN _dados -> 'padrao_posto' END)
  RETURNING * INTO _t;
  RETURN _t;
END $$;
REVOKE ALL ON FUNCTION public._tp_inserir(jsonb, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Tela interna: mesma assinatura de antes, agora usando as regras de _tp_inserir.
CREATE OR REPLACE FUNCTION public.troca_posto_solicitar(_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uf text;
  _t public.trocas_posto;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'troca_posto', 'create') THEN RAISE EXCEPTION 'Sem permissão para pedir troca de posto.'; END IF;
  BEGIN SELECT uf INTO _uf FROM colaboradores_senior WHERE id = (_dados ->> 'colaborador_senior_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN _uf := NULL; END;
  IF _uf IS NOT NULL AND NOT public.pode_acessar_uf(_uf) THEN RAISE EXCEPTION 'Sem acesso ao estado deste colaborador.'; END IF;
  _t := public._tp_inserir(_dados, public.current_profile_id(), public._tp_nome_usuario(), NULL);
  RETURN jsonb_build_object('id', _t.id, 'codigo', _t.codigo);
END $$;

-- ---------- Link do fiscal ----------
-- Colaborador está no estado do fiscal (fiscal sem estado vê todos).
CREATE OR REPLACE FUNCTION public._tp_do_estado(_s public.colaboradores_senior, _uf text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _s.uf IS NULL OR _uf IS NULL OR _uf = _s.uf
$$;

CREATE OR REPLACE FUNCTION public._tp_fiscal_minhas(_fiscal uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'codigo', t.codigo, 'criado_em', t.created_at, 'status', t.status,
           'colaborador_nome', t.colaborador_nome, 'matricula', t.num_cad,
           'posto_atual', t.posto_atual_descricao, 'posto_atual_codigo', t.posto_atual_codigo,
           'posto_novo', t.posto_novo_descricao, 'posto_novo_codigo', t.posto_novo_codigo,
           'data_inicio', t.data_inicio, 'motivo', t.motivo, 'decisao_obs', t.decisao_obs)
         ORDER BY t.created_at DESC), '[]')
  FROM (SELECT * FROM trocas_posto WHERE solicitante_senior_id = _fiscal ORDER BY created_at DESC LIMIT 30) t
$$;

-- Busca por nome (3+ letras), matrícula ou CPF: ativos do estado do fiscal, com o posto atual. Nunca devolve CPF.
CREATE OR REPLACE FUNCTION public._tp_fiscal_buscar(_sol_matricula integer, _sol_cpf text, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _t text := trim(coalesce(_busca, ''));
  _dig text := regexp_replace(coalesce(_busca, ''), '\D', '', 'g');
  _palavras text[] := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(coalesce(_busca, ''))), '\s+'), '');
BEGIN
  IF _t ~ '^[\d.\-\s]+$' THEN
    IF _dig = '' OR (length(_dig) > 9 AND length(_dig) <> 11) THEN RETURN '[]'::jsonb; END IF;
  ELSIF length(array_to_string(_palavras, '')) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', x.id, 'nome', x.nome, 'matricula', x.num_cad, 'num_emp', x.num_emp, 'tip_col', x.tip_col,
            'cargo', x.cargo, 'uf', x.uf, 'local', x.nome_local, 'empresa', x.empresa_nome,
            'posto_estrutura', x.posto_estrutura, 'posto_codigo', x.posto_codigo, 'posto_descricao', x.posto_descricao,
            'escala_codigo', x.escala_codigo, 'escala_nome', x.escala_nome,
            'pendente', (SELECT t.codigo FROM trocas_posto t WHERE t.colaborador_senior_id = x.id AND t.status = 'pendente'))
          ORDER BY x.nome), '[]')
          FROM (SELECT c.* FROM colaboradores_senior c
                WHERE c.ativo AND public._tp_do_estado(_s, c.uf)
                  AND CASE
                        WHEN _t ~ '^[\d.\-\s]+$' AND length(_dig) = 11 THEN c.cpf = _dig
                        WHEN _t ~ '^[\d.\-\s]+$' THEN c.num_cad = _dig::integer
                        ELSE (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w)
                      END
                ORDER BY c.nome LIMIT 15) x);
END $$;

-- Postos que servem para o colaborador: mesma empresa e estrutura, no estado dele (ou do fiscal), menos o atual.
CREATE OR REPLACE FUNCTION public._tp_fiscal_postos(_sol_matricula integer, _sol_cpf text, _colaborador uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _c public.colaboradores_senior;
BEGIN
  SELECT * INTO _c FROM colaboradores_senior WHERE id = _colaborador AND ativo;
  IF _c.id IS NULL OR NOT public._tp_do_estado(_s, _c.uf) THEN RAISE EXCEPTION 'Colaborador não encontrado.'; END IF;
  IF _c.posto_estrutura IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'estrutura', p.posto_estrutura, 'codigo', p.posto_codigo, 'descricao', p.descricao,
            'uf', p.uf, 'colaboradores', p.qtd, 'empresas', to_jsonb(ARRAY[_c.num_emp]))
          ORDER BY p.descricao NULLS LAST, p.posto_codigo), '[]')
          FROM (SELECT x.posto_estrutura, x.posto_codigo, max(x.posto_descricao) AS descricao,
                       mode() WITHIN GROUP (ORDER BY x.uf) AS uf, count(*) AS qtd
                FROM colaboradores_senior x
                WHERE x.ativo AND x.num_emp = _c.num_emp AND x.posto_estrutura = _c.posto_estrutura
                  AND x.posto_codigo IS NOT NULL AND x.posto_codigo <> coalesce(_c.posto_codigo, '')
                  AND (coalesce(_c.uf, _s.uf) IS NULL OR x.uf IS NULL OR x.uf = coalesce(_c.uf, _s.uf))
                GROUP BY x.posto_estrutura, x.posto_codigo) p);
END $$;

CREATE OR REPLACE FUNCTION public._tp_fiscal_solicitar(_sol_matricula integer, _sol_cpf text, _dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _uf text;
  _t public.trocas_posto;
BEGIN
  -- Trava contra envio em massa: 10 pedidos por fiscal por hora.
  IF (SELECT count(*) FROM trocas_posto WHERE solicitante_senior_id = _s.id AND created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Muitos pedidos em pouco tempo. Aguarde e tente de novo.';
  END IF;
  BEGIN SELECT uf INTO _uf FROM colaboradores_senior WHERE id = (_dados ->> 'colaborador_senior_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Escolha o colaborador.'; END;
  IF NOT public._tp_do_estado(_s, _uf) THEN RAISE EXCEPTION 'Colaborador de outro estado.'; END IF;
  -- Pelo link: sem escala nova e sem manter cargo; padrão do posto é lido por quem aprova.
  _t := public._tp_inserir(
    (_dados - 'escala_codigo' - 'padrao_posto') || jsonb_build_object('manter_cargo', false),
    NULL, left(_s.nome, 120) || ' (fiscal, pelo link)', _s.id);
  RETURN jsonb_build_object('ok', true, 'codigo', _t.codigo, 'minhas', public._tp_fiscal_minhas(_s.id));
END $$;

CREATE OR REPLACE FUNCTION public._tp_fiscal_listar(_sol_matricula integer, _sol_cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
BEGIN
  RETURN public._tp_fiscal_minhas(_s.id);
END $$;

-- Públicas (anon): mesmo padrão de erro do link ({erro: ...}).
CREATE OR REPLACE FUNCTION public.movimentacao_troca_buscar(_sol_matricula integer, _sol_cpf text, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._tp_fiscal_buscar(_sol_matricula, _sol_cpf, _busca);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_troca_postos(_sol_matricula integer, _sol_cpf text, _colaborador uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._tp_fiscal_postos(_sol_matricula, _sol_cpf, _colaborador);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_troca_solicitar(_sol_matricula integer, _sol_cpf text, _dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._tp_fiscal_solicitar(_sol_matricula, _sol_cpf, _dados);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('erro', 'Já existe uma troca pendente para este colaborador.');
  WHEN SQLSTATE 'P0401' OR raise_exception OR check_violation OR invalid_text_representation THEN
    RETURN public._cracha_erro(SQLSTATE, CASE WHEN SQLSTATE = '23514' THEN 'Algum campo tem valor inválido.' ELSE SQLERRM END,
      public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_troca_minhas(_sol_matricula integer, _sol_cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._tp_fiscal_listar(_sol_matricula, _sol_cpf);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

REVOKE ALL ON FUNCTION public._tp_do_estado(public.colaboradores_senior, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tp_fiscal_minhas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tp_fiscal_buscar(integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tp_fiscal_postos(integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tp_fiscal_solicitar(integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tp_fiscal_listar(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_troca_buscar(integer, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_troca_postos(integer, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_troca_solicitar(integer, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_troca_minhas(integer, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
