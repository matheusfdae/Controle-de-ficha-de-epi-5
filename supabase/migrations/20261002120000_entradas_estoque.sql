-- =========================================================
-- Entrada de estoque por nota (digitada do DANFE ou importada do XML
-- da NF-e). Até aqui a única forma de dar entrada era editar o TOTAL de
-- cada tamanho na tela de estoque, item a item. Agora uma nota inteira
-- entra de uma vez, SOMANDO ao estoque, numa transação só
-- (registrar_entrada_estoque), com o vínculo à nota guardado para
-- consulta e auditoria.
-- =========================================================

CREATE TABLE public.entradas_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nf text,
  serie text,
  -- Chave de 44 dígitos da NF-e: impede importar a mesma nota duas vezes.
  chave_acesso text UNIQUE CHECK (chave_acesso ~ '^\d{44}$'),
  fornecedor_nome text,
  fornecedor_cnpj text,
  data_emissao date,
  data_entrada timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'xml_nfe')),
  observacao text,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.entradas_estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id uuid NOT NULL REFERENCES public.entradas_estoque(id) ON DELETE CASCADE,
  epi_id uuid NOT NULL REFERENCES public.epis(id),
  tamanho text,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  descricao_nf text,
  codigo_fornecedor text,
  valor_unitario numeric(14, 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entrada_itens_entrada ON public.entradas_estoque_itens (entrada_id);
CREATE INDEX idx_entrada_itens_epi ON public.entradas_estoque_itens (epi_id);

-- "Memória" da importação: o código do produto no fornecedor (cProd da
-- NF-e) aponta para qual EPI/tamanho daqui. Aprendido a cada entrada
-- salva, para a próxima nota do mesmo fornecedor vir pré-preenchida.
CREATE TABLE public.epi_codigos_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_cnpj text NOT NULL,
  codigo_fornecedor text NOT NULL,
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  tamanho text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornecedor_cnpj, codigo_fornecedor)
);

ALTER TABLE public.entradas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas_estoque_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epi_codigos_fornecedor ENABLE ROW LEVEL SECURITY;

-- Leitura para quem vê o estoque. Escrita só pela função abaixo.
CREATE POLICY "entradas select by permission" ON public.entradas_estoque FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view'));
CREATE POLICY "entradas_itens select by permission" ON public.entradas_estoque_itens FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view'));
CREATE POLICY "codigos_fornecedor select by permission" ON public.epi_codigos_fornecedor FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view'));

-- =========================================================
-- registrar_entrada_estoque(cabecalho, itens)
--   cabecalho: {numero_nf, serie, chave_acesso, fornecedor_nome,
--               fornecedor_cnpj, data_emissao, origem, observacao}
--   itens: [{epi_id, tamanho, quantidade, descricao_nf,
--            codigo_fornecedor, valor_unitario}]
-- Tudo ou nada: se um item for inválido, nada é gravado.
-- =========================================================
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
  _cnpj text := NULLIF(regexp_replace(COALESCE(_cabecalho->>'fornecedor_cnpj', ''), '\D', '', 'g'), '');
  _chave text := NULLIF(regexp_replace(COALESCE(_cabecalho->>'chave_acesso', ''), '\D', '', 'g'), '');
  _nf text := NULLIF(trim(_cabecalho->>'numero_nf'), '');
  _motivo text;
BEGIN
  IF NOT public.has_permission(_perfil, 'estoque', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para dar entrada no estoque';
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'A entrada precisa de ao menos um item';
  END IF;
  IF _chave IS NOT NULL AND EXISTS (SELECT 1 FROM entradas_estoque WHERE chave_acesso = _chave) THEN
    RAISE EXCEPTION 'Esta NF-e (chave %) já foi lançada no estoque', _chave;
  END IF;

  INSERT INTO entradas_estoque (numero_nf, serie, chave_acesso, fornecedor_nome, fornecedor_cnpj,
                                data_emissao, origem, observacao, criado_por)
  VALUES (_nf, NULLIF(trim(_cabecalho->>'serie'), ''), _chave,
          NULLIF(trim(_cabecalho->>'fornecedor_nome'), ''), _cnpj,
          NULLIF(_cabecalho->>'data_emissao', '')::date,
          COALESCE(NULLIF(_cabecalho->>'origem', ''), 'manual'),
          NULLIF(trim(_cabecalho->>'observacao'), ''), _perfil)
  RETURNING id INTO _entrada;

  _motivo := 'Entrada' || COALESCE(' NF ' || _nf, '')
             || COALESCE(' - ' || NULLIF(trim(_cabecalho->>'fornecedor_nome'), ''), '');

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

    IF _tam IS NOT NULL THEN
      -- O trigger trg_sync_epi_estoque_atual recalcula epis.estoque_atual.
      INSERT INTO epi_tamanhos (epi_id, tamanho, estoque)
      VALUES (_epi.id, _tam, _qtd)
      ON CONFLICT (epi_id, tamanho) DO UPDATE SET estoque = epi_tamanhos.estoque + EXCLUDED.estoque;
    ELSIF EXISTS (SELECT 1 FROM epi_tamanhos WHERE epi_id = _epi.id) THEN
      RAISE EXCEPTION '"%" é controlado por tamanho: informe o tamanho', _epi.nome;
    ELSE
      UPDATE epis SET estoque_atual = estoque_atual + _qtd WHERE id = _epi.id;
    END IF;

    INSERT INTO entradas_estoque_itens (entrada_id, epi_id, tamanho, quantidade, descricao_nf,
                                        codigo_fornecedor, valor_unitario)
    VALUES (_entrada, _epi.id, _tam, _qtd, NULLIF(_item->>'descricao_nf', ''),
            NULLIF(_item->>'codigo_fornecedor', ''), NULLIF(_item->>'valor_unitario', '')::numeric);

    INSERT INTO movimentacoes_estoque (item_id, tipo_item, tipo_mov, quantidade, responsavel_id, motivo, observacao)
    VALUES (_epi.id, _epi.tipo::text::tipo_item, 'entrada', _qtd, _perfil,
            _motivo || COALESCE(' (' || _tam || ')', ''), 'entrada_estoque:' || _entrada);

    IF _cnpj IS NOT NULL AND NULLIF(_item->>'codigo_fornecedor', '') IS NOT NULL THEN
      INSERT INTO epi_codigos_fornecedor (fornecedor_cnpj, codigo_fornecedor, epi_id, tamanho)
      VALUES (_cnpj, _item->>'codigo_fornecedor', _epi.id, _tam)
      ON CONFLICT (fornecedor_cnpj, codigo_fornecedor) DO UPDATE
        SET epi_id = EXCLUDED.epi_id, tamanho = EXCLUDED.tamanho, updated_at = now();
    END IF;
  END LOOP;

  RETURN _entrada;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_entrada_estoque(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_estoque(jsonb, jsonb) TO authenticated;
