-- Teto de gasto por posto e valor dos pedidos de material (depende de
-- 20261030120000_pedidos_material.sql e 20261031130000_importar_planilha_postos.sql).
--
--   * materiais.preco: preço de referência do item (importado de planilha ou digitado).
--   * postos.teto_material: teto MENSAL de material do posto (o "CUSTO EM CONTRATO").
--   * Cada item do pedido guarda o preço do dia em que foi pedido (preco_unit);
--     o valor do pedido = soma de quantidade conferida x preço, recalculado sozinho.
--   * Passou do teto no mês: o pedido segue normal; a função avisar-pedidos-material
--     manda um e-mail para Comercial e Gerência do estado (teto_avisado marca o que já foi).
-- Re-executável.

ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS preco numeric(12, 2) CHECK (preco >= 0);
ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS preco_atualizado_em timestamptz;
ALTER TABLE public.postos ADD COLUMN IF NOT EXISTS teto_material numeric(12, 2) CHECK (teto_material >= 0);
ALTER TABLE public.pedidos_material_itens ADD COLUMN IF NOT EXISTS preco_unit numeric(12, 2) CHECK (preco_unit >= 0);
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS valor_total numeric(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS sem_preco boolean NOT NULL DEFAULT false;
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS teto_avisado boolean NOT NULL DEFAULT false;

-- Preço do item no dia do pedido (não muda se o preço do catálogo mudar depois).
CREATE OR REPLACE FUNCTION public._pm_item_preco()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.preco_unit IS NULL THEN
    NEW.preco_unit := (SELECT preco FROM materiais WHERE id = NEW.material_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pm_item_preco ON public.pedidos_material_itens;
CREATE TRIGGER trg_pm_item_preco BEFORE INSERT ON public.pedidos_material_itens
  FOR EACH ROW EXECUTE FUNCTION public._pm_item_preco();

-- Valor do pedido = soma de quantidade (conferida) x preço; sem_preco = algum item sem preço.
CREATE OR REPLACE FUNCTION public._pm_valor_pedido(_pedido_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE pedidos_material p SET
    valor_total = coalesce((SELECT sum(i.quantidade * coalesce(i.preco_unit, 0)) FROM pedidos_material_itens i WHERE i.pedido_id = p.id), 0),
    sem_preco = EXISTS (SELECT 1 FROM pedidos_material_itens i WHERE i.pedido_id = p.id AND i.preco_unit IS NULL)
  WHERE p.id = _pedido_id
$$;
CREATE OR REPLACE FUNCTION public._pm_itens_valor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._pm_valor_pedido(coalesce(NEW.pedido_id, OLD.pedido_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pm_itens_valor ON public.pedidos_material_itens;
CREATE TRIGGER trg_pm_itens_valor AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_material_itens
  FOR EACH ROW EXECUTE FUNCTION public._pm_itens_valor();

-- Pedidos que já existiam: preço de hoje nos itens sem preço e valor recalculado.
UPDATE public.pedidos_material_itens i SET preco_unit = m.preco
FROM public.materiais m WHERE m.id = i.material_id AND i.preco_unit IS NULL AND m.preco IS NOT NULL;
UPDATE public.pedidos_material p SET
  valor_total = coalesce((SELECT sum(i.quantidade * coalesce(i.preco_unit, 0)) FROM public.pedidos_material_itens i WHERE i.pedido_id = p.id), 0),
  sem_preco = EXISTS (SELECT 1 FROM public.pedidos_material_itens i WHERE i.pedido_id = p.id AND i.preco_unit IS NULL);

-- Gasto do posto no mês do pedido (sem os cancelados), para comparar com o teto.
CREATE OR REPLACE FUNCTION public.pedidos_gasto_mes(_posto_id uuid, _mes date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(valor_total), 0) FROM pedidos_material
  WHERE posto_id = _posto_id AND status <> 'cancelada'
    AND data_pedido >= date_trunc('month', _mes)::date AND data_pedido < (date_trunc('month', _mes) + interval '1 month')::date
$$;

-- Teto do posto pela tela (Compras ou quem edita Pedidos de Material). NULL = sem teto.
CREATE OR REPLACE FUNCTION public.pedidos_definir_teto(_posto_id uuid, _teto numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._pm_gestor() THEN RAISE EXCEPTION 'Sem permissão para mudar o teto.'; END IF;
  IF _teto IS NOT NULL AND (_teto < 0 OR _teto > 100000000) THEN RAISE EXCEPTION 'Teto inválido.'; END IF;
  UPDATE postos SET teto_material = round(_teto, 2) WHERE id = _posto_id AND public.pode_acessar_uf(uf);
  IF NOT FOUND THEN RAISE EXCEPTION 'Posto não encontrado.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.pedidos_definir_teto(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_definir_teto(uuid, numeric) TO authenticated;

-- Importar preços: _itens = [{nome, preco}]. Liga pelo nome (sem diferenciar
-- maiúsculas e espaços; item e variação "Item — Variação"). Devolve os não encontrados.
CREATE OR REPLACE FUNCTION public.pedidos_importar_precos(_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _i jsonb;
  _nome text;
  _preco numeric;
  _n integer;
  _atualizados integer := 0;
  _nao jsonb := '[]';
BEGIN
  IF NOT public._pm_gestor() THEN RAISE EXCEPTION 'Sem permissão para importar preços (é preciso ser de Compras ou editar Pedidos de Material).'; END IF;
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN RAISE EXCEPTION 'Nada para importar.'; END IF;
  IF jsonb_array_length(_itens) > 5000 THEN RAISE EXCEPTION 'No máximo 5.000 itens por importação.'; END IF;
  FOR _i IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    _nome := lower(regexp_replace(trim(coalesce(_i ->> 'nome', '')), '\s+', ' ', 'g'));
    _preco := CASE WHEN (_i ->> 'preco') ~ '^\d+(\.\d{1,4})?$' THEN round((_i ->> 'preco')::numeric, 2) END;
    CONTINUE WHEN _nome = '';
    IF _preco IS NULL OR _preco > 10000000 THEN RAISE EXCEPTION 'Preço inválido em %.', _i ->> 'nome'; END IF;
    UPDATE materiais m SET preco = _preco, preco_atualizado_em = now()
    WHERE lower(regexp_replace(trim(public._pm_nome_material(m.id)), '\s+', ' ', 'g')) = _nome
       OR (m.item_pai_id IS NULL AND lower(regexp_replace(trim(m.nome), '\s+', ' ', 'g')) = _nome);
    GET DIAGNOSTICS _n = ROW_COUNT;
    IF _n = 0 THEN _nao := _nao || to_jsonb(_i ->> 'nome'); ELSE _atualizados := _atualizados + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('atualizados', _atualizados, 'nao_encontrados', _nao);
END $$;
REVOKE ALL ON FUNCTION public.pedidos_importar_precos(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_importar_precos(jsonb) TO authenticated;

-- Importar planilha por posto: agora grava também o teto (custo em contrato) da aba.
CREATE OR REPLACE FUNCTION public.pedidos_importar_planilha(_postos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _e jsonb;
  _i jsonb;
  _posto public.postos;
  _mat uuid;
  _nome text;
  _uf text;
  _teto numeric;
  _criados_postos integer := 0;
  _criados_itens integer := 0;
  _listas integer := 0;
  _itens_lista integer := 0;
  _tetos integer := 0;
BEGIN
  IF NOT public._pm_gestor() THEN RAISE EXCEPTION 'Sem permissão para importar (é preciso ser de Compras ou editar Pedidos de Material).'; END IF;
  IF _postos IS NULL OR jsonb_typeof(_postos) <> 'array' OR jsonb_array_length(_postos) = 0 THEN RAISE EXCEPTION 'Nada para importar.'; END IF;
  IF jsonb_array_length(_postos) > 300 THEN RAISE EXCEPTION 'No máximo 300 postos por importação.'; END IF;

  FOR _e IN SELECT * FROM jsonb_array_elements(_postos) LOOP
    _posto := NULL;
    IF (_e ->> 'posto_id') IS NOT NULL THEN
      SELECT * INTO _posto FROM postos WHERE id = (_e ->> 'posto_id')::uuid;
      IF _posto.id IS NULL OR NOT public.pode_acessar_uf(_posto.uf) THEN RAISE EXCEPTION 'Posto não encontrado: %', _e ->> 'posto_id'; END IF;
    ELSE
      _nome := nullif(regexp_replace(trim(coalesce(_e #>> '{criar,nome}', '')), '\s+', ' ', 'g'), '');
      _uf := upper(trim(coalesce(_e #>> '{criar,uf}', '')));
      IF _nome IS NULL THEN RAISE EXCEPTION 'Posto novo sem nome.'; END IF;
      IF NOT EXISTS (SELECT 1 FROM estados WHERE uf = _uf) THEN RAISE EXCEPTION 'Estado inválido para o posto %: %', _nome, _uf; END IF;
      IF NOT public.pode_acessar_uf(_uf) THEN RAISE EXCEPTION 'Você não tem acesso ao estado % (posto %).', _uf, _nome; END IF;
      SELECT * INTO _posto FROM postos WHERE nome_chave = lower(_nome);
      IF _posto.id IS NULL THEN
        INSERT INTO postos (nome, uf) VALUES (_nome, _uf) RETURNING * INTO _posto;
        _criados_postos := _criados_postos + 1;
      END IF;
    END IF;

    -- Teto só muda quando a aba traz um valor (aba sem custo em contrato mantém o que já está).
    _teto := CASE WHEN (_e ->> 'teto') ~ '^\d+(\.\d{1,2})?$' THEN (_e ->> 'teto')::numeric END;
    IF _teto IS NOT NULL THEN
      UPDATE postos SET teto_material = _teto WHERE id = _posto.id;
      _tetos := _tetos + 1;
    END IF;

    -- Lista do posto = itens da planilha.
    DELETE FROM posto_materiais WHERE posto_id = _posto.id;
    FOR _i IN SELECT * FROM jsonb_array_elements(coalesce(_e -> 'itens', '[]')) LOOP
      _nome := nullif(left(regexp_replace(trim(coalesce(_i ->> 'nome', '')), '\s+', ' ', 'g'), 200), '');
      CONTINUE WHEN _nome IS NULL;
      SELECT id INTO _mat FROM materiais
      WHERE item_pai_id IS NULL AND lower(regexp_replace(trim(nome), '\s+', ' ', 'g')) = lower(_nome);
      IF _mat IS NULL THEN
        INSERT INTO materiais (nome, unidade)
        VALUES (_nome, coalesce(nullif(left(trim(coalesce(_i ->> 'unidade', '')), 20), ''), 'un'))
        RETURNING id INTO _mat;
        _criados_itens := _criados_itens + 1;
      END IF;
      INSERT INTO posto_materiais (posto_id, material_id) VALUES (_posto.id, _mat) ON CONFLICT DO NOTHING;
      IF FOUND THEN _itens_lista := _itens_lista + 1; END IF;
      _mat := NULL;
    END LOOP;
    _listas := _listas + 1;
  END LOOP;

  RETURN jsonb_build_object('postos_criados', _criados_postos, 'itens_criados', _criados_itens,
    'listas', _listas, 'itens_nas_listas', _itens_lista, 'tetos', _tetos);
END $$;
REVOKE ALL ON FUNCTION public.pedidos_importar_planilha(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_importar_planilha(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
