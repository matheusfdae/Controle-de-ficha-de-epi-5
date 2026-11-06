-- Notas fiscais de compra puxadas da SEFAZ (NF-e Distribuição DFe) para alimentar
-- o preço dos materiais (materiais.preco, usado no teto de gasto dos pedidos).
-- Depende de 20261030120000_pedidos_material.sql e 20261104120000_pedidos_teto_precos.sql.
--
--   * Quem consulta a SEFAZ é o robô da VM (deploy/producao/sefaz), com o certificado
--     A1 de cada empresa; ele grava aqui pelas funções sefaz_* (só service_role).
--   * Regra do preço: vale a nota MAIS RECENTE. Uma nota só troca o preço do material
--     se for mais nova que o preço atual (preco_atualizado_em); preço digitado depois
--     da nota continua valendo até chegar nota mais nova.
--   * Item da nota vira preço quando o código do fornecedor está ligado a um material
--     (material_codigos_fornecedor). A ligação é feita uma vez na tela e vale para as
--     próximas notas. "fator" = quantas unidades do material vêm em 1 unidade da nota
--     (ex.: nota em CX com 12 un -> fator 12; preço = valor unitário da nota / fator).
--   * Nota cancelada não conta; se o preço do material veio dela, volta para a nota
--     válida anterior.
--   * Só preço: não mexe no estoque.
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.sefaz_empresas (
  cnpj text PRIMARY KEY CHECK (cnpj ~ '^\d{14}$'),
  nome text,
  uf text,
  ult_nsu text NOT NULL DEFAULT '000000000000000',
  max_nsu text,
  proxima_consulta_em timestamptz,
  ultima_consulta_em timestamptz,
  ultimo_status text,
  ultimo_erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notas_sefaz (
  chave text PRIMARY KEY CHECK (chave ~ '^\d{44}$'),
  cnpj_destinatario text NOT NULL,
  emitente_cnpj text,
  emitente_nome text,
  numero text,
  emissao timestamptz,
  valor_total numeric(14, 2),
  -- resumo: só o cabeçalho (antes da ciência); completa: com os itens; cancelada: não conta.
  situacao text NOT NULL DEFAULT 'resumo' CHECK (situacao IN ('resumo', 'completa', 'cancelada')),
  ciencia_em timestamptz,
  ciencia_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notas_sefaz_emissao ON public.notas_sefaz (emissao DESC);

CREATE TABLE IF NOT EXISTS public.material_codigos_fornecedor (
  fornecedor_cnpj text NOT NULL,
  codigo text NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  fator numeric(12, 4) NOT NULL DEFAULT 1 CHECK (fator > 0),
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fornecedor_cnpj, codigo)
);

CREATE TABLE IF NOT EXISTS public.notas_sefaz_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL REFERENCES public.notas_sefaz(chave) ON DELETE CASCADE,
  n_item int NOT NULL,
  codigo text,
  ean text,
  descricao text NOT NULL,
  ncm text,
  unidade text,
  quantidade numeric(15, 4),
  valor_unit numeric(18, 6),
  valor_total numeric(14, 2),
  material_id uuid REFERENCES public.materiais(id) ON DELETE SET NULL,
  UNIQUE (chave, n_item)
);
CREATE INDEX IF NOT EXISTS idx_notas_sefaz_itens_material ON public.notas_sefaz_itens (material_id);

ALTER TABLE public.sefaz_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_sefaz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_sefaz_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_codigos_fornecedor ENABLE ROW LEVEL SECURITY;
-- Leitura para quem vê Pedidos de Material; escrita só pelas funções abaixo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sefaz_empresas', 'notas_sefaz', 'notas_sefaz_itens', 'material_codigos_fornecedor'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s select" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s select" ON public.%I FOR SELECT TO authenticated USING (public.has_permission(public.current_profile_id(), ''pedidos_material'', ''view''))', t, t);
  END LOOP;
END $$;

