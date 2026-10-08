-- =========================================================
-- Divisão por estado (DF, MT, GO, SP) — pedido do Matheus em 06/10/2026.
--
--  * Catálogo (epis) continua único; o ESTOQUE passa a ser por
--    item + estado + tamanho (epi_tamanhos.uf). Item sem tamanho usa o
--    tamanho 'ÚNICO'. epis.estoque_atual vira o total de todos os estados.
--  * Ficha guarda o estado escolhido na criação (fichas_epi.uf); a baixa
--    de estoque sai do estoque desse estado.
--  * Cada usuário só vê os estados marcados para ele (user_estados) —
--    INCLUSIVE o admin (pedido do Matheus em 08/10/2026). O admin continua
--    podendo marcar estados para si mesmo na tela Usuários.
--  * Transferência entre estados: transferir_estoque().
--
-- Dados que já existem (fichas, estoque, entradas, movimentações) vão para
-- 'DF' (procure "estado dos dados antigos") — confirmado pelo Matheus em
-- 06/10/2026: tudo o que existe hoje na produção é do DF.
-- Pode ser rodado de novo sem estragar nada (IF NOT EXISTS / IF EXISTS).
-- Usuários que já existem ficam com TODOS os estados (ninguém perde acesso
-- no deploy); o admin restringe depois em Usuários.
-- =========================================================

-- ---------- Estados ----------
CREATE TABLE IF NOT EXISTS public.estados (
  uf text PRIMARY KEY CHECK (uf ~ '^[A-Z]{2}$'),
  nome text NOT NULL
);
INSERT INTO public.estados (uf, nome) VALUES
  ('DF', 'Distrito Federal'), ('GO', 'Goiás'), ('MT', 'Mato Grosso'), ('SP', 'São Paulo')
ON CONFLICT (uf) DO NOTHING;
ALTER TABLE public.estados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estados select" ON public.estados;
CREATE POLICY "estados select" ON public.estados FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.user_estados (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uf text NOT NULL REFERENCES public.estados(uf),
  PRIMARY KEY (user_id, uf)
);
ALTER TABLE public.user_estados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_estados select" ON public.user_estados;
CREATE POLICY "user_estados select" ON public.user_estados FOR SELECT TO authenticated
  USING (user_id = public.current_profile_id() OR public.has_role(public.current_profile_id(), 'admin'));
DROP POLICY IF EXISTS "user_estados admin" ON public.user_estados;
CREATE POLICY "user_estados admin" ON public.user_estados FOR ALL TO authenticated
  USING (public.has_role(public.current_profile_id(), 'admin'))
  WITH CHECK (public.has_role(public.current_profile_id(), 'admin'));

INSERT INTO public.user_estados (user_id, uf)
SELECT p.id, e.uf FROM public.profiles p CROSS JOIN public.estados e
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.pode_acessar_uf(_uf text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM user_estados WHERE user_id = public.current_profile_id() AND uf = _uf);
$$;


