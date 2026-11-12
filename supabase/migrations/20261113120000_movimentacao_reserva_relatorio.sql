-- Movimentação diária, link do fiscal:
--   1. Reserva: colaborador que na Senior está num posto/local de RESERVA
--      (ex.: "RESERVA DF", "RESERVA IGUATEMI VIGILANTE DF") aparece com o
--      selo "Reserva" na busca, no colaborador escolhido e nos lançamentos.
--      A marca é calculada na hora pela Senior (colaboradores_senior), nada é
--      gravado no lançamento.
--   2. Relatório do dia: o fiscal baixa em PDF os SEUS lançamentos de um dia
--      (data informada OU dia em que lançou). Nunca devolve CPF.
-- Re-executável.

CREATE OR REPLACE FUNCTION public._mov_e_reserva(_local text, _posto text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public._pm_sem_acento(coalesce(_local, '') || ' ' || coalesce(_posto, '')) ~ '(^|[^a-z])reserva'
$$;

CREATE OR REPLACE FUNCTION public._mov_colab_json(c public.colaboradores_senior)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('id', c.id, 'nome', c.nome, 'matricula', c.num_cad, 'cargo', c.cargo,
    'local', c.nome_local, 'posto', c.posto_descricao, 'reserva', public._mov_e_reserva(c.nome_local, c.posto_descricao))
$$;

-- Busca de colaborador ativo na Senior (mesma regra de antes + posto e reserva).
CREATE OR REPLACE FUNCTION public._mov_buscar(_sol_matricula integer, _sol_cpf text, _modo text, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _dig text := regexp_replace(coalesce(_busca, ''), '\D', '', 'g');
  _palavras text[];
BEGIN
  IF _modo = 'matricula' THEN
    IF _dig = '' OR length(_dig) > 9 THEN RETURN '[]'::jsonb; END IF;
    RETURN (SELECT coalesce(jsonb_agg(public._mov_colab_json(c) ORDER BY c.nome), '[]')
            FROM colaboradores_senior c WHERE c.ativo AND c.num_cad = _dig::integer);
  ELSIF _modo = 'cpf' THEN
    IF length(_dig) <> 11 THEN RETURN '[]'::jsonb; END IF;
    RETURN (SELECT coalesce(jsonb_agg(public._mov_colab_json(c) ORDER BY c.data_admissao DESC NULLS LAST), '[]')
            FROM colaboradores_senior c WHERE c.ativo AND c.cpf = _dig);
  END IF;
  _palavras := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(coalesce(_busca, ''))), '\s+'), '');
  IF length(array_to_string(_palavras, '')) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(public._mov_colab_json(x) ORDER BY x.nome), '[]')
          FROM (SELECT c.* FROM colaboradores_senior c
                WHERE c.ativo AND (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w)
                ORDER BY c.nome LIMIT 15) x);
END $$;

-- Lançamento no formato do link (lista "Meus lançamentos" e relatório).
CREATE OR REPLACE FUNCTION public._mov_lancamento_json(m public.movimentacoes_diarias)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'codigo', m.codigo, 'criado_em', m.created_at, 'data', m.data_movimentacao,
    'data_lancamento', m.data_lancamento, 'status', m.status, 'empresa', m.empresa,
    'posto', m.posto_nome, 'motivo', m.motivo, 'justificativa', m.justificativa,
    'falta_nome', m.falta_nome, 'falta_matricula', m.falta_matricula,
    'falta_reserva', coalesce((SELECT public._mov_e_reserva(c.nome_local, c.posto_descricao) FROM colaboradores_senior c WHERE c.id = m.falta_senior_id), false),
    'cobertura_nome', m.cobertura_nome, 'cobertura_matricula', m.cobertura_matricula,
    'cobertura_reserva', coalesce((SELECT public._mov_e_reserva(c.nome_local, c.posto_descricao) FROM colaboradores_senior c WHERE c.id = m.cobertura_senior_id), false),
    'horario', m.horario, 'turno', m.turno, 'cobertura_por_extra', m.cobertura_por_extra,
    'ocorrencias', m.ocorrencias_plantao, 'ok_pelo_plantao', m.ok_pelo_plantao)
$$;

CREATE OR REPLACE FUNCTION public._mov_lancamentos_do_fiscal(_fiscal uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(public._mov_lancamento_json(m) ORDER BY m.created_at DESC), '[]')
  FROM (SELECT * FROM movimentacoes_diarias WHERE fiscal_senior_id = _fiscal
        ORDER BY created_at DESC LIMIT 40) m
$$;

-- Relatório do dia: lançamentos do fiscal com a data informada = _data
-- ou feitos em _data (Brasília).
CREATE OR REPLACE FUNCTION public._mov_relatorio_dia(_sol_matricula integer, _sol_cpf text, _data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
BEGIN
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe o dia do relatório.'; END IF;
  RETURN jsonb_build_object(
    'fiscal', jsonb_build_object('nome', _s.nome, 'matricula', _s.num_cad, 'cargo', _s.cargo),
    'data', _data,
    'gerado_em', now(),
    'lancamentos', (SELECT coalesce(jsonb_agg(public._mov_lancamento_json(m) ORDER BY m.data_movimentacao, m.created_at), '[]')
                    FROM movimentacoes_diarias m
                    WHERE m.fiscal_senior_id = _s.id AND (m.data_movimentacao = _data OR m.data_lancamento = _data)));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_relatorio_dia(_sol_matricula integer, _sol_cpf text, _data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._mov_relatorio_dia(_sol_matricula, _sol_cpf, _data);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

REVOKE ALL ON FUNCTION public._mov_colab_json(public.colaboradores_senior) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_lancamento_json(public.movimentacoes_diarias) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_buscar(integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_lancamentos_do_fiscal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_relatorio_dia(integer, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.movimentacao_relatorio_dia(integer, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.movimentacao_relatorio_dia(integer, text, date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
