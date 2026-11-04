-- Lançamento do dia no estoque do posto (depende de 20261031120000_estoque_posto.sql).
-- Numa tela só: quanto havia no início, quanto chegou e quanto foi usado de cada
-- item, com a foto do depósito, a rubrica e a declaração. Vira um plantão já
-- fechado do dia escolhido (até 60 dias para trás), sem diferença: a contagem
-- final é início + recebido - usado. Re-executável.

CREATE OR REPLACE FUNCTION public.estoque_lancar_dia(_posto_id uuid, _data date, _foto text, _itens jsonb,
  _assinatura text, _ciente boolean, _observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _posto public.postos;
  _id uuid;
  _e jsonb;
  _mat uuid;
  _nome text;
  _ini numeric; _rec numeric; _uso numeric;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _quando timestamptz;
BEGIN
  SELECT * INTO _posto FROM postos WHERE id = _posto_id;
  IF _posto.id IS NULL OR NOT coalesce(public._pm_tem_papel(ARRAY['supervisor', 'gerencia'], _posto.uf, _posto.id), false) THEN
    RAISE EXCEPTION 'Só o supervisor ou a gerência do posto lança o estoque.';
  END IF;
  IF EXISTS (SELECT 1 FROM estoque_plantoes WHERE posto_id = _posto.id AND status = 'aberto') THEN
    RAISE EXCEPTION 'Há um plantão aberto neste posto. Feche-o (ou cancele) antes de lançar o dia.';
  END IF;
  IF _data IS NULL OR _data > _hoje OR _data < _hoje - 60 THEN RAISE EXCEPTION 'Data inválida: use um dia dos últimos 60 dias.'; END IF;
  IF NOT coalesce(_ciente, false) THEN RAISE EXCEPTION 'Marque que está ciente e concorda que as quantidades são as do depósito.'; END IF;
  IF _assinatura IS NULL OR _assinatura NOT LIKE 'data:image/%' THEN RAISE EXCEPTION 'Assine (rubrica) para salvar o lançamento.'; END IF;
  PERFORM public._est_validar_foto(_foto);
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN RAISE EXCEPTION 'Lance pelo menos um item.'; END IF;

  -- Hoje: a hora de agora. Dia anterior: meio-dia do dia, para cair na data certa.
  _quando := CASE WHEN _data = _hoje THEN now() ELSE (_data + time '12:00') AT TIME ZONE 'America/Sao_Paulo' END;
  INSERT INTO estoque_plantoes (posto_id, uf, status, aberto_em, aberto_por, aberto_por_nome, fechado_em, fechado_por, fechado_por_nome,
    observacao_fim, assinatura, declaracao_aceita_em, tem_diferenca)
  VALUES (_posto.id, _posto.uf, 'fechado', _quando, public.current_profile_id(), (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id()),
    _quando, public.current_profile_id(), (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id()),
    nullif(left(trim(coalesce(_observacao, '')), 1000), ''), _assinatura, now(), false)
  RETURNING id INTO _id;

  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    _mat := CASE WHEN (_e ->> 'material_id') ~ '^[0-9a-f-]{36}$' THEN (_e ->> 'material_id')::uuid END;
    IF _mat IS NULL OR NOT EXISTS (SELECT 1 FROM materiais WHERE id = _mat) THEN RAISE EXCEPTION 'Item desconhecido.'; END IF;
    _nome := public._pm_nome_material(_mat);
    _ini := public._est_num(_e ->> 'inicio', _nome);
    _rec := public._est_num(_e ->> 'recebida', _nome);
    _uso := public._est_num(_e ->> 'usada', _nome);
    IF _uso > _ini + _rec THEN RAISE EXCEPTION 'Em %, o usado (%) é maior que o que havia (% no início + % recebido).', _nome, _uso, _ini, _rec; END IF;
    INSERT INTO estoque_plantao_itens (plantao_id, material_id, qtd_inicio, qtd_recebida, qtd_usada, qtd_fim)
    VALUES (_id, _mat, _ini, _rec, _uso, _ini + _rec - _uso)
    ON CONFLICT (plantao_id, material_id) DO UPDATE SET qtd_inicio = EXCLUDED.qtd_inicio, qtd_recebida = EXCLUDED.qtd_recebida,
      qtd_usada = EXCLUDED.qtd_usada, qtd_fim = EXCLUDED.qtd_fim;
  END LOOP;
  INSERT INTO estoque_plantao_fotos (plantao_id, momento, foto) VALUES (_id, 'inicio', _foto);

  -- O saldo do posto só muda se este for o lançamento mais recente (lançar um dia atrasado não volta o estoque).
  IF NOT EXISTS (SELECT 1 FROM estoque_plantoes WHERE posto_id = _posto.id AND status = 'fechado' AND id <> _id AND aberto_em > _quando) THEN
    INSERT INTO estoque_posto (posto_id, material_id, quantidade, plantao_id, atualizado_em)
    SELECT _posto.id, material_id, qtd_fim, _id, now() FROM estoque_plantao_itens WHERE plantao_id = _id
    ON CONFLICT (posto_id, material_id) DO UPDATE SET quantidade = EXCLUDED.quantidade,
      plantao_id = EXCLUDED.plantao_id, atualizado_em = EXCLUDED.atualizado_em;
  END IF;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.estoque_lancar_dia(uuid, date, text, jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estoque_lancar_dia(uuid, date, text, jsonb, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