-- ---------- Estoque por estado ----------
ALTER TABLE public.epi_tamanhos ADD COLUMN IF NOT EXISTS uf text REFERENCES public.estados(uf);
UPDATE public.epi_tamanhos SET uf = 'DF' /* estado dos dados antigos */ WHERE uf IS NULL;
ALTER TABLE public.epi_tamanhos ALTER COLUMN uf SET NOT NULL;
ALTER TABLE public.epi_tamanhos DROP CONSTRAINT IF EXISTS epi_tamanhos_epi_id_tamanho_key;
-- Por garantia: qualquer outra UNIQUE (epi_id, tamanho) sem o estado.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'public.epi_tamanhos'::regclass AND con.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
           WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)) = ARRAY['epi_id', 'tamanho']
  LOOP
    EXECUTE format('ALTER TABLE public.epi_tamanhos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.epi_tamanhos DROP CONSTRAINT IF EXISTS epi_tamanhos_epi_uf_tamanho_key;
ALTER TABLE public.epi_tamanhos ADD CONSTRAINT epi_tamanhos_epi_uf_tamanho_key UNIQUE (epi_id, uf, tamanho);
ALTER TABLE public.epi_tamanhos DROP CONSTRAINT IF EXISTS epi_tamanhos_estoque_nao_negativo;
ALTER TABLE public.epi_tamanhos ADD CONSTRAINT epi_tamanhos_estoque_nao_negativo CHECK (estoque >= 0) NOT VALID;

-- Item sem tamanho guardava o saldo só em epis.estoque_atual: vira 'ÚNICO'.
INSERT INTO public.epi_tamanhos (epi_id, uf, tamanho, estoque)
SELECT e.id, 'DF' /* estado dos dados antigos */, 'ÚNICO', e.estoque_atual
FROM public.epis e
WHERE e.estoque_atual > 0 AND NOT EXISTS (SELECT 1 FROM public.epi_tamanhos t WHERE t.epi_id = e.id);

-- ---------- Fichas ----------
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS uf text REFERENCES public.estados(uf);
UPDATE public.fichas_epi SET uf = 'DF' /* estado dos dados antigos */ WHERE uf IS NULL;
ALTER TABLE public.fichas_epi ALTER COLUMN uf SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_epi_uf ON public.fichas_epi (uf);

-- O estado da ficha não muda depois de criada (a baixa já saiu dele).
CREATE OR REPLACE FUNCTION public.travar_uf_ficha()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.uf IS DISTINCT FROM OLD.uf THEN
    RAISE EXCEPTION 'O estado da ficha não pode ser alterado depois de criada';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_travar_uf_ficha ON public.fichas_epi;
CREATE TRIGGER trg_travar_uf_ficha BEFORE UPDATE ON public.fichas_epi
  FOR EACH ROW EXECUTE FUNCTION public.travar_uf_ficha();

-- ---------- Entradas e movimentações ----------
ALTER TABLE public.entradas_estoque ADD COLUMN IF NOT EXISTS uf text REFERENCES public.estados(uf);
UPDATE public.entradas_estoque SET uf = 'DF' /* estado dos dados antigos */ WHERE uf IS NULL;
ALTER TABLE public.entradas_estoque ALTER COLUMN uf SET NOT NULL;

ALTER TABLE public.movimentacoes_estoque ADD COLUMN IF NOT EXISTS uf text REFERENCES public.estados(uf);
UPDATE public.movimentacoes_estoque SET uf = 'DF' /* estado dos dados antigos */ WHERE uf IS NULL;
ALTER TABLE public.movimentacoes_estoque ALTER COLUMN uf SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_uf_data ON public.movimentacoes_estoque (uf, data_mov);


-- =========================================================
-- Baixa / estorno de estoque pelos itens da ficha — agora no estado da ficha.
-- (Substitui as versões de 20260513183535.)
-- =========================================================
CREATE OR REPLACE FUNCTION public.aplicar_baixa_estoque_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uf text;
  _tipo text;
  _tam text := COALESCE(NULLIF(trim(NEW.tamanho), ''), 'ÚNICO');
  _qtd integer := COALESCE(NEW.quantidade, 1);
BEGIN
  IF NEW.epi_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT uf INTO _uf FROM fichas_epi WHERE id = NEW.ficha_id;
  SELECT tipo::text INTO _tipo FROM epis WHERE id = NEW.epi_id;

  -- Fichas podem ser salvas sem estoque (só avisa na tela), então não fica negativo.
  UPDATE epi_tamanhos SET estoque = GREATEST(estoque - _qtd, 0)
   WHERE epi_id = NEW.epi_id AND uf = _uf AND tamanho = _tam;

  INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, uf)
  VALUES (COALESCE(_tipo, 'epi')::tipo_item, NEW.epi_id, 'saida', _qtd,
          'Entrega via ficha' || CASE WHEN _tam <> 'ÚNICO' THEN ' (' || _tam || ')' ELSE '' END, _uf);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.devolver_estoque_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uf text;
  _tipo text;
  _tam text := COALESCE(NULLIF(trim(OLD.tamanho), ''), 'ÚNICO');
  _qtd integer := COALESCE(OLD.quantidade, 1);
