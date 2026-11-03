-- Estoque do posto por plantão (depende de 20261030120000_pedidos_material.sql).
--
-- O supervisor abre o plantão com a foto do depósito e a contagem de cada
-- item; no fim, tira outra foto, lança o que foi usado (e o que chegou) e
-- confere a contagem final. Ao fechar, assina (rubrica) e declara que as
-- quantidades são as do depósito: só então o estoque do posto é atualizado.
-- O consumo dos plantões serve para conferir se o pedido faz sentido.
-- Re-executável.

-- ---------- Tabelas ----------
CREATE TABLE IF NOT EXISTS public.estoque_plantoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  uf text NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  aberto_em timestamptz NOT NULL DEFAULT now(),
  aberto_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  aberto_por_nome text,
  fechado_em timestamptz,
  fechado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fechado_por_nome text,
  observacao_inicio text,
  -- Obrigatória quando a contagem final não bate com início + recebido - usado.
  observacao_fim text,
  -- Rubrica do supervisor no fechamento (PNG em data URL) e a declaração aceita.
  assinatura text CHECK (assinatura IS NULL OR (assinatura LIKE 'data:image/%' AND length(assinatura) <= 400000)),
  declaracao_aceita_em timestamptz,
  tem_diferenca boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Um plantão aberto por posto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_plantoes_aberto ON public.estoque_plantoes (posto_id) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS idx_estoque_plantoes_posto ON public.estoque_plantoes (posto_id, aberto_em DESC);

CREATE TABLE IF NOT EXISTS public.estoque_plantao_itens (
  plantao_id uuid NOT NULL REFERENCES public.estoque_plantoes(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  qtd_inicio numeric(12, 2) NOT NULL DEFAULT 0 CHECK (qtd_inicio >= 0),
  qtd_recebida numeric(12, 2) NOT NULL DEFAULT 0 CHECK (qtd_recebida >= 0),
  qtd_usada numeric(12, 2) CHECK (qtd_usada >= 0),
  qtd_fim numeric(12, 2) CHECK (qtd_fim >= 0),
  -- Contado no fim menos o esperado (início + recebido - usado). Negativo = faltou.
  diferenca numeric(12, 2) GENERATED ALWAYS AS (qtd_fim - (qtd_inicio + qtd_recebida - coalesce(qtd_usada, 0))) STORED,
  PRIMARY KEY (plantao_id, material_id)
);

-- Fotos à parte para não pesar nas listas (JPEG comprimido no celular).
CREATE TABLE IF NOT EXISTS public.estoque_plantao_fotos (
  plantao_id uuid NOT NULL REFERENCES public.estoque_plantoes(id) ON DELETE CASCADE,
  momento text NOT NULL CHECK (momento IN ('inicio', 'fim')),
  foto text NOT NULL CHECK (foto ~ '^data:image/(jpeg|png|webp);base64,' AND length(foto) <= 1400000),
  tirada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plantao_id, momento)
);

-- Saldo atual de cada item no posto (atualizado ao fechar o plantão).
CREATE TABLE IF NOT EXISTS public.estoque_posto (
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  quantidade numeric(12, 2) NOT NULL CHECK (quantidade >= 0),
  plantao_id uuid REFERENCES public.estoque_plantoes(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (posto_id, material_id)
);

-- Pedido que deixaria o estoque para mais dias que isto ganha alerta.
ALTER TABLE public.pedido_config ADD COLUMN IF NOT EXISTS dias_cobertura integer NOT NULL DEFAULT 30
  CHECK (dias_cobertura BETWEEN 1 AND 365);

-- ---------- RLS: lê quem vê os pedidos do posto; escrita só pelas funções ----------
ALTER TABLE public.estoque_plantoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_plantao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_plantao_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_posto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estoque_plantoes select" ON public.estoque_plantoes;
CREATE POLICY "estoque_plantoes select" ON public.estoque_plantoes FOR SELECT TO authenticated
  USING (public._pm_ve(uf, posto_id));
DROP POLICY IF EXISTS "estoque_plantao_itens select" ON public.estoque_plantao_itens;
CREATE POLICY "estoque_plantao_itens select" ON public.estoque_plantao_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.estoque_plantoes p WHERE p.id = plantao_id AND public._pm_ve(p.uf, p.posto_id)));
DROP POLICY IF EXISTS "estoque_plantao_fotos select" ON public.estoque_plantao_fotos;
CREATE POLICY "estoque_plantao_fotos select" ON public.estoque_plantao_fotos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.estoque_plantoes p WHERE p.id = plantao_id AND public._pm_ve(p.uf, p.posto_id)));
DROP POLICY IF EXISTS "estoque_posto select" ON public.estoque_posto;
CREATE POLICY "estoque_posto select" ON public.estoque_posto FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.postos po WHERE po.id = posto_id AND public._pm_ve(po.uf, po.id)));