-- Preço do material pela nota válida mais recente.
-- _forcar = false: só troca se a nota for mais nova que o preço atual.
-- _forcar = true (nota cancelada / ligação desfeita): volta para a nota válida mais recente, se houver.
CREATE OR REPLACE FUNCTION public._sefaz_aplicar_preco(_material_id uuid, _forcar boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ult record;
BEGIN
  SELECT round(i.valor_unit / c.fator, 2) AS preco, n.emissao INTO _ult
  FROM notas_sefaz_itens i
  JOIN notas_sefaz n ON n.chave = i.chave AND n.situacao = 'completa'
  JOIN material_codigos_fornecedor c ON c.fornecedor_cnpj = n.emitente_cnpj AND c.codigo = i.codigo AND c.material_id = i.material_id
  WHERE i.material_id = _material_id AND i.valor_unit > 0 AND n.emissao IS NOT NULL
  ORDER BY n.emissao DESC, i.n_item
  LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE materiais SET preco = _ult.preco, preco_atualizado_em = _ult.emissao
  WHERE id = _material_id
    AND (_forcar OR preco_atualizado_em IS NULL OR preco_atualizado_em < _ult.emissao)
    AND (preco IS DISTINCT FROM _ult.preco OR preco_atualizado_em IS DISTINCT FROM _ult.emissao);
  RETURN FOUND;
END $$;

-- Robô: grava (ou completa) uma nota. _nota = {chave, cnpj_destinatario, emitente_cnpj,
-- emitente_nome, numero, emissao, valor_total, situacao, itens: [{n_item, codigo, ean,
-- descricao, ncm, unidade, quantidade, valor_unit, valor_total}]}.
CREATE OR REPLACE FUNCTION public.sefaz_gravar_nota(_nota jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _chave text := _nota->>'chave';
  _sit text := coalesce(_nota->>'situacao', 'resumo');
  _atual text;
  _mat uuid;
  _precos int := 0;
BEGIN
  SELECT situacao INTO _atual FROM notas_sefaz WHERE chave = _chave;
  -- Cancelada não volta; completa não vira resumo de novo.
  IF _atual = 'cancelada' OR (_atual = 'completa' AND _sit = 'resumo') THEN
    RETURN jsonb_build_object('chave', _chave, 'ignorada', true);
  END IF;

  INSERT INTO notas_sefaz (chave, cnpj_destinatario, emitente_cnpj, emitente_nome, numero, emissao, valor_total, situacao)
  VALUES (_chave, _nota->>'cnpj_destinatario', NULLIF(_nota->>'emitente_cnpj', ''), NULLIF(_nota->>'emitente_nome', ''),
          NULLIF(_nota->>'numero', ''), NULLIF(_nota->>'emissao', '')::timestamptz, NULLIF(_nota->>'valor_total', '')::numeric, _sit)
  ON CONFLICT (chave) DO UPDATE SET
    emitente_cnpj = coalesce(EXCLUDED.emitente_cnpj, notas_sefaz.emitente_cnpj),
    emitente_nome = coalesce(EXCLUDED.emitente_nome, notas_sefaz.emitente_nome),
    numero = coalesce(EXCLUDED.numero, notas_sefaz.numero),
    emissao = coalesce(EXCLUDED.emissao, notas_sefaz.emissao),
    valor_total = coalesce(EXCLUDED.valor_total, notas_sefaz.valor_total),
    situacao = EXCLUDED.situacao,
    updated_at = now();

  IF _sit = 'completa' THEN
    DELETE FROM notas_sefaz_itens WHERE chave = _chave;
    INSERT INTO notas_sefaz_itens (chave, n_item, codigo, ean, descricao, ncm, unidade, quantidade, valor_unit, valor_total, material_id)
    SELECT _chave, (it->>'n_item')::int, NULLIF(it->>'codigo', ''), NULLIF(it->>'ean', ''), coalesce(NULLIF(it->>'descricao', ''), '—'),
           NULLIF(it->>'ncm', ''), NULLIF(it->>'unidade', ''), NULLIF(it->>'quantidade', '')::numeric,
           NULLIF(it->>'valor_unit', '')::numeric, NULLIF(it->>'valor_total', '')::numeric,
           (SELECT c.material_id FROM material_codigos_fornecedor c
            WHERE c.fornecedor_cnpj = _nota->>'emitente_cnpj' AND c.codigo = it->>'codigo')
    FROM jsonb_array_elements(coalesce(_nota->'itens', '[]'::jsonb)) it;

    FOR _mat IN SELECT DISTINCT material_id FROM notas_sefaz_itens WHERE chave = _chave AND material_id IS NOT NULL LOOP
      IF _sefaz_aplicar_preco(_mat) THEN _precos := _precos + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('chave', _chave, 'situacao', _sit, 'precos', _precos);
END $$;

-- Robô: evento de cancelamento da nota.
CREATE OR REPLACE FUNCTION public.sefaz_cancelar_nota(_chave text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mat uuid;
BEGIN
  UPDATE notas_sefaz SET situacao = 'cancelada', updated_at = now() WHERE chave = _chave AND situacao <> 'cancelada';
  IF NOT FOUND THEN RETURN; END IF;
  -- Preço que veio desta nota volta para a nota válida anterior.
  FOR _mat IN
    SELECT DISTINCT i.material_id FROM notas_sefaz_itens i
    JOIN notas_sefaz n ON n.chave = i.chave
    JOIN materiais m ON m.id = i.material_id AND m.preco_atualizado_em = n.emissao
    WHERE i.chave = _chave
  LOOP
    PERFORM _sefaz_aplicar_preco(_mat, true);
  END LOOP;
END $$;

-- Robô: resultado da consulta de uma empresa (NSU, próxima consulta, erro).
CREATE OR REPLACE FUNCTION public.sefaz_registrar_consulta(_cnpj text, _nome text, _uf text, _ult_nsu text, _max_nsu text,
  _proxima timestamptz, _status text, _erro text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO sefaz_empresas (cnpj, nome, uf, ult_nsu, max_nsu, proxima_consulta_em, ultima_consulta_em, ultimo_status, ultimo_erro, updated_at)
  VALUES (_cnpj, _nome, _uf, coalesce(_ult_nsu, '000000000000000'), _max_nsu, _proxima, now(), _status, _erro, now())
  ON CONFLICT (cnpj) DO UPDATE SET
    nome = coalesce(EXCLUDED.nome, sefaz_empresas.nome),
    uf = coalesce(EXCLUDED.uf, sefaz_empresas.uf),
    ult_nsu = coalesce(_ult_nsu, sefaz_empresas.ult_nsu),
    max_nsu = coalesce(EXCLUDED.max_nsu, sefaz_empresas.max_nsu),
    proxima_consulta_em = EXCLUDED.proxima_consulta_em,
    ultima_consulta_em = now(),
    ultimo_status = EXCLUDED.ultimo_status,
    ultimo_erro = EXCLUDED.ultimo_erro,
    updated_at = now()
$$;

-- Robô: resultado da Ciência da Operação (sem ela a SEFAZ só entrega o resumo, sem itens).
CREATE OR REPLACE FUNCTION public.sefaz_marcar_ciencia(_chave text, _erro text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notas_sefaz SET
    ciencia_em = CASE WHEN _erro IS NULL THEN now() ELSE ciencia_em END,
    ciencia_erro = _erro,
    updated_at = now()
  WHERE chave = _chave
$$;

-- Tela: liga o código do fornecedor a um material (vale para esta e as próximas notas)
-- e aplica o preço. _material_id NULL desfaz a ligação.
CREATE OR REPLACE FUNCTION public.sefaz_vincular_item(_item_id uuid, _material_id uuid, _fator numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cnpj text;
  _codigo text;
  _antigos uuid[];
  _mat uuid;
  _precos int := 0;
BEGIN
  IF NOT coalesce(public._pm_gestor(), false) THEN
    RAISE EXCEPTION 'Só Compras ou quem edita Pedidos de Material pode ligar itens da nota.';
  END IF;
  SELECT n.emitente_cnpj, i.codigo INTO _cnpj, _codigo
  FROM notas_sefaz_itens i JOIN notas_sefaz n ON n.chave = i.chave WHERE i.id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da nota não encontrado.'; END IF;
  IF _cnpj IS NULL OR _codigo IS NULL THEN RAISE EXCEPTION 'Esta nota não tem CNPJ do fornecedor ou código do produto.'; END IF;
  IF _material_id IS NOT NULL AND EXISTS (SELECT 1 FROM materiais WHERE item_pai_id = _material_id) THEN
    RAISE EXCEPTION 'Escolha a variação do item (ex.: o tamanho), não o item que só agrupa.';
  END IF;
  IF coalesce(_fator, 1) <= 0 THEN RAISE EXCEPTION 'A quantidade por unidade da nota tem que ser maior que zero.'; END IF;

  SELECT array_agg(DISTINCT i.material_id) INTO _antigos
  FROM notas_sefaz_itens i JOIN notas_sefaz n ON n.chave = i.chave
  WHERE n.emitente_cnpj = _cnpj AND i.codigo = _codigo AND i.material_id IS NOT NULL;

  IF _material_id IS NULL THEN
    DELETE FROM material_codigos_fornecedor WHERE fornecedor_cnpj = _cnpj AND codigo = _codigo;
  ELSE
    INSERT INTO material_codigos_fornecedor (fornecedor_cnpj, codigo, material_id, fator, criado_por)
    VALUES (_cnpj, _codigo, _material_id, coalesce(_fator, 1), public.current_profile_id())
    ON CONFLICT (fornecedor_cnpj, codigo) DO UPDATE SET material_id = EXCLUDED.material_id, fator = EXCLUDED.fator,
      criado_por = EXCLUDED.criado_por, created_at = now();
  END IF;

  UPDATE notas_sefaz_itens i SET material_id = _material_id
  FROM notas_sefaz n
  WHERE n.chave = i.chave AND n.emitente_cnpj = _cnpj AND i.codigo = _codigo;

  -- Material que perdeu a ligação volta para a nota válida dele; o novo pega a mais recente.
  FOREACH _mat IN ARRAY coalesce(_antigos, '{}') LOOP
    IF _mat IS DISTINCT FROM _material_id THEN PERFORM _sefaz_aplicar_preco(_mat, true); END IF;
  END LOOP;
  IF _material_id IS NOT NULL AND _sefaz_aplicar_preco(_material_id, true) THEN _precos := 1; END IF;
  RETURN jsonb_build_object('precos', _precos);
END $$;

REVOKE ALL ON FUNCTION public._sefaz_aplicar_preco(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sefaz_gravar_nota(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sefaz_cancelar_nota(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sefaz_registrar_consulta(text, text, text, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sefaz_marcar_ciencia(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sefaz_vincular_item(uuid, uuid, numeric) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.sefaz_gravar_nota(jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sefaz_cancelar_nota(text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sefaz_registrar_consulta(text, text, text, text, text, timestamptz, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sefaz_marcar_ciencia(text, text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.sefaz_vincular_item(uuid, uuid, numeric) TO authenticated;
  END IF;
END $$;