BEGIN
  IF OLD.epi_id IS NULL THEN
    RETURN OLD;
  END IF;
  SELECT uf INTO _uf FROM fichas_epi WHERE id = OLD.ficha_id;
  IF _uf IS NULL THEN
    -- A ficha inteira foi apagada (cascade): sem estado para devolver.
    RETURN OLD;
  END IF;
  SELECT tipo::text INTO _tipo FROM epis WHERE id = OLD.epi_id;

  INSERT INTO epi_tamanhos (epi_id, uf, tamanho, estoque) VALUES (OLD.epi_id, _uf, _tam, _qtd)
  ON CONFLICT (epi_id, uf, tamanho) DO UPDATE SET estoque = epi_tamanhos.estoque + EXCLUDED.estoque;

  INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, uf)
  VALUES (COALESCE(_tipo, 'epi')::tipo_item, OLD.epi_id, 'entrada', _qtd, 'Estorno - item removido da ficha', _uf);
  RETURN OLD;
END;
$$;

-- Gatilho antigo (20260505173529) que dava baixa de novo ao ASSINAR a ficha.
-- A migration 20260513183535 tentou removê-lo com o nome errado
-- (trg_descontar_estoque_ficha), então a baixa podia sair duas vezes.
DROP TRIGGER IF EXISTS trg_desconta_estoque ON public.fichas_epi;

