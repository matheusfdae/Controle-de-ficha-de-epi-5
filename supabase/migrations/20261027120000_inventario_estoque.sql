-- Inventário (contagem física) do estoque de um estado — pedido do Matheus em 27/10/2026.
-- A tela gera a planilha de contagem para o almoxarifado; a planilha preenchida
-- volta pela tela e esta função grava tudo de uma vez: o saldo de cada item
-- contado passa a ser o número contado, e cada diferença vira uma movimentação
-- (entrada se sobrou, saída se faltou) com o motivo do inventário.
-- Tudo ou nada: um erro em qualquer linha desfaz a contagem inteira.
-- Re-executável.

CREATE OR REPLACE FUNCTION public.aplicar_inventario_estoque(_uf text, _motivo text, _itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _perfil uuid := public.current_profile_id();
  _item jsonb;
  _epi_id uuid;
  _tipo text;
  _nome text;
  _tam text;
  _contado integer;
  _atual integer;
  _delta integer;
  _ajustados integer := 0;
  _iguais integer := 0;
  _texto text := 'Inventário - ' || COALESCE(NULLIF(trim(_motivo), ''), to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
BEGIN
  IF NOT public.has_permission(_perfil, 'estoque', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para ajustar o estoque';
  END IF;
  IF NULLIF(trim(_uf), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o estado do inventário';
  END IF;
  IF NOT public.pode_acessar_uf(_uf) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf;
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Nenhum item contado';
  END IF;
  IF jsonb_array_length(_itens) > 5000 THEN
    RAISE EXCEPTION 'Contagem grande demais (máx. 5.000 linhas)';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    _epi_id := NULLIF(_item->>'epi_id', '')::uuid;
    SELECT tipo::text, nome INTO _tipo, _nome FROM epis WHERE id = _epi_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item não encontrado no cadastro (%)', COALESCE(_item->>'epi_id', '?');
    END IF;
    _tam := COALESCE(NULLIF(trim(_item->>'tamanho'), ''), 'ÚNICO');
    IF (_item->>'contado') !~ '^\d{1,7}$' THEN
      RAISE EXCEPTION 'Contagem inválida para "%" (%): %', _nome, _tam, COALESCE(_item->>'contado', 'vazia');
    END IF;
    _contado := (_item->>'contado')::integer;

    SELECT estoque INTO _atual FROM epi_tamanhos WHERE epi_id = _epi_id AND uf = _uf AND tamanho = _tam FOR UPDATE;
    _delta := _contado - COALESCE(_atual, 0);

    -- Bateu com o sistema (ou zero contado onde não havia saldo): nada a gravar.
    IF _delta = 0 THEN
      _iguais := _iguais + 1;
      CONTINUE;
    END IF;

    -- O trigger trg_sync_epi_estoque_atual recalcula epis.estoque_atual; o de
    -- reposição avisa se o saldo cruzar o mínimo.
    INSERT INTO epi_tamanhos (epi_id, uf, tamanho, estoque) VALUES (_epi_id, _uf, _tam, _contado)
    ON CONFLICT (epi_id, uf, tamanho) DO UPDATE SET estoque = EXCLUDED.estoque;

    INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, observacao, responsavel_id, uf)
    VALUES (_tipo::tipo_item, _epi_id, CASE WHEN _delta > 0 THEN 'entrada' ELSE 'saida' END::tipo_mov,
            abs(_delta), _texto || ' (' || _tam || ')',
            'inventario: contado ' || _contado || ', sistema ' || COALESCE(_atual, 0), _perfil, _uf);
    _ajustados := _ajustados + 1;
  END LOOP;

  RETURN jsonb_build_object('ajustados', _ajustados, 'iguais', _iguais);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_inventario_estoque(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_inventario_estoque(text, text, jsonb) TO authenticated;
