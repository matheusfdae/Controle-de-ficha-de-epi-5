-- Entrada de estoque MANUAL (item a item, sem nota fiscal) separada da
-- entrada POR NOTA. Origens:
--   manual       -> sem nota (saldo inicial, inventário, devolução...): exige motivo
--   nf_digitada  -> nota digitada à mão (DANFE em papel)
--   xml_nfe      -> nota importada do XML
--   pdf_danfe    -> nota importada do PDF
-- Re-executável.

ALTER TABLE public.entradas_estoque ADD COLUMN IF NOT EXISTS motivo text;

ALTER TABLE public.entradas_estoque DROP CONSTRAINT IF EXISTS entradas_estoque_origem_check;
-- Antes, nota digitada e entrada sem nota eram as duas "manual": quem tem nº de NF era nota.
UPDATE public.entradas_estoque SET origem = 'nf_digitada' WHERE origem = 'manual' AND numero_nf IS NOT NULL;
ALTER TABLE public.entradas_estoque ADD CONSTRAINT entradas_estoque_origem_check
  CHECK (origem IN ('manual', 'nf_digitada', 'xml_nfe', 'pdf_danfe'));

CREATE OR REPLACE FUNCTION public.registrar_entrada_estoque(_cabecalho jsonb, _itens jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _perfil uuid := public.current_profile_id();
  _entrada uuid;
  _item jsonb;
  _epi public.epis%ROWTYPE;
  _qtd integer;
  _tam text;
  _uf text := NULLIF(trim(_cabecalho->>'uf'), '');
  _origem text := COALESCE(NULLIF(_cabecalho->>'origem', ''), 'nf_digitada');
  _manual boolean;
  _motivo_entrada text := NULLIF(trim(_cabecalho->>'motivo'), '');
  _cnpj text := NULLIF(regexp_replace(COALESCE(_cabecalho->>'fornecedor_cnpj', ''), '\D', '', 'g'), '');
  _chave text := NULLIF(regexp_replace(COALESCE(_cabecalho->>'chave_acesso', ''), '\D', '', 'g'), '');
  _nf text := NULLIF(trim(_cabecalho->>'numero_nf'), '');
  _fornecedor uuid := NULLIF(_cabecalho->>'fornecedor_id', '')::uuid;
  _motivo text;
BEGIN
  IF NOT public.has_permission(_perfil, 'estoque', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para dar entrada no estoque';
  END IF;
  IF _uf IS NULL THEN
    RAISE EXCEPTION 'Informe o estado que está recebendo a entrada';
  END IF;
  IF NOT public.pode_acessar_uf(_uf) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf;
  END IF;
  IF _origem NOT IN ('manual', 'nf_digitada', 'xml_nfe', 'pdf_danfe') THEN
    RAISE EXCEPTION 'Origem da entrada inválida: %', _origem;
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'A entrada precisa de ao menos um item';
  END IF;

  _manual := _origem = 'manual';
  IF _manual THEN
    -- Sem nota: nada de dados fiscais, e o motivo é obrigatório.
    IF _motivo_entrada IS NULL THEN
      RAISE EXCEPTION 'Informe o motivo da entrada manual';
    END IF;
    _nf := NULL; _chave := NULL; _cnpj := NULL; _fornecedor := NULL;
  ELSE
    IF _nf IS NULL AND _chave IS NULL THEN
      RAISE EXCEPTION 'Informe o número da nota fiscal (ou use a entrada manual)';
    END IF;
    IF _chave IS NOT NULL AND EXISTS (SELECT 1 FROM entradas_estoque WHERE chave_acesso = _chave) THEN
      RAISE EXCEPTION 'Esta NF-e (chave %) já foi lançada no estoque', _chave;
    END IF;
    IF _fornecedor IS NULL AND _cnpj IS NOT NULL THEN
      SELECT id INTO _fornecedor FROM fornecedores WHERE cnpj = _cnpj;
    END IF;
  END IF;

  INSERT INTO entradas_estoque (numero_nf, serie, chave_acesso, fornecedor_id, fornecedor_nome, fornecedor_cnpj,
                                data_emissao, origem, motivo, observacao, criado_por, uf)
  VALUES (_nf, CASE WHEN _manual THEN NULL ELSE NULLIF(trim(_cabecalho->>'serie'), '') END, _chave, _fornecedor,
          CASE WHEN _manual THEN NULL ELSE NULLIF(trim(_cabecalho->>'fornecedor_nome'), '') END, _cnpj,
          CASE WHEN _manual THEN NULL ELSE NULLIF(_cabecalho->>'data_emissao', '')::date END,
          _origem, _motivo_entrada,
          NULLIF(trim(_cabecalho->>'observacao'), ''), _perfil, _uf)
  RETURNING id INTO _entrada;

  IF _manual THEN
    _motivo := 'Entrada manual - ' || _motivo_entrada;
  ELSE
    _motivo := 'Entrada' || COALESCE(' NF ' || _nf, '')
               || COALESCE(' - ' || NULLIF(trim(_cabecalho->>'fornecedor_nome'), ''), '');
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    SELECT * INTO _epi FROM epis WHERE id = (_item->>'epi_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item sem EPI/uniforme correspondente: %', COALESCE(_item->>'descricao_nf', '?');
    END IF;
    _qtd := (_item->>'quantidade')::integer;
    IF _qtd IS NULL OR _qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%"', _epi.nome;
    END IF;
    -- Sem upper(): a tela já casa com o tamanho existente ("g" x "G").
    _tam := NULLIF(trim(_item->>'tamanho'), '');
    IF _tam IS NULL AND EXISTS (SELECT 1 FROM epi_tamanhos WHERE epi_id = _epi.id AND tamanho <> 'ÚNICO') THEN
      RAISE EXCEPTION '"%" é controlado por tamanho: informe o tamanho', _epi.nome;
    END IF;
    _tam := COALESCE(_tam, 'ÚNICO');

    -- O trigger trg_sync_epi_estoque_atual recalcula epis.estoque_atual.
    INSERT INTO epi_tamanhos (epi_id, uf, tamanho, estoque) VALUES (_epi.id, _uf, _tam, _qtd)
    ON CONFLICT (epi_id, uf, tamanho) DO UPDATE SET estoque = epi_tamanhos.estoque + EXCLUDED.estoque;

    INSERT INTO entradas_estoque_itens (entrada_id, epi_id, tamanho, quantidade, descricao_nf,
                                        codigo_fornecedor, valor_unitario)
    VALUES (_entrada, _epi.id, NULLIF(_tam, 'ÚNICO'), _qtd, NULLIF(_item->>'descricao_nf', ''),
            NULLIF(_item->>'codigo_fornecedor', ''), NULLIF(_item->>'valor_unitario', '')::numeric);

    INSERT INTO movimentacoes_estoque (item_id, tipo_item, tipo_mov, quantidade, responsavel_id, motivo, observacao, uf)
    VALUES (_epi.id, _epi.tipo::text::tipo_item, 'entrada', _qtd, _perfil,
            _motivo || CASE WHEN _tam <> 'ÚNICO' THEN ' (' || _tam || ')' ELSE '' END,
            'entrada_estoque:' || _entrada, _uf);

    IF _cnpj IS NOT NULL AND NULLIF(_item->>'codigo_fornecedor', '') IS NOT NULL THEN
      INSERT INTO epi_codigos_fornecedor (fornecedor_cnpj, codigo_fornecedor, epi_id, tamanho)
      VALUES (_cnpj, _item->>'codigo_fornecedor', _epi.id, NULLIF(_tam, 'ÚNICO'))
      ON CONFLICT (fornecedor_cnpj, codigo_fornecedor) DO UPDATE
        SET epi_id = EXCLUDED.epi_id, tamanho = EXCLUDED.tamanho, updated_at = now();
    END IF;
  END LOOP;

  RETURN _entrada;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_entrada_estoque(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_estoque(jsonb, jsonb) TO authenticated;