-- =========================================================
-- Ajuste manual, reset e transferência (antes eram feitos direto pela tela).
-- =========================================================
CREATE OR REPLACE FUNCTION public.ajustar_estoque(_epi_id uuid, _uf text, _tamanho text, _novo integer, _motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tam text := COALESCE(NULLIF(trim(_tamanho), ''), 'ÚNICO');
  _atual integer;
  _tipo text;
  _delta integer;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'estoque', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para ajustar o estoque';
  END IF;
  IF NOT public.pode_acessar_uf(_uf) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf;
  END IF;
  IF _novo IS NULL OR _novo < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  SELECT tipo::text INTO _tipo FROM epis WHERE id = _epi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT estoque INTO _atual FROM epi_tamanhos WHERE epi_id = _epi_id AND uf = _uf AND tamanho = _tam FOR UPDATE;
  _delta := _novo - COALESCE(_atual, 0);

  INSERT INTO epi_tamanhos (epi_id, uf, tamanho, estoque) VALUES (_epi_id, _uf, _tam, _novo)
  ON CONFLICT (epi_id, uf, tamanho) DO UPDATE SET estoque = EXCLUDED.estoque;

  IF _delta <> 0 THEN
    INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, responsavel_id, uf)
    VALUES (_tipo::tipo_item, _epi_id, CASE WHEN _delta > 0 THEN 'entrada' ELSE 'saida' END::tipo_mov,
            abs(_delta), COALESCE(_motivo, 'Ajuste manual') || ' (' || _tam || ')', public.current_profile_id(), _uf);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resetar_estoque(_epi_id uuid, _uf text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer;
  _tipo text;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'estoque', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para ajustar o estoque';
  END IF;
  IF NOT public.pode_acessar_uf(_uf) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf;
  END IF;
  SELECT tipo::text INTO _tipo FROM epis WHERE id = _epi_id;
  SELECT COALESCE(SUM(estoque), 0) INTO _total FROM epi_tamanhos WHERE epi_id = _epi_id AND uf = _uf;
  UPDATE epi_tamanhos SET estoque = 0 WHERE epi_id = _epi_id AND uf = _uf;
  IF _total > 0 THEN
    INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, responsavel_id, uf)
    VALUES (_tipo::tipo_item, _epi_id, 'saida', _total, 'Reset de estoque', public.current_profile_id(), _uf);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferir_estoque(
  _epi_id uuid, _tamanho text, _uf_origem text, _uf_destino text, _quantidade integer, _observacao text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tam text := COALESCE(NULLIF(trim(_tamanho), ''), 'ÚNICO');
  _disp integer;
  _epi epis%ROWTYPE;
  _perfil uuid := public.current_profile_id();
BEGIN
  IF NOT public.has_permission(_perfil, 'estoque', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para transferir estoque';
  END IF;
  -- Basta ter acesso à ORIGEM: quem manda o material é quem tem o estoque.
  IF NOT public.pode_acessar_uf(_uf_origem) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf_origem;
  END IF;
  IF _uf_origem = _uf_destino THEN
    RAISE EXCEPTION 'Origem e destino são o mesmo estado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM estados WHERE uf = _uf_destino) THEN
    RAISE EXCEPTION 'Estado de destino inválido';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  SELECT * INTO _epi FROM epis WHERE id = _epi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT estoque INTO _disp FROM epi_tamanhos
   WHERE epi_id = _epi_id AND uf = _uf_origem AND tamanho = _tam FOR UPDATE;
  IF COALESCE(_disp, 0) < _quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente de "%" (%) em %: disponível %, pedido %',
      _epi.nome, _tam, _uf_origem, COALESCE(_disp, 0), _quantidade;
  END IF;

  UPDATE epi_tamanhos SET estoque = estoque - _quantidade
   WHERE epi_id = _epi_id AND uf = _uf_origem AND tamanho = _tam;
  INSERT INTO epi_tamanhos (epi_id, uf, tamanho, estoque) VALUES (_epi_id, _uf_destino, _tam, _quantidade)
  ON CONFLICT (epi_id, uf, tamanho) DO UPDATE SET estoque = epi_tamanhos.estoque + EXCLUDED.estoque;

  INSERT INTO movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo, observacao, responsavel_id, uf) VALUES
    (_epi.tipo::text::tipo_item, _epi_id, 'saida', _quantidade,
     'Transferência para ' || _uf_destino || ' (' || _tam || ')', _observacao, _perfil, _uf_origem),
    (_epi.tipo::text::tipo_item, _epi_id, 'entrada', _quantidade,
     'Transferência de ' || _uf_origem || ' (' || _tam || ')', _observacao, _perfil, _uf_destino);
END;
$$;

REVOKE ALL ON FUNCTION public.ajustar_estoque(uuid, text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resetar_estoque(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transferir_estoque(uuid, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque(uuid, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resetar_estoque(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_estoque(uuid, text, text, text, integer, text) TO authenticated;

-- =========================================================
-- Entrada por nota: agora para um estado (cabecalho.uf, obrigatório).
-- (Substitui a versão de 20261002120000.)
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
  _uf text := NULLIF(trim(_cabecalho->>'uf'), '');
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
    RAISE EXCEPTION 'Informe o estado que está recebendo a nota';
  END IF;
  IF NOT public.pode_acessar_uf(_uf) THEN
    RAISE EXCEPTION 'Sem acesso ao estado %', _uf;
  END IF;
  IF jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'A entrada precisa de ao menos um item';
  END IF;
  IF _chave IS NOT NULL AND EXISTS (SELECT 1 FROM entradas_estoque WHERE chave_acesso = _chave) THEN
    RAISE EXCEPTION 'Esta NF-e (chave %) já foi lançada no estoque', _chave;
  END IF;

  IF _fornecedor IS NULL AND _cnpj IS NOT NULL THEN
    SELECT id INTO _fornecedor FROM fornecedores WHERE cnpj = _cnpj;
  END IF;

  INSERT INTO entradas_estoque (numero_nf, serie, chave_acesso, fornecedor_id, fornecedor_nome, fornecedor_cnpj,
                                data_emissao, origem, observacao, criado_por, uf)
  VALUES (_nf, NULLIF(trim(_cabecalho->>'serie'), ''), _chave, _fornecedor,
          NULLIF(trim(_cabecalho->>'fornecedor_nome'), ''), _cnpj,
          NULLIF(_cabecalho->>'data_emissao', '')::date,
          COALESCE(NULLIF(_cabecalho->>'origem', ''), 'manual'),
          NULLIF(trim(_cabecalho->>'observacao'), ''), _perfil, _uf)
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

-- =========================================================
-- RLS: cada um só vê / mexe nos estados dele.
-- =========================================================
-- Estoque por tamanho
DROP POLICY IF EXISTS "epi_tam select auth" ON public.epi_tamanhos;
DROP POLICY IF EXISTS "epi_tam insert by permission" ON public.epi_tamanhos;
DROP POLICY IF EXISTS "epi_tam update by permission" ON public.epi_tamanhos;
DROP POLICY IF EXISTS "epi_tam delete by permission" ON public.epi_tamanhos;
DROP POLICY IF EXISTS "epi_tam select por estado" ON public.epi_tamanhos;
CREATE POLICY "epi_tam select por estado" ON public.epi_tamanhos FOR SELECT TO authenticated
  USING (public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "epi_tam insert por estado" ON public.epi_tamanhos;
CREATE POLICY "epi_tam insert por estado" ON public.epi_tamanhos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "epi_tam update por estado" ON public.epi_tamanhos;
CREATE POLICY "epi_tam update por estado" ON public.epi_tamanhos FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "epi_tam delete por estado" ON public.epi_tamanhos;
CREATE POLICY "epi_tam delete por estado" ON public.epi_tamanhos FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete') AND public.pode_acessar_uf(uf));

-- Movimentações
DROP POLICY IF EXISTS "mov select by permission" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "mov insert by permission" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "mov update by permission" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "mov delete by permission" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "mov select por estado" ON public.movimentacoes_estoque;
CREATE POLICY "mov select por estado" ON public.movimentacoes_estoque FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "mov insert por estado" ON public.movimentacoes_estoque;
CREATE POLICY "mov insert por estado" ON public.movimentacoes_estoque FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "mov update por estado" ON public.movimentacoes_estoque;
CREATE POLICY "mov update por estado" ON public.movimentacoes_estoque FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "mov delete por estado" ON public.movimentacoes_estoque;
CREATE POLICY "mov delete por estado" ON public.movimentacoes_estoque FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete') AND public.pode_acessar_uf(uf));

-- Entradas por nota
DROP POLICY IF EXISTS "entradas select by permission" ON public.entradas_estoque;
DROP POLICY IF EXISTS "entradas select por estado" ON public.entradas_estoque;
CREATE POLICY "entradas select por estado" ON public.entradas_estoque FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "entradas_itens select by permission" ON public.entradas_estoque_itens;
DROP POLICY IF EXISTS "entradas_itens select por estado" ON public.entradas_estoque_itens;
CREATE POLICY "entradas_itens select por estado" ON public.entradas_estoque_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.entradas_estoque e WHERE e.id = entrada_id
                 AND public.has_permission(public.current_profile_id(), 'estoque', 'view')
                 AND public.pode_acessar_uf(e.uf)));

-- Fichas (mantém as cláusulas de dono/supervisor de 20260902120000)
DROP POLICY IF EXISTS "fichas_epi select" ON public.fichas_epi;
CREATE POLICY "fichas_epi select"
ON public.fichas_epi FOR SELECT TO authenticated
USING (
  colaborador_id = public.current_profile_id()
  OR (public.has_permission(public.current_profile_id(), 'fichas_epi', 'view') AND public.pode_acessar_uf(uf))
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi insert by permission" ON public.fichas_epi;
CREATE POLICY "fichas_epi insert by permission"
ON public.fichas_epi FOR INSERT TO authenticated
WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'create') AND public.pode_acessar_uf(uf));

DROP POLICY IF EXISTS "fichas_epi update by permission or supervisor" ON public.fichas_epi;
CREATE POLICY "fichas_epi update by permission or supervisor"
ON public.fichas_epi FOR UPDATE TO authenticated
USING (
  (public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit') AND public.pode_acessar_uf(uf))
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi delete by permission" ON public.fichas_epi;
CREATE POLICY "fichas_epi delete by permission"
ON public.fichas_epi FOR DELETE TO authenticated
USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'delete') AND public.pode_acessar_uf(uf));

DROP POLICY IF EXISTS "fei select" ON public.fichas_epi_itens;
CREATE POLICY "fei select"
ON public.fichas_epi_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND (
    f.colaborador_id = public.current_profile_id()
    OR (public.has_permission(public.current_profile_id(), 'fichas_epi', 'view') AND public.pode_acessar_uf(f.uf))
    OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id)
  )
));

DROP POLICY IF EXISTS "fei insert by permission" ON public.fichas_epi_itens;
DROP POLICY IF EXISTS "fei update by permission" ON public.fichas_epi_itens;
DROP POLICY IF EXISTS "fei delete by permission" ON public.fichas_epi_itens;
CREATE POLICY "fei insert by permission" ON public.fichas_epi_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'create')
              AND EXISTS (SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND public.pode_acessar_uf(f.uf)));
CREATE POLICY "fei update by permission" ON public.fichas_epi_itens FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit')
         AND EXISTS (SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND public.pode_acessar_uf(f.uf)))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit')
              AND EXISTS (SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND public.pode_acessar_uf(f.uf)));
CREATE POLICY "fei delete by permission" ON public.fichas_epi_itens FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'delete')
         AND EXISTS (SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND public.pode_acessar_uf(f.uf)));
