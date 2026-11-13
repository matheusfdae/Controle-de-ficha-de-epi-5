-- DADOS FICTÍCIOS da Troca de Posto (SÓ no banco de teste; NUNCA na produção).
-- Cria 6 solicitações com colaboradores reais da Senior (sorteados): 3 pendentes,
-- 1 aprovada, 1 recusada e 1 cancelada. Código 'TP-DEMO..'. Sai com apagar.sql.
-- ⚠️ NÃO clique em "Enviar à Senior" numa troca DEMO: o colaborador é REAL.
-- Rodar de novo refaz.
DO $$
DECLARE
  _c record;
  _p record;
  _i int := 0;
  _st text;
  _motivos text[] := ARRAY['Remanejamento operacional', 'Pedido do cliente', 'Pedido do colaborador',
                           'Cobertura definitiva', 'Encerramento do posto', 'Abertura de posto'];
BEGIN
  DELETE FROM trocas_posto WHERE codigo LIKE 'TP-DEMO%';
  FOR _c IN
    SELECT * FROM colaboradores_senior c
    WHERE c.ativo AND c.posto_codigo IS NOT NULL AND c.posto_estrutura IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM trocas_posto t WHERE t.colaborador_senior_id = c.id AND t.status = 'pendente')
    ORDER BY random() LIMIT 6
  LOOP
    _i := _i + 1;
    -- Posto novo: outro posto do mesmo estado (o mais cheio que não seja o atual, com um pouco de sorteio).
    SELECT x.posto_estrutura, x.posto_codigo, max(x.posto_descricao) AS descricao INTO _p
    FROM colaboradores_senior x
    WHERE x.ativo AND x.posto_codigo IS NOT NULL AND x.posto_estrutura IS NOT NULL
      AND (x.uf IS NOT DISTINCT FROM _c.uf)
      AND NOT (x.posto_estrutura = _c.posto_estrutura AND x.posto_codigo = _c.posto_codigo)
    GROUP BY x.posto_estrutura, x.posto_codigo
    ORDER BY random() LIMIT 1;
    CONTINUE WHEN _p.posto_codigo IS NULL;
    _st := CASE WHEN _i <= 3 THEN 'pendente' WHEN _i = 4 THEN 'aprovada' WHEN _i = 5 THEN 'recusada' ELSE 'cancelada' END;

    INSERT INTO trocas_posto (codigo, created_at, status, colaborador_senior_id, num_emp, tip_col, num_cad, colaborador_nome, cargo, uf,
      posto_atual_estrutura, posto_atual_codigo, posto_atual_descricao, escala_atual_codigo, escala_atual_nome, local_atual,
      posto_novo_estrutura, posto_novo_codigo, posto_novo_descricao, escala_nova_codigo, escala_nova_nome,
      data_inicio, motivo, observacao, solicitante_nome, decidido_nome, decidido_em, decisao_obs,
      motivo_senior, cargo_atual_codigo)
    VALUES ('TP-DEMO' || lpad(_i::text, 3, '0'), now() - (_i * interval '5 hours'), _st,
      _c.id, _c.num_emp, _c.tip_col, _c.num_cad, _c.nome, _c.cargo, _c.uf,
      _c.posto_estrutura, _c.posto_codigo, _c.posto_descricao, _c.escala_codigo, _c.escala_nome, _c.nome_local,
      _p.posto_estrutura, _p.posto_codigo, _p.descricao, NULL, NULL,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date + (_i % 4) + 1,
      _motivos[_i], CASE WHEN _i IN (2, 5) THEN 'Fictício (DEMO): pedido por e-mail do gestor do contrato.' END,
      'Supervisor DEMO',
      CASE WHEN _st <> 'pendente' THEN 'Operacional DEMO' END,
      CASE WHEN _st <> 'pendente' THEN now() - (_i * interval '2 hours') END,
      CASE _st WHEN 'recusada' THEN 'Posto novo sem vaga neste mês (DEMO).' WHEN 'aprovada' THEN 'Ok, lançar na Senior (DEMO).' END,
      CASE WHEN _motivos[_i] ~* 'abertura|encerramento' THEN 4 ELSE 998 END, _c.cod_cargo);
  END LOOP;
  RAISE NOTICE 'Trocas fictícias criadas: %', _i;
END $$;

SELECT codigo, status, colaborador_nome, posto_atual_descricao, posto_novo_descricao, data_inicio
FROM trocas_posto WHERE codigo LIKE 'TP-DEMO%' ORDER BY codigo;