-- ---------- Funções ----------

-- Confere a lista de contagem: [{material_id, quantidade}], 1 a 150 itens.
CREATE OR REPLACE FUNCTION public._est_validar_foto(_foto text)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _foto IS NULL OR _foto !~ '^data:image/(jpeg|png|webp);base64,' THEN RAISE EXCEPTION 'Tire a foto do depósito.'; END IF;
  IF length(_foto) > 1400000 THEN RAISE EXCEPTION 'Foto muito grande. Tire outra.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public._est_num(_v text, _rotulo text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _v IS NULL OR _v = '' THEN RETURN 0; END IF;
  IF _v !~ '^\d+(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Quantidade inválida em %.', _rotulo; END IF;
  RETURN _v::numeric;
END $$;

-- Supervisor (ou gerência) abre o plantão com a foto e a contagem inicial.
CREATE OR REPLACE FUNCTION public.estoque_abrir_plantao(_posto_id uuid, _foto text, _itens jsonb, _observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _posto public.postos;
  _id uuid;
  _e jsonb;
BEGIN
  SELECT * INTO _posto FROM postos WHERE id = _posto_id;
  IF _posto.id IS NULL OR NOT public._pm_tem_papel(ARRAY['supervisor', 'gerencia'], _posto.uf, _posto.id) THEN
    RAISE EXCEPTION 'Só o supervisor ou a gerência do posto lança o estoque.';
  END IF;
  IF EXISTS (SELECT 1 FROM estoque_plantoes WHERE posto_id = _posto.id AND status = 'aberto') THEN
    RAISE EXCEPTION 'Já existe um plantão aberto neste posto. Feche-o antes de abrir outro.';
  END IF;
  PERFORM public._est_validar_foto(_foto);
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Lance a quantidade de pelo menos um item.';
  END IF;
  IF jsonb_array_length(_itens) > 150 THEN RAISE EXCEPTION 'No máximo 150 itens por plantão.'; END IF;

  INSERT INTO estoque_plantoes (posto_id, uf, aberto_por, aberto_por_nome, observacao_inicio)
  VALUES (_posto.id, _posto.uf, public.current_profile_id(),
    (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id()),
    nullif(left(trim(coalesce(_observacao, '')), 1000), ''))
  RETURNING id INTO _id;
  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    IF NOT EXISTS (SELECT 1 FROM materiais WHERE id::text = _e ->> 'material_id') THEN RAISE EXCEPTION 'Item desconhecido.'; END IF;
    INSERT INTO estoque_plantao_itens (plantao_id, material_id, qtd_inicio)
    VALUES (_id, (_e ->> 'material_id')::uuid, public._est_num(_e ->> 'quantidade', public._pm_nome_material((_e ->> 'material_id')::uuid)))
    ON CONFLICT (plantao_id, material_id) DO UPDATE SET qtd_inicio = EXCLUDED.qtd_inicio;
  END LOOP;
  INSERT INTO estoque_plantao_fotos (plantao_id, momento, foto) VALUES (_id, 'inicio', _foto);
  RETURN _id;
END $$;

-- Fecha o plantão: foto, usado/recebido/contagem final de cada item, rubrica e
-- declaração. Diferença na contagem exige justificativa. Atualiza o estoque do posto.
-- _itens = [{material_id, usada, recebida, final}] (item novo no fim entra com início 0).
CREATE OR REPLACE FUNCTION public.estoque_fechar_plantao(_plantao_id uuid, _foto text, _itens jsonb,
  _assinatura text, _ciente boolean, _observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.estoque_plantoes;
  _e jsonb;
  _mat uuid;
  _nome text;
  _dif integer;
BEGIN
  SELECT * INTO _p FROM estoque_plantoes WHERE id = _plantao_id FOR UPDATE;
  IF _p.id IS NULL OR NOT public._pm_tem_papel(ARRAY['supervisor', 'gerencia'], _p.uf, _p.posto_id) THEN
    RAISE EXCEPTION 'Plantão não encontrado.';
  END IF;
  IF _p.status <> 'aberto' THEN RAISE EXCEPTION 'Este plantão já foi fechado.'; END IF;
  IF NOT coalesce(_ciente, false) THEN
    RAISE EXCEPTION 'Marque que está ciente e concorda que as quantidades são as do depósito.';
  END IF;
  IF _assinatura IS NULL OR _assinatura NOT LIKE 'data:image/%' THEN RAISE EXCEPTION 'Assine (rubrica) para fechar o plantão.'; END IF;
  PERFORM public._est_validar_foto(_foto);
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' THEN RAISE EXCEPTION 'Lance o fechamento dos itens.'; END IF;

  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    _mat := CASE WHEN (_e ->> 'material_id') ~ '^[0-9a-f-]{36}$' THEN (_e ->> 'material_id')::uuid END;
    IF _mat IS NULL OR NOT EXISTS (SELECT 1 FROM materiais WHERE id = _mat) THEN RAISE EXCEPTION 'Item desconhecido.'; END IF;
    _nome := public._pm_nome_material(_mat);
    IF (_e ->> 'final') IS NULL OR (_e ->> 'final') = '' THEN RAISE EXCEPTION 'Informe a contagem final de %.', _nome; END IF;
    INSERT INTO estoque_plantao_itens (plantao_id, material_id, qtd_inicio, qtd_recebida, qtd_usada, qtd_fim)
    VALUES (_p.id, _mat, 0, public._est_num(_e ->> 'recebida', _nome), public._est_num(_e ->> 'usada', _nome), public._est_num(_e ->> 'final', _nome))
    ON CONFLICT (plantao_id, material_id) DO UPDATE SET qtd_recebida = EXCLUDED.qtd_recebida,
      qtd_usada = EXCLUDED.qtd_usada, qtd_fim = EXCLUDED.qtd_fim;
  END LOOP;
  IF EXISTS (SELECT 1 FROM estoque_plantao_itens WHERE plantao_id = _p.id AND qtd_fim IS NULL) THEN
    RAISE EXCEPTION 'Falta a contagem final de %.',
      (SELECT public._pm_nome_material(material_id) FROM estoque_plantao_itens WHERE plantao_id = _p.id AND qtd_fim IS NULL LIMIT 1);
  END IF;
  SELECT count(*) INTO _dif FROM estoque_plantao_itens WHERE plantao_id = _p.id AND diferenca <> 0;
  IF _dif > 0 AND nullif(trim(coalesce(_observacao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A contagem final não bate em % item(ns). Explique a diferença na observação.', _dif;
  END IF;

  UPDATE estoque_plantoes SET status = 'fechado', fechado_em = now(), fechado_por = public.current_profile_id(),
    fechado_por_nome = (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id()),
    observacao_fim = nullif(left(trim(coalesce(_observacao, '')), 1000), ''),
    assinatura = _assinatura, declaracao_aceita_em = now(), tem_diferenca = _dif > 0
  WHERE id = _p.id;
  INSERT INTO estoque_plantao_fotos (plantao_id, momento, foto) VALUES (_p.id, 'fim', _foto)
  ON CONFLICT (plantao_id, momento) DO UPDATE SET foto = EXCLUDED.foto, tirada_em = now();

  INSERT INTO estoque_posto (posto_id, material_id, quantidade, plantao_id, atualizado_em)
  SELECT _p.posto_id, material_id, qtd_fim, _p.id, now() FROM estoque_plantao_itens WHERE plantao_id = _p.id
  ON CONFLICT (posto_id, material_id) DO UPDATE SET quantidade = EXCLUDED.quantidade,
    plantao_id = EXCLUDED.plantao_id, atualizado_em = EXCLUDED.atualizado_em;
  RETURN jsonb_build_object('diferencas', _dif);
END $$;

-- Quem abriu por engano: supervisor/gerência cancela o plantão ainda aberto.
CREATE OR REPLACE FUNCTION public.estoque_cancelar_plantao(_plantao_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.estoque_plantoes;
BEGIN
  SELECT * INTO _p FROM estoque_plantoes WHERE id = _plantao_id;
  IF _p.id IS NULL OR NOT public._pm_tem_papel(ARRAY['supervisor', 'gerencia'], _p.uf, _p.posto_id) THEN
    RAISE EXCEPTION 'Plantão não encontrado.';
  END IF;
  IF _p.status <> 'aberto' THEN RAISE EXCEPTION 'Plantão fechado não pode ser cancelado.'; END IF;
  DELETE FROM estoque_plantoes WHERE id = _p.id;
END $$;

-- O pedido faz sentido? Para cada item: estoque atual do posto, consumo médio
-- por dia (plantões fechados nos últimos 30 dias) e para quantos dias o estoque
-- dura sem e com o pedido. alerta = passa de pedido_config.dias_cobertura.
CREATE OR REPLACE FUNCTION public.estoque_analise_pedido(_pedido_id uuid)
RETURNS TABLE (material_id uuid, estoque numeric, consumo_dia numeric, dias_estoque numeric,
  dias_com_pedido numeric, quantidade_pedido numeric, alerta boolean, sem_historico boolean, limite_dias integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT * FROM pedidos_material WHERE id = _pedido_id AND public._pm_ve(uf, posto_id)),
  lim AS (SELECT coalesce((SELECT dias_cobertura FROM pedido_config WHERE id = 1), 30) AS dias),
  janela AS (
    SELECT pl.id, (pl.aberto_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia
    FROM estoque_plantoes pl, p
    WHERE pl.posto_id = p.posto_id AND pl.status = 'fechado' AND pl.aberto_em >= now() - interval '30 days'),
  dias AS (SELECT greatest(count(DISTINCT dia), 1) AS n FROM janela),
  consumo AS (
    SELECT i.material_id, sum(coalesce(i.qtd_usada, 0)) AS usado
    FROM estoque_plantao_itens i JOIN janela j ON j.id = i.plantao_id GROUP BY 1)
  SELECT it.material_id,
    coalesce(e.quantidade, 0),
    round(coalesce(c.usado, 0) / d.n, 2),
    CASE WHEN coalesce(c.usado, 0) > 0 THEN round(coalesce(e.quantidade, 0) / (c.usado / d.n), 1) END,
    CASE WHEN coalesce(c.usado, 0) > 0 THEN round((coalesce(e.quantidade, 0) + it.quantidade) / (c.usado / d.n), 1) END,
    it.quantidade,
    coalesce(c.usado, 0) > 0 AND (coalesce(e.quantidade, 0) + it.quantidade) / (c.usado / d.n) > lim.dias,
    c.usado IS NULL,
    lim.dias
  FROM p JOIN pedidos_material_itens it ON it.pedido_id = p.id
  CROSS JOIN dias d CROSS JOIN lim
  LEFT JOIN estoque_posto e ON e.posto_id = p.posto_id AND e.material_id = it.material_id
  LEFT JOIN consumo c ON c.material_id = it.material_id
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public._est_validar_foto(text)', 'public._est_num(text, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.estoque_abrir_plantao(uuid, text, jsonb, text)',
    'public.estoque_fechar_plantao(uuid, text, jsonb, text, boolean, text)',
    'public.estoque_cancelar_plantao(uuid)', 'public.estoque_analise_pedido(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON public.estoque_plantoes, public.estoque_plantao_itens, public.estoque_plantao_fotos, public.estoque_posto FROM anon;
GRANT SELECT ON public.estoque_plantoes, public.estoque_plantao_itens, public.estoque_plantao_fotos, public.estoque_posto TO authenticated;

NOTIFY pgrst, 'reload schema';
