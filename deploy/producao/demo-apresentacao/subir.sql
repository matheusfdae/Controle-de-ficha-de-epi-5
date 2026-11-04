-- DADOS DE DEMONSTRAÇÃO para apresentação (pode rodar na produção). Apagar depois com apagar.sql.
--
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < deploy/producao/demo-apresentacao/subir.sql
--
-- O que faz (tudo numa transação; erro = nada gravado):
--   * guarda o estado original em public._demo_apresentacao (avisos por e-mail, numeração
--     dos pedidos, postos escolhidos e o teto deles) para o apagar.sql devolver;
--   * DESLIGA os avisos por e-mail dos pedidos enquanto a demonstração estiver no banco;
--   * cria 15 itens com categoria 'Demonstração' (com preço). Itens reais não são tocados:
--     nem preço, nem lista do posto;
--   * pedidos 'DEMO-…' de junho até hoje em 12 postos ativos, com preço variando por mês
--     (os de novembro com o preço de hoje), entregas parciais, devoluções, cancelados e EPI;
--   * teto mensal nesses 12 postos: em outubro metade passa e metade fica dentro;
--   * lançamentos diários de estoque ('DEMONSTRAÇÃO') em 6 desses postos, de 01/out até hoje.
-- Pode rodar de novo: apaga a demonstração anterior e gera outra nos mesmos postos.

