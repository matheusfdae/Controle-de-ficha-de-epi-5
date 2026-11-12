-- DADOS FICTÍCIOS para a aba "Relatório" do link do fiscal (só no banco de teste).
-- O relatório mostra só os lançamentos do PRÓPRIO fiscal, então estes vão no
-- nome de quem entra no link: por padrão, o último fiscal que fez um lançamento
-- de verdade. Para escolher outro, ponha a matrícula em _fiscal_matricula.
-- Cria lançamentos de HOJE e de ONTEM, com faltas/coberturas de colaboradores
-- reais da Senior (alguns da RESERVA), 2 divergentes, 1 sem cobertura e 1 OK
-- pelo plantão. Código 'DEMO-R...': sai com apagar.sql. Rodar de novo refaz.
DO $$
DECLARE
  _fiscal_matricula integer := NULL;  -- ex.: 1013015
  _f colaboradores_senior;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _comuns uuid[]; _reservas uuid[]; _postos uuid[];
  _horarios text[] := ARRAY['07:00 AS 19:00', '08:00 AS 20:00', '19:00 AS 07:00', '10:00 AS 22:00'];
  _i int; _dia date; _lanc date; _falta uuid; _cob uuid; _posto uuid; _hor text; _sem bool;
  _fa colaboradores_senior; _co colaboradores_senior; _pn text;
BEGIN
  IF _fiscal_matricula IS NOT NULL THEN
    SELECT * INTO _f FROM colaboradores_senior WHERE ativo AND num_cad = _fiscal_matricula ORDER BY data_admissao DESC NULLS LAST LIMIT 1;
  ELSE
    SELECT c.* INTO _f FROM movimentacoes_diarias m JOIN colaboradores_senior c ON c.id = m.fiscal_senior_id
    WHERE m.codigo NOT LIKE 'DEMO-%' ORDER BY m.created_at DESC LIMIT 1;
  END IF;
  IF _f.id IS NULL THEN
    RAISE EXCEPTION 'Fiscal não encontrado. Faça um lançamento pelo link antes, ou preencha _fiscal_matricula.';
  END IF;

  DELETE FROM movimentacoes_diarias WHERE codigo LIKE 'DEMO-R%';

  SELECT array_agg(id) INTO _comuns FROM (SELECT id FROM colaboradores_senior
    WHERE ativo AND id <> _f.id AND coalesce(nome_local, '') !~* 'reserva' ORDER BY random() LIMIT 30) x;
  SELECT array_agg(id) INTO _reservas FROM (SELECT id FROM colaboradores_senior
    WHERE ativo AND id <> _f.id AND (coalesce(nome_local, '') || ' ' || coalesce(posto_descricao, '')) ~* 'reserva'
    ORDER BY random() LIMIT 6) x;
  SELECT array_agg(id) INTO _postos FROM (SELECT id FROM postos WHERE ativo AND uf = 'DF' ORDER BY random() LIMIT 12) x;

  FOR _i IN 1 .. 14 LOOP
    -- 1-9: hoje; 10-12: ontem; 13-14: dia de ontem lançado HOJE (divergente).
    _dia := CASE WHEN _i <= 9 THEN _hoje ELSE _hoje - 1 END;
    _lanc := CASE WHEN _i BETWEEN 10 AND 12 THEN _hoje - 1 ELSE _hoje END;
    _sem := _i = 6;
    _falta := CASE WHEN _i IN (3, 11) AND _reservas IS NOT NULL THEN _reservas[1 + (_i % array_length(_reservas, 1))]
                   ELSE _comuns[_i] END;
    _cob := CASE WHEN _sem THEN NULL
                 WHEN _i IN (2, 5, 8, 12, 13) AND _reservas IS NOT NULL THEN _reservas[1 + ((_i + 1) % array_length(_reservas, 1))]
                 ELSE _comuns[15 + _i] END;
    SELECT * INTO _fa FROM colaboradores_senior WHERE id = _falta;
    SELECT * INTO _co FROM colaboradores_senior WHERE id = _cob;
    _posto := CASE WHEN _postos IS NULL THEN NULL ELSE _postos[1 + (_i % array_length(_postos, 1))] END;
    SELECT nome INTO _pn FROM postos WHERE id = _posto;
    _hor := _horarios[1 + (_i % array_length(_horarios, 1))];

    INSERT INTO movimentacoes_diarias (
      codigo, created_at, data_movimentacao, data_lancamento, status, empresa, uf,
      fiscal_senior_id, fiscal_matricula, fiscal_nome,
      falta_senior_id, falta_matricula, falta_nome, cobertura_senior_id, cobertura_matricula, cobertura_nome,
      posto_id, posto_nome, motivo, justificativa, horario, turno, cobertura_por_extra, ocorrencias_plantao,
      ok_pelo_plantao, email_avisado_em)
    VALUES (
      'DEMO-R' || lpad(_i::text, 4, '0'),
      least((_lanc + time '07:10' + _i * interval '47 minutes') AT TIME ZONE 'America/Sao_Paulo', now() - interval '2 minutes'),
      _dia, _lanc,
      CASE WHEN _i IN (13, 14) THEN 'divergente' ELSE 'ok' END,
      CASE WHEN _i % 5 = 0 THEN 'APOIO' ELSE 'MATRIZ' END, 'DF',
      _f.id, _f.num_cad::text, _f.nome,
      _fa.id, coalesce(_fa.num_cad::text, '0'), coalesce(_fa.nome, 'COLABORADOR DEMO'),
      _co.id, _co.num_cad::text, _co.nome,
      _posto, coalesce(_pn, 'POSTO DEMO'),
      CASE WHEN _i IN (4, 10) THEN 'TREINAMENTO' WHEN _i = 7 THEN 'REFORÇO' ELSE 'FALTA' END,
      CASE WHEN _i IN (13, 14) THEN 'Lançado no dia seguinte: sem sinal no posto (DEMO)' END,
      _hor, CASE WHEN split_part(_hor, ':', 1)::int >= 18 THEN 'NOTURNO' ELSE 'DIURNO' END,
      NOT _sem AND _i % 2 = 0, (_i % 4)::smallint,
      false,  -- o "OK pelo plantão" é o 9, ajustado abaixo
      CASE WHEN _i IN (13, 14) THEN now() END);
  END LOOP;
  -- Um OK pelo plantão (noturno que lançou depois da meia-noite com a data de ontem).
  UPDATE movimentacoes_diarias SET ok_pelo_plantao = true, data_movimentacao = _hoje - 1,
         horario = '19:00 AS 07:00', turno = 'NOTURNO'
  WHERE codigo = 'DEMO-R0009';

  RAISE NOTICE 'Relatório fictício criado para % (matrícula %): 14 lançamentos (hoje e ontem).', _f.nome, _f.num_cad;
END $$;

SELECT fiscal_nome, data_lancamento, count(*) FROM movimentacoes_diarias WHERE codigo LIKE 'DEMO-R%'
GROUP BY 1, 2 ORDER BY 2;
