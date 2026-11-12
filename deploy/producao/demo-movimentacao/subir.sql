-- DADOS FICTÍCIOS do Controle de Movimentação Diária (para apresentação/teste).
-- Só no banco de teste. Tudo fica com código 'DEMO-...' e sai com apagar.sql.
-- Os divergentes já vão marcados como avisados (não disparam e-mail).
-- Pessoas fictícias; postos: sorteados entre os postos ativos do DF.
DO $$
DECLARE
  _fiscais text[] := ARRAY['ANA PAULA SOUZA (DEMO)', 'BRUNO LIMA (DEMO)', 'CARLA MENDES (DEMO)',
                           'DIEGO ROCHA (DEMO)', 'EDUARDA PIRES (DEMO)', 'FÁBIO NUNES (DEMO)'];
  _nomes text[] := ARRAY['Adriana Costa','Alex Ferreira','Bianca Ribeiro','Caio Martins','Daniela Gomes','Edson Araújo',
    'Fernanda Alves','Gabriel Teixeira','Helena Barros','Igor Cardoso','Juliana Moura','Kleber Dias','Larissa Freitas',
    'Marcos Vieira','Natália Rocha','Otávio Pinto','Patrícia Lopes','Rafael Castro','Sabrina Melo','Thiago Ramos',
    'Úrsula Batista','Vinícius Correia','Wagner Santos','Yasmin Carvalho'];
  _horarios text[] := ARRAY['07:00 AS 19:00','07:00 AS 19:00','07:00 AS 19:00','08:00 AS 20:00','10:00 AS 22:00',
    '13:00 AS 01:00','19:00 AS 07:00','19:00 AS 07:00','20:00 AS 08:00','22:00 AS 10:00'];
  _postos record;
  _ids uuid[]; _nomes_postos text[];
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _dia date; _n int; _i int; _seq int := 0;
  _atraso int; _lanc date; _criado timestamptz; _hor text; _motivo text; _sem bool; _fi int;
BEGIN
  SELECT array_agg(id), array_agg(nome) INTO _ids, _nomes_postos
  FROM (SELECT id, nome FROM postos WHERE ativo AND uf = 'DF' ORDER BY random() LIMIT 25) p;
  IF _ids IS NULL THEN
    _ids := ARRAY[NULL::uuid, NULL, NULL, NULL];
    _nomes_postos := ARRAY['POSTO DEMO A','POSTO DEMO B','POSTO DEMO C','RESERVA TÉCNICA'];
  END IF;

  FOR _dia IN SELECT generate_series(_hoje - 44, _hoje, interval '1 day')::date LOOP
    _n := 6 + floor(random() * 9)::int;
    FOR _i IN 1.._n LOOP
      _seq := _seq + 1;
      -- ~8% lançados no dia seguinte (ou 2 dias depois); hoje não tem divergente "do futuro".
      _atraso := CASE WHEN _dia < _hoje AND random() < 0.08 THEN CASE WHEN random() < 0.8 THEN 1 ELSE 2 END ELSE 0 END;
      _lanc := least(_dia + _atraso, _hoje);
      _criado := least(((_lanc + time '07:00' + (random() * interval '14 hours')) AT TIME ZONE 'America/Sao_Paulo'), now() - interval '5 minutes');
      _hor := _horarios[1 + floor(random() * array_length(_horarios, 1))::int];
      _motivo := CASE WHEN random() < 0.78 THEN 'FALTA' WHEN random() < 0.4 THEN 'TREINAMENTO' WHEN random() < 0.6 THEN 'REFORÇO' ELSE 'SDF' END;
      _sem := random() < 0.07;
      _fi := 1 + floor(random() * 6)::int;
      INSERT INTO movimentacoes_diarias (
        codigo, created_at, data_movimentacao, data_lancamento, status, empresa, uf, fiscal_matricula, fiscal_nome,
        falta_matricula, falta_nome, cobertura_matricula, cobertura_nome, posto_id, posto_nome, motivo, justificativa,
        horario, turno, cobertura_por_extra, ocorrencias_plantao, email_avisado_em)
      SELECT 'DEMO-' || lpad(_seq::text, 5, '0'), _criado, _dia, _lanc,
        CASE WHEN _lanc = _dia THEN 'ok' ELSE 'divergente' END,
        CASE WHEN random() < 0.85 THEN 'MATRIZ' ELSE 'APOIO' END, 'DF', (9000000 + _fi)::text, _fiscais[_fi],
        (1000000 + floor(random() * 15000))::int::text, _nomes[1 + floor(random() * 24)::int],
        CASE WHEN _sem THEN NULL ELSE (1000000 + floor(random() * 15000))::int::text END,
        CASE WHEN _sem THEN NULL ELSE _nomes[1 + floor(random() * 24)::int] END,
        _ids[k], _nomes_postos[k], _motivo,
        CASE WHEN _lanc <> _dia THEN 'Lançado depois: sem sinal no posto (DEMO)' END,
        _hor, CASE WHEN split_part(_hor, ':', 1)::int >= 18 THEN 'NOTURNO' ELSE 'DIURNO' END,
        NOT _sem AND random() < 0.55, floor(random() * 5)::smallint,
        CASE WHEN _lanc <> _dia THEN _criado END
      FROM (SELECT 1 + floor(random() * array_length(_ids, 1))::int AS k) s;
    END LOOP;
  END LOOP;
  RAISE NOTICE '% lançamentos fictícios criados', _seq;
END $$;