\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS public._demo_apresentacao (chave text PRIMARY KEY, valor jsonb, criado_em timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public._demo_apresentacao FROM PUBLIC, anon, authenticated;

-- Estado original (só na primeira vez).
INSERT INTO public._demo_apresentacao (chave, valor)
VALUES ('avisar_email', to_jsonb(coalesce((SELECT avisar_email FROM public.pedido_config WHERE id = 1), true)))
ON CONFLICT (chave) DO NOTHING;
INSERT INTO public._demo_apresentacao (chave, valor)
VALUES ('numeracao', coalesce((SELECT jsonb_object_agg(ano::text, ultimo) FROM public.pedido_numeracao), '{}'::jsonb))
ON CONFLICT (chave) DO NOTHING;
INSERT INTO public._demo_apresentacao (chave, valor)
SELECT 'postos', jsonb_object_agg(id::text, teto_material) FROM (
  SELECT id, teto_material FROM public.postos WHERE ativo ORDER BY random() LIMIT 12) x
ON CONFLICT (chave) DO NOTHING;

UPDATE public.pedido_config SET avisar_email = false WHERE id = 1;

-- Demonstração anterior.
DELETE FROM public.pedidos_material WHERE solicitante_matricula LIKE 'DEMO-%';
DELETE FROM public.estoque_plantoes WHERE observacao_inicio = 'DEMONSTRAÇÃO';
DELETE FROM public.estoque_posto WHERE material_id IN (SELECT id FROM public.materiais WHERE categoria = 'Demonstração');

-- Itens de demonstração (os que já existem com o mesmo nome ficam de fora).
INSERT INTO public.materiais (nome, unidade, categoria, is_epi, preco, preco_atualizado_em)
SELECT v.nome, v.un, 'Demonstração', v.epi, v.preco, now()
FROM (VALUES ('Detergente neutro 5 L','galão',false,24.90), ('Desinfetante 5 L','galão',false,29.50), ('Água sanitária 5 L','galão',false,14.80),
             ('Saco de lixo 100 L','pct',false,32.40), ('Saco de lixo 60 L','pct',false,21.90), ('Papel higiênico rolão','fardo',false,89.00),
             ('Papel toalha interfolha','fardo',false,64.50), ('Sabonete líquido 5 L','galão',false,38.70), ('Álcool 70% 1 L','un',false,9.90),
             ('Pano de chão','un',false,4.50), ('Esponja dupla face','un',false,1.80), ('Limpa-vidros 500 ml','un',false,12.30),
             ('Luva nitrílica','par',true,3.20), ('Luva de látex','par',true,4.10), ('Máscara descartável','cx',true,18.90)) AS v(nome, un, epi, preco)
WHERE NOT EXISTS (SELECT 1 FROM public.materiais m WHERE m.item_pai_id IS NULL
                  AND lower(regexp_replace(trim(m.nome), '\s+', ' ', 'g')) = lower(v.nome));

DO $demo$
DECLARE
  _postos uuid[];
  _ufs text[];
  _mats uuid[];
  _epis uuid[];
  _n int;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _d date; _i int; _k int;
  _prob numeric; _alvo text; _status text;
  _t0 timestamptz; _tdev timestamptz; _treenv timestamptz; _tconf timestamptz; _tatend timestamptz;
  _devolve boolean; _parcial boolean;
  _pid uuid; _num int; _ano int;
  _q numeric; _qc numeric; _qa numeric;
  _nomes text[] := ARRAY['Maria Aparecida Souza','José Carlos Lima','Ana Paula Ferreira','Francisco Oliveira','Luciana Santos',
                         'Antônio Pereira','Juliana Rodrigues','Paulo Henrique Alves','Sandra Costa','Marcos Vinícius Rocha'];
  _sup text[] := ARRAY['Carlos Supervisor','Renata Supervisora','Diego Supervisor'];
  _comp text[] := ARRAY['Compras DF','Patrícia (Compras)','Rafael (Compras)'];
  _sol text;
  -- estoque
  _foto text := 'data:image/jpeg;base64,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szjv7T1D/n+uf+/rf40f2nqH/P8AXP8A39b/ABrsf+EH0z/nvd/99r/8TR/wg+mf897v/vtf/iaOZBZnHf2nqH/P9c/9/W/xra8D/wDIZm/692/9CWtf/hB9M/573f8A32v/AMTV3SvDlnpF01xbyTs7IUIkYEYyD2A9KTkrAkzWooorMsKKKKACqOtf8gmb/gP/AKEKvVFdW6Xdu0EhYK2MlevBzTW4jkEmljGEldR1wrEUv2q4/wCe8v8A32a3v+EetP8AnpN/30P8KP8AhHrT/npN/wB9D/Cr5kTZmD9quP8AnvL/AN9mj7Vcf895f++zW9/wj1p/z0m/76H+FH/CPWn/AD0m/wC+h/hRzILMwftVx/z3l/77NH2q4/57y/8AfZre/wCEetP+ek3/AH0P8KP+EetP+ek3/fQ/wo5kFmYP2q4/57y/99mj7Vcf895f++zW9/wj1p/z0m/76H+FH/CPWn/PSb/vof4UcyCzKPh3/j/f/rkf5iujqlZaVBYzGWJ5CxXb8xGP5e1Xahu7KQUUUUhhRRRQBkeK/wDkW7v/AIB/6Gtefw3l1boUguZolJyQjlRn8K9P1Cxi1KxktJmdY5MZKEA8EHv9KxP+EH0z/nvd/wDfa/8AxNXFpIlo47+09Q/5/rn/AL+t/jR/aeof8/1z/wB/W/xrsf8AhB9M/wCe93/32v8A8TR/wg+mf897v/vtf/iarmQrM47+09Q/5/rn/v63+NH9p6h/z/XP/f1v8a7H/hB9M/573f8A32v/AMTR/wAIPpn/AD3u/wDvtf8A4mjmQWZx39p6h/z/AFz/AN/W/wAaP7T1D/n+uf8Av63+Ndj/AMIPpn/Pe7/77X/4mj/hB9M/573f/fa//E0cyCzOO/tPUP8An+uf+/rf41teB/8AkMzf9e7f+hLWv/wg+mf897v/AL7X/wCJq7pXhyz0i6a4t5J2dkKESMCMZB7AelJyVgSZrUUUVmWFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/9k=';
  _rub text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABaCAIAAACNE/xKAAAEX0lEQVR4nO2dS3KjMBRFiasXwNB7yP6Xkj1kyA7cA1elXHwF6L17BecMetCpoAfS0ZWE3f31er06ANDxELYNAEgIoIckBBCDhABikBBADBICiEFCADFICCAGCQHEICGAGCQEEIOEAGKQEEAMEgKIQUIAMUgIIAYJAcQgIYAYJAQQg4QAYpAQQAwSAohBQgAxdhL2z291CQA3lvBt4J+HCAl34F9nw6dy6Af3wSUJl6zDxusxWu+Ai4RwQwPx0EjCUWcMvz/D78/ST/NLYqxEPFWerZGEhkN8OlsbFtkc7DhMJZx2zF8GysOQPAx6kqPO7W4/xz08DRRC6EU/0ncv46FewhID88NwvRX8PP9IP/sUD5UStpKBoyMiQw/Nt6zrq1A8dDmYWTdQuDNcqspnxJsfHW0aOPv3vd+NXFDCwr6xXTWZDBTz4/5dvTzc28NsCQ8834Qw3LyslYf989v8uP/APDvc2MNUCT23glNmqzIpdXN0yofv4ZXOcFcPH00YGBqG5YNGPkpmW7Q6PTq51xhsbmQXJ+t83DwD9z4+4ShZP7x1GL5VdvuDwY1U2Rp4SVjFwIgwrFKY6gXm5nF/u+dtQwsejvQ7U6TgdNQkAw8XlnxIMzvXlhz3C1P6fBcPrh6+u6NuPV+v16trp3s+r1bxUgeulrPAXtoElv9KwpQX12Lv9DZrRbyThcUmoc8EVr2w/MFd2G5yhoR6Mnjk4Ur0TU/FvJIwKCuqhGGtoZMWAnsvnpAhaYdtvS4PV9yr2EqUhHE9dF7CuBVyxERz+LKhYzdZjF7aXHTTIRJGz5FnPKxeW90LHluCFl4tYh5Mi6Y+pdFk/aL2hLavBINqq3hYWtfAoD2VanE4BO8Pozd+qUmYP2OVN2G7hYswcOnKFYM6f3rtUxb/FS8uSEJ5J5mc40V8lVGeIQ6dO1TNw6X0i46+wCRMXojuCkPJa73CJpxrq/Xrdelrv+M9fCmvJHTeCk4Jqm3vPL3r0zDCDLEysDtxL8KNX3gSqgwsDMPMMVT+KOI2gSsceBRuBh4rzC39KieheQYmf8yi8LBUYuCxrF75dS1D2b2sb/wc7uhsEsoNXA9Dh4ietmv+0JowcLNI5+iLPR11u70Rqpdan8gNLPyyRRMGdnN56Lnxi0pCk35amtfl5ZWshB0e2ubSznDg7n3UzrfwuN43JHzK2/uNh0xWrGvOwG65SJ+NX30JHdZUs03LP/1QjrykWQ9bNHC2VH/3Ki9H5Xc7WpFajSSrCWtKQwcYJfTP7+bKrnA6anLPzoOpyncg41C9L4Gkf94iDf+FqM+ENcVq7XA3LP4viirMjhurwWRVzGxtn39CGtdJQqZzaJTrJCFTODTKpSR8w5oK2uJSy1GAFrlgEgK0BRICiEFCADFICCAGCQHEICGAGCQEEIOEAGKQEEAMEgKIQUIAMUgIIAYJAcQgIYAYJAQQg4QAYpAQQAwSAohBQgAxSAggBgkBxCAhQKflP5dR/VpXsFH6AAAAAElFTkSuQmCC';
  _itens uuid[]; _saldo numeric[]; _ritmo numeric[];
  _pl uuid; _ini numeric; _rec numeric; _uso numeric; _fim numeric; _dif boolean; _nome_sup text;
BEGIN
  SELECT array_agg(p.id ORDER BY p.nome), array_agg(p.uf ORDER BY p.nome) INTO _postos, _ufs
  FROM public.postos p WHERE p.id::text IN (SELECT jsonb_object_keys(valor) FROM public._demo_apresentacao WHERE chave = 'postos');
  _n := coalesce(array_length(_postos, 1), 0);
  IF _n = 0 THEN RAISE EXCEPTION 'Nenhum posto ativo para a demonstração.'; END IF;
  SELECT array_agg(id ORDER BY nome) FILTER (WHERE NOT is_epi), array_agg(id ORDER BY nome) FILTER (WHERE is_epi)
    INTO _mats, _epis FROM public.materiais WHERE categoria = 'Demonstração' AND ativo;
  IF _mats IS NULL THEN RAISE EXCEPTION 'Sem itens de demonstração.'; END IF;

  -- ---------- Pedidos ----------
  _d := date '2026-06-01';
  WHILE _d <= _hoje LOOP
    FOR _i IN 1.._n LOOP
      _prob := 0.035 + 0.10 * (_n - _i + 1)::numeric / _n;
      IF _d >= _hoje - 35 THEN _prob := _prob * 1.6; END IF;
      IF _d >= date_trunc('month', _hoje)::date THEN _prob := _prob * 5; END IF;
      IF _d >= (date_trunc('month', _hoje) - interval '1 month')::date AND _d < date_trunc('month', _hoje)::date THEN _prob := _prob * 2.5; END IF;
      IF extract(isodow FROM _d) = 7 THEN _prob := _prob * 0.3; END IF;
      CONTINUE WHEN random() > _prob;
      _t0 := (_d + time '07:00' + (random() * interval '10 hours')) AT TIME ZONE 'America/Sao_Paulo';
      CONTINUE WHEN _t0 > now();
      _alvo := CASE WHEN random() < 0.04 THEN 'cancelada' ELSE 'atendida' END;
      _devolve := random() < 0.13;
      _parcial := random() < 0.2;
      _tdev := NULL; _treenv := NULL; _status := 'enviada';
      IF _devolve THEN
        _tdev := _t0 + (0.1 + random() * 0.8) * interval '1 day';
        _treenv := _tdev + (0.1 + random() * 1.0) * interval '1 day';
        IF _tdev <= now() THEN _status := 'devolvida'; END IF;
        IF _treenv <= now() THEN _status := 'enviada'; END IF;
      END IF;
      _tconf := coalesce(_treenv, _t0) + (0.1 + random() * 1.4) * interval '1 day';
      _tatend := _tconf + (0.4 + random() * 3.5) * interval '1 day';
      IF _status = 'enviada' AND _tconf <= now() THEN _status := 'a_atender'; END IF;
      IF _status = 'a_atender' AND _tatend <= now() THEN _status := _alvo; END IF;
      IF _d >= _hoje - 3 AND _status = 'atendida' AND random() < 0.5 THEN _status := 'a_atender'; END IF;

      _ano := extract(year FROM _d)::int;
      INSERT INTO public.pedido_numeracao (ano, ultimo)
      VALUES (_ano, greatest(1, coalesce((SELECT max(numero) FROM public.pedidos_material WHERE ano = _ano), 0) + 1))
      ON CONFLICT (ano) DO UPDATE SET ultimo = greatest(public.pedido_numeracao.ultimo,
        coalesce((SELECT max(numero) FROM public.pedidos_material WHERE ano = _ano), 0)) + 1
      RETURNING ultimo INTO _num;

      _sol := _nomes[1 + floor(random() * array_length(_nomes, 1))::int];
      INSERT INTO public.pedidos_material (ano, numero, posto_id, uf, data_pedido, status, conferida_em, atendida_em, observacao,
        notificado_status, epi_avisado, teto_avisado, solicitante_nome, solicitante_matricula, solicitante_cargo, created_at, updated_at)
      VALUES (_ano, _num, _postos[_i], _ufs[_i], _d, _status,
        CASE WHEN _status IN ('a_atender', 'atendida', 'cancelada') THEN _tconf END,
        CASE WHEN _status = 'atendida' THEN _tatend END,
        CASE WHEN random() < 0.2 THEN 'Reposição do plantão' END,
        _status, true, true, _sol, 'DEMO-' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0'), 'Encarregado(a) de limpeza', _t0, now())
      RETURNING id INTO _pid;

      FOR _k IN SELECT g FROM generate_series(1, array_length(_mats, 1)) g ORDER BY random() LIMIT (2 + floor(random() * 5))::int LOOP
        _q := (1 + floor(random() * 12))::numeric;
        _qc := CASE WHEN random() < 0.15 THEN greatest(1, _q - (1 + floor(random() * 3))) ELSE _q END;
        _qa := CASE WHEN _status <> 'atendida' THEN NULL WHEN _parcial AND random() < 0.5 THEN floor(_qc * (0.4 + random() * 0.5)) ELSE _qc END;
        INSERT INTO public.pedidos_material_itens (pedido_id, material_id, quantidade_pedida, quantidade, quantidade_atendida)
        VALUES (_pid, _mats[_k], _q, _qc, _qa);
      END LOOP;
      IF random() < 0.15 AND _epis IS NOT NULL THEN
        _q := (2 + floor(random() * 10))::numeric;
        INSERT INTO public.pedidos_material_itens (pedido_id, material_id, quantidade_pedida, quantidade, quantidade_atendida)
        VALUES (_pid, _epis[1 + floor(random() * array_length(_epis, 1))::int], _q, _q, CASE WHEN _status = 'atendida' THEN _q END);
      END IF;

      INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
      VALUES (_pid, NULL, 'enviada', 'encarregado', NULL, _sol, _t0);
      IF _devolve AND _tdev <= now() THEN
        INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
        VALUES (_pid, 'enviada', 'devolvida', 'supervisor', 'Quantidade acima do consumo do posto, rever.', _sup[1 + floor(random() * 3)::int], _tdev);
        IF _treenv <= now() THEN
          INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
          VALUES (_pid, 'devolvida', 'enviada', 'encarregado', 'Corrigido', _sol, _treenv);
        END IF;
      END IF;
      IF _status IN ('a_atender', 'atendida', 'cancelada') THEN
        INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
        VALUES (_pid, 'enviada', 'a_atender', 'supervisor', NULL, _sup[1 + floor(random() * 3)::int], _tconf);
      END IF;
      IF _status = 'atendida' THEN
        INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
        VALUES (_pid, 'a_atender', 'atendida', 'compras', CASE WHEN _parcial THEN 'Entrega parcial: item em falta no fornecedor' END, _comp[1 + floor(random() * 3)::int], _tatend);
      ELSIF _status = 'cancelada' THEN
        INSERT INTO public.pedido_eventos (pedido_id, de_status, para_status, papel, comentario, usuario_nome, created_at)
        VALUES (_pid, 'a_atender', 'cancelada', NULL, 'Pedido duplicado', _comp[1 + floor(random() * 3)::int], _tatend);
      END IF;
    END LOOP;
    _d := _d + 1;
  END LOOP;
  UPDATE public.pedidos_material p SET tem_epi = EXISTS (
    SELECT 1 FROM public.pedidos_material_itens i JOIN public.materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id AND m.is_epi)
  WHERE p.solicitante_matricula LIKE 'DEMO-%';

  -- Preço por mês (de 18% abaixo a 11% acima do de hoje); o mês atual fica com o preço de hoje.
  UPDATE public.pedidos_material_itens i
  SET preco_unit = CASE WHEN p.data_pedido >= date_trunc('month', _hoje)::date THEN m.preco
    ELSE round(m.preco * (0.82 + (abs(hashtext(i.material_id::text || to_char(p.data_pedido, 'YYYY-MM'))) % 30) / 100.0), 2) END
  FROM public.pedidos_material p, public.materiais m
  WHERE p.id = i.pedido_id AND m.id = i.material_id AND p.solicitante_matricula LIKE 'DEMO-%';

  -- Teto: a partir do gasto do mês passado; metade passa, metade fica dentro.
  UPDATE public.postos p SET teto_material = t.teto
  FROM (
    SELECT posto_id, round((gasto * CASE WHEN row_number() OVER (ORDER BY gasto DESC) % 2 = 1
                                         THEN 0.70 + random() * 0.22 ELSE 1.08 + random() * 0.35 END)::numeric, -1) AS teto
    FROM (SELECT posto_id, sum(valor_total) AS gasto FROM public.pedidos_material
          WHERE solicitante_matricula LIKE 'DEMO-%' AND status <> 'cancelada'
            AND data_pedido >= (date_trunc('month', _hoje) - interval '1 month')::date AND data_pedido < date_trunc('month', _hoje)::date
          GROUP BY 1) g
  ) t WHERE p.id = t.posto_id;

  -- ---------- Estoque do posto: lançamento por dia em 6 postos ----------
  FOR _i IN 1..least(6, _n) LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.estoque_plantoes WHERE posto_id = _postos[_i] AND status = 'aberto');
    SELECT array_agg(x) INTO _itens FROM (SELECT unnest(_mats || coalesce(_epis, '{}')) x ORDER BY random() LIMIT 10) y;
    _saldo := ARRAY(SELECT (10 + floor(random() * 30))::numeric FROM generate_series(1, array_length(_itens, 1)));
    _ritmo := ARRAY(SELECT (CASE WHEN random() < 0.3 THEN 3 + random() * 4 ELSE 0.5 + random() * 2 END)::numeric FROM generate_series(1, array_length(_itens, 1)));
    _nome_sup := _sup[1 + floor(random() * 3)::int] || ' (demonstração)';
    _d := date '2026-10-01';
    WHILE _d <= _hoje LOOP
      IF (extract(isodow FROM _d) = 7 AND random() < 0.8) OR random() < 0.08 THEN _d := _d + 1; CONTINUE; END IF;
      _dif := random() < 0.04;
      INSERT INTO public.estoque_plantoes (posto_id, uf, status, aberto_em, aberto_por_nome, fechado_em, fechado_por_nome,
        observacao_inicio, observacao_fim, assinatura, declaracao_aceita_em, tem_diferenca)
      VALUES (_postos[_i], _ufs[_i], 'fechado', (_d + time '07:30') AT TIME ZONE 'America/Sao_Paulo', _nome_sup,
        (_d + time '17:40') AT TIME ZONE 'America/Sao_Paulo', _nome_sup, 'DEMONSTRAÇÃO',
        CASE WHEN _dif THEN 'Uma unidade avariada foi descartada.' WHEN random() < 0.1 THEN 'Limpeza pesada depois de evento no posto.' END,
        _rub, (_d + time '17:40') AT TIME ZONE 'America/Sao_Paulo', _dif)
      RETURNING id INTO _pl;
      FOR _k IN 1..array_length(_itens, 1) LOOP
        _ini := _saldo[_k];
        _rec := CASE WHEN _ini < 6 THEN (15 + floor(random() * 25))::numeric ELSE 0 END;
        _uso := CASE WHEN random() < 0.7 THEN least(_ini + _rec, round((_ritmo[_k] * (0.4 + random() * 1.2))::numeric)) ELSE 0 END;
        _fim := _ini + _rec - _uso;
        IF _dif AND _k = 1 AND _fim > 0 THEN _fim := _fim - 1; END IF;
        INSERT INTO public.estoque_plantao_itens (plantao_id, material_id, qtd_inicio, qtd_recebida, qtd_usada, qtd_fim)
        VALUES (_pl, _itens[_k], _ini, _rec, _uso, _fim);
        _saldo[_k] := _fim;
      END LOOP;
      INSERT INTO public.estoque_plantao_fotos (plantao_id, momento, foto, tirada_em) VALUES
        (_pl, 'inicio', _foto, (_d + time '07:30') AT TIME ZONE 'America/Sao_Paulo'),
        (_pl, 'fim', _foto, (_d + time '17:40') AT TIME ZONE 'America/Sao_Paulo');
      _d := _d + 1;
    END LOOP;
    FOR _k IN 1..array_length(_itens, 1) LOOP
      INSERT INTO public.estoque_posto (posto_id, material_id, quantidade, plantao_id, atualizado_em)
      VALUES (_postos[_i], _itens[_k], _saldo[_k], _pl, now())
      ON CONFLICT (posto_id, material_id) DO UPDATE SET quantidade = EXCLUDED.quantidade, plantao_id = EXCLUDED.plantao_id, atualizado_em = now();
    END LOOP;
  END LOOP;
END $demo$;

COMMIT;

-- Conferência.
SELECT 'pedidos de demonstração: ' || count(*) FROM public.pedidos_material WHERE solicitante_matricula LIKE 'DEMO-%';
SELECT 'lançamentos de estoque de demonstração: ' || count(*) FROM public.estoque_plantoes WHERE observacao_inicio = 'DEMONSTRAÇÃO';
SELECT 'avisos por e-mail dos pedidos: ' || CASE WHEN avisar_email THEN 'LIGADOS' ELSE 'desligados (voltam com o apagar.sql)' END FROM public.pedido_config WHERE id = 1;
SELECT po.nome || ' (' || po.uf || '): gasto em outubro ' || coalesce(sum(pm.valor_total), 0) || ' / teto ' || coalesce(po.teto_material::text, '-')
FROM public.postos po LEFT JOIN public.pedidos_material pm ON pm.posto_id = po.id AND pm.solicitante_matricula LIKE 'DEMO-%' AND pm.status <> 'cancelada'
  AND pm.data_pedido >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month')::date
  AND pm.data_pedido < date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
WHERE po.id::text IN (SELECT jsonb_object_keys(valor) FROM public._demo_apresentacao WHERE chave = 'postos')
GROUP BY po.nome, po.uf, po.teto_material ORDER BY 1;
