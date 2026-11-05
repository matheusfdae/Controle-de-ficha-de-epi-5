-- Master: quem pode apagar qualquer registro do sistema, pela tela /master.
--   * Só quem está em usuarios_master (sem tela para dar Master: só por SQL na VM).
--     Começa com matheus.xavier@grupo5estrelas.com.br.
--   * Apagar leva junto tudo o que está ligado ao registro (seguindo as chaves
--     estrangeiras do banco); ligações "ON DELETE SET NULL" só são desligadas.
--   * Tudo vai para a lixeira (master_lixeira_*) por 90 dias e pode ser restaurado:
--     as linhas voltam com os mesmos ids e as ligações desligadas são refeitas.
--   * Apagar e restaurar rodam com os gatilhos normais (ex.: apagar item de ficha
--     devolve o estoque; restaurar dá a baixa de novo).
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.usuarios_master (
  profile_id uuid PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.usuarios_master ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios_master FROM anon, authenticated;

INSERT INTO public.usuarios_master (profile_id)
SELECT id FROM public.profiles WHERE lower(trim(email)) = 'matheus.xavier@grupo5estrelas.com.br'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.master_lixeira_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela text NOT NULL,
  resumo text,
  quantidades jsonb NOT NULL DEFAULT '{}',
  total integer NOT NULL,
  motivo text,
  apagado_por uuid,
  apagado_por_nome text,
  apagado_em timestamptz NOT NULL DEFAULT now(),
  restaurado_em timestamptz,
  restaurado_por_nome text
);
CREATE TABLE IF NOT EXISTS public.master_lixeira_itens (
  id bigserial PRIMARY KEY,
  lote_id uuid NOT NULL REFERENCES public.master_lixeira_lotes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('linha', 'vinculo')),
  tabela text NOT NULL,
  nivel integer NOT NULL DEFAULT 0,
  pk jsonb NOT NULL,
  dados jsonb NOT NULL,
  colunas text[]
);
CREATE INDEX IF NOT EXISTS idx_master_lixeira_itens_lote ON public.master_lixeira_itens (lote_id);
ALTER TABLE public.master_lixeira_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_lixeira_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_lixeira_lotes, public.master_lixeira_itens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._master()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios_master WHERE profile_id = public.current_profile_id())
$$;

CREATE OR REPLACE FUNCTION public.sou_master()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public._master(), false)
$$;
REVOKE ALL ON FUNCTION public.sou_master() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sou_master() TO authenticated;

-- Colunas da chave primária (NULL se a tabela não tem).
CREATE OR REPLACE FUNCTION public._master_pk_cols(_t regclass)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT array_agg(a.attname::text ORDER BY k.o)
  FROM pg_index i
  CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY k(n, o)
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.n
  WHERE i.indrelid = _t AND i.indisprimary
$$;

-- Expressão SQL que identifica a linha `_alias` de `_t` como jsonb (a chave primária;
-- sem chave, a linha inteira).
CREATE OR REPLACE FUNCTION public._master_pk_expr(_t regclass, _alias text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT 'jsonb_build_object(' || string_agg(format('%L, %I.%I', c, _alias, c), ', ') || ')' FROM unnest(public._master_pk_cols(_t)) c),
    format('to_jsonb(%I)', _alias))
$$;

-- Texto curto para mostrar um registro qualquer na tela.
CREATE OR REPLACE FUNCTION public._master_resumo(r jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(concat_ws(' · ',
    nullif(r->>'codigo', ''),
    coalesce(nullif(r->>'nome_completo', ''), nullif(r->>'nome', ''), nullif(r->>'colaborador_nome', ''), nullif(r->>'solicitante_nome', ''),
      nullif(r->>'titulo', ''), nullif(r->>'descricao', ''), nullif(r->>'email', ''), nullif(r->>'chave', ''))), ''),
    r->>'id', left(r::text, 80))
$$;

-- Colunas das FKs (na ordem) de uma constraint.
CREATE OR REPLACE FUNCTION public._master_fk_cols(_rel oid, _keys int2[])
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT array_agg(a.attname::text ORDER BY k.o)
  FROM unnest(_keys) WITH ORDINALITY k(n, o)
  JOIN pg_attribute a ON a.attrelid = _rel AND a.attnum = k.n
$$;

-- Junta em _mc os registros escolhidos e tudo o que depende deles (nível = distância
-- até o registro escolhido; apagar vai do maior nível para o menor) e em _mv as
-- ligações ON DELETE SET NULL/DEFAULT que serão desligadas.
CREATE OR REPLACE FUNCTION public._master_coletar(_t regclass, _ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pk text[] := public._master_pk_cols(_t);
  _n integer := 0;
  _novos integer;
  _qtd integer;
  _cond text;
  f record;
BEGIN
  IF _pk IS NULL OR array_length(_pk, 1) <> 1 THEN
    RAISE EXCEPTION 'A tabela % não tem chave simples; não dá para escolher registros dela.', _t;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _mc (tabela regclass, pk jsonb, r jsonb, nivel integer, PRIMARY KEY (tabela, pk)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _mv (tabela regclass, pk jsonb, colunas text[], r jsonb, PRIMARY KEY (tabela, pk, colunas)) ON COMMIT DROP;
  TRUNCATE _mc;
  TRUNCATE _mv;

  EXECUTE format('INSERT INTO _mc SELECT %L::regclass, %s, to_jsonb(x), 0 FROM %s x WHERE x.%I::text = ANY($1)',
    _t, public._master_pk_expr(_t, 'x'), _t, _pk[1]) USING _ids;
  IF NOT EXISTS (SELECT 1 FROM _mc) THEN RAISE EXCEPTION 'Nenhum registro encontrado (já foi apagado?).'; END IF;

  LOOP
    _novos := 0;
    FOR f IN
      SELECT c.conrelid::regclass AS filho, c.confrelid::regclass AS pai,
        public._master_fk_cols(c.conrelid, c.conkey) AS cf, public._master_fk_cols(c.confrelid, c.confkey) AS cp
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confdeltype IN ('a', 'r', 'c')
        AND c.confrelid IN (SELECT DISTINCT tabela FROM _mc WHERE nivel = _n)
    LOOP
      SELECT string_agg(format('to_jsonb(c.%I) = m.r->%L', f.cf[i], f.cp[i]), ' AND ') INTO _cond FROM generate_subscripts(f.cf, 1) i;
      EXECUTE format(
        'INSERT INTO _mc SELECT %L::regclass, %s, to_jsonb(c), %s FROM %s c
           WHERE EXISTS (SELECT 1 FROM _mc m WHERE m.tabela = %L::regclass AND m.nivel = %s AND %s)
         ON CONFLICT (tabela, pk) DO UPDATE SET nivel = excluded.nivel WHERE _mc.nivel < excluded.nivel',
        f.filho, public._master_pk_expr(f.filho, 'c'), _n + 1, f.filho, f.pai, _n, _cond);
      GET DIAGNOSTICS _qtd = ROW_COUNT;
      _novos := _novos + _qtd;
    END LOOP;
    EXIT WHEN _novos = 0;
    _n := _n + 1;
    IF _n > 40 THEN RAISE EXCEPTION 'Ligações demais (ou em círculo) a partir deste registro; não dá para apagar por aqui.'; END IF;
    IF (SELECT count(*) FROM _mc) > 50000 THEN RAISE EXCEPTION 'Mais de 50 mil registros ligados; apague por partes.'; END IF;
  END LOOP;

  FOR f IN
    SELECT c.conrelid::regclass AS filho, c.confrelid::regclass AS pai,
      public._master_fk_cols(c.conrelid, c.conkey) AS cf, public._master_fk_cols(c.confrelid, c.confkey) AS cp
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confdeltype IN ('n', 'd')
      AND c.confrelid IN (SELECT DISTINCT tabela FROM _mc)
  LOOP
    SELECT string_agg(format('to_jsonb(c.%I) = m.r->%L', f.cf[i], f.cp[i]), ' AND ') INTO _cond FROM generate_subscripts(f.cf, 1) i;
    EXECUTE format(
      'INSERT INTO _mv SELECT %1$L::regclass, %2$s, %3$L::text[], (SELECT jsonb_object_agg(k, to_jsonb(c) -> k) FROM unnest(%3$L::text[]) k) FROM %1$s c
         WHERE EXISTS (SELECT 1 FROM _mc m WHERE m.tabela = %4$L::regclass AND %5$s)
           AND NOT EXISTS (SELECT 1 FROM _mc z WHERE z.tabela = %1$L::regclass AND z.pk = %2$s)
       ON CONFLICT DO NOTHING',
      f.filho, public._master_pk_expr(f.filho, 'c'), f.cf, f.pai, _cond);
  END LOOP;

  IF EXISTS (SELECT 1 FROM _mc WHERE tabela::text IN ('usuarios_master', 'master_lixeira_lotes', 'master_lixeira_itens')) THEN
    RAISE EXCEPTION 'Os registros do próprio Master não podem ser apagados por aqui.';
  END IF;
  IF EXISTS (SELECT 1 FROM _mc WHERE tabela = 'public.profiles'::regclass AND r->>'id' IN (SELECT profile_id::text FROM usuarios_master)) THEN
    RAISE EXCEPTION 'Não dá para apagar um usuário Master (nem o seu próprio).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._master_tabela(_tabela text)
RETURNS regclass LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _t regclass := to_regclass(_tabela);
BEGIN
  IF _t IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = _t AND relkind IN ('r', 'p') AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Tabela % não encontrada.', _tabela;
  END IF;
  IF _t::text IN ('usuarios_master', 'master_lixeira_lotes', 'master_lixeira_itens') THEN
    RAISE EXCEPTION 'Os registros do próprio Master não podem ser apagados por aqui.';
  END IF;
  RETURN _t;
END $$;

-- Lista as tabelas (com quantos registros cada uma tem) para a tela escolher.
CREATE OR REPLACE FUNCTION public.master_tabelas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _n bigint; _out jsonb := '[]';
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  FOR r IN
    SELECT c.oid::regclass AS t FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND c.relname NOT IN ('usuarios_master', 'master_lixeira_lotes', 'master_lixeira_itens')
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %s', r.t) INTO _n;
    _out := _out || jsonb_build_object('tabela', r.t::text, 'registros', _n,
      'selecionavel', coalesce(array_length(public._master_pk_cols(r.t), 1) = 1, false));
  END LOOP;
  RETURN _out;
END $$;

-- Busca registros de uma tabela (texto em qualquer coluna), mais recentes primeiro.
CREATE OR REPLACE FUNCTION public.master_buscar(_tabela text, _busca text, _limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t regclass;
  _pk text[];
  _ordem text;
  _out jsonb;
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  _t := public._master_tabela(_tabela);
  _pk := public._master_pk_cols(_t);
  IF _pk IS NULL OR array_length(_pk, 1) <> 1 THEN RAISE EXCEPTION 'A tabela % não tem chave simples; não dá para escolher registros dela.', _t; END IF;
  SELECT format('x.%I DESC NULLS LAST', attname) INTO _ordem FROM pg_attribute
  WHERE attrelid = _t AND NOT attisdropped AND attname IN ('created_at', 'criado_em', 'data_pedido', 'updated_at')
  ORDER BY array_position(ARRAY['created_at', 'criado_em', 'data_pedido', 'updated_at'], attname::text) LIMIT 1;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(jsonb_build_object(''id'', s.id, ''resumo'', public._master_resumo(s.r), ''dados'', s.r)), ''[]'')
     FROM (SELECT x.%I::text AS id, to_jsonb(x) AS r FROM %s x
           WHERE $1 = '''' OR to_jsonb(x)::text ILIKE ''%%'' || $1 || ''%%''
           ORDER BY %s LIMIT $2) s',
    _pk[1], _t, coalesce(_ordem, format('x.%I', _pk[1])))
  INTO _out USING coalesce(trim(_busca), ''), least(greatest(coalesce(_limite, 100), 1), 500);
  RETURN _out;
END $$;

-- O que será apagado (e desligado) junto com os registros escolhidos.
CREATE OR REPLACE FUNCTION public.master_previa(_tabela text, _ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  PERFORM public._master_coletar(public._master_tabela(_tabela), _ids);
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM _mc),
    'apaga', (SELECT coalesce(jsonb_agg(jsonb_build_object('tabela', tabela, 'quantidade', n) ORDER BY nv, tabela), '[]')
              FROM (SELECT tabela::text AS tabela, count(*) AS n, min(nivel) AS nv FROM _mc GROUP BY tabela) s),
    'desliga', (SELECT coalesce(jsonb_agg(jsonb_build_object('tabela', tabela, 'quantidade', n) ORDER BY tabela), '[]')
                FROM (SELECT tabela::text AS tabela, count(DISTINCT pk) AS n FROM _mv GROUP BY tabela) s));
END $$;

CREATE OR REPLACE FUNCTION public._master_limpar_lixeira()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM master_lixeira_lotes WHERE apagado_em < now() - interval '90 days'
$$;

-- Apaga os registros escolhidos e tudo o que depende deles, guardando na lixeira.
CREATE OR REPLACE FUNCTION public.master_apagar(_tabela text, _ids text[], _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t regclass;
  _lote uuid;
  _total integer;
  _resumo text;
  _raiz integer;
  g record;
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  _t := public._master_tabela(_tabela);
  PERFORM public._master_limpar_lixeira();
  PERFORM public._master_coletar(_t, _ids);

  SELECT count(*) INTO _total FROM _mc;
  SELECT string_agg(s.x, ', ') INTO _resumo
  FROM (SELECT public._master_resumo(_mc.r) AS x FROM _mc WHERE nivel = 0 ORDER BY 1 LIMIT 3) s;
  SELECT count(*) INTO _raiz FROM _mc WHERE nivel = 0;
  IF _raiz > 3 THEN _resumo := _resumo || format(' e mais %s', _raiz - 3); END IF;

  INSERT INTO master_lixeira_lotes (tabela, resumo, quantidades, total, motivo, apagado_por, apagado_por_nome)
  VALUES (_t::text, _resumo,
    (SELECT jsonb_object_agg(tabela, n) FROM (SELECT tabela::text AS tabela, count(*) AS n FROM _mc GROUP BY tabela) s),
    _total, nullif(left(trim(coalesce(_motivo, '')), 500), ''), public.current_profile_id(),
    (SELECT nullif(trim(coalesce(nome_completo, '')), '') FROM profiles WHERE id = public.current_profile_id()))
  RETURNING id INTO _lote;
  INSERT INTO master_lixeira_itens (lote_id, tipo, tabela, nivel, pk, dados)
  SELECT _lote, 'linha', _mc.tabela::text, _mc.nivel, _mc.pk, _mc.r FROM _mc;
  INSERT INTO master_lixeira_itens (lote_id, tipo, tabela, pk, dados, colunas)
  SELECT _lote, 'vinculo', _mv.tabela::text, _mv.pk, _mv.r, _mv.colunas FROM _mv;

  -- Do mais distante para o escolhido: quem depende sai antes.
  FOR g IN SELECT DISTINCT nivel, tabela FROM _mc ORDER BY nivel DESC LOOP
    EXECUTE format('DELETE FROM %s x WHERE %s IN (SELECT pk FROM _mc WHERE tabela = %L::regclass AND nivel = %s)',
      g.tabela, public._master_pk_expr(g.tabela, 'x'), g.tabela, g.nivel);
  END LOOP;

  RETURN jsonb_build_object('lote', _lote, 'total', _total);
END $$;

-- Lixeira: o que foi apagado nos últimos 90 dias.
CREATE OR REPLACE FUNCTION public.master_lixeira()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  PERFORM public._master_limpar_lixeira();
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.apagado_em DESC), '[]')
          FROM (SELECT id, tabela, resumo, quantidades, total, motivo, apagado_por_nome, apagado_em, restaurado_em, restaurado_por_nome
                FROM master_lixeira_lotes ORDER BY apagado_em DESC LIMIT 300) l);
END $$;

-- Restaura um lote: as linhas voltam (dos registros escolhidos para os dependentes)
-- e as ligações desligadas são refeitas onde continuam vazias.
CREATE OR REPLACE FUNCTION public.master_restaurar(_lote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _l master_lixeira_lotes;
  _t regclass;
  _cols text;
  _ovr text;
  _set text;
  _onde text;
  _n integer := 0;
  _qtd integer;
  r record;
BEGIN
  IF NOT coalesce(public._master(), false) THEN RAISE EXCEPTION 'Só o Master pode fazer isso.'; END IF;
  SELECT * INTO _l FROM master_lixeira_lotes WHERE id = _lote FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da lixeira não encontrado (mais de 90 dias?).'; END IF;
  IF _l.restaurado_em IS NOT NULL THEN RAISE EXCEPTION 'Isto já foi restaurado.'; END IF;

  FOR r IN SELECT DISTINCT nivel, tabela FROM master_lixeira_itens WHERE lote_id = _lote AND tipo = 'linha' ORDER BY nivel, tabela LOOP
    _t := to_regclass(r.tabela);
    IF _t IS NULL THEN RAISE EXCEPTION 'A tabela % não existe mais; não dá para restaurar.', r.tabela; END IF;
    -- Só as colunas que existem hoje e estavam no registro guardado; geradas ficam de fora.
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO _cols
    FROM pg_attribute a
    WHERE a.attrelid = _t AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      AND EXISTS (SELECT 1 FROM master_lixeira_itens i WHERE i.lote_id = _lote AND i.tipo = 'linha' AND i.tabela = r.tabela AND i.nivel = r.nivel AND i.dados ? a.attname);
    _ovr := CASE WHEN (SELECT bool_or(a.attidentity = 'a') FROM pg_attribute a WHERE a.attrelid = _t AND NOT a.attisdropped) THEN 'OVERRIDING SYSTEM VALUE' ELSE '' END;
    BEGIN
      EXECUTE format('INSERT INTO %s (%s) %s SELECT %s FROM jsonb_populate_recordset(NULL::%s, $1)', _t, _cols, _ovr, _cols, _t)
      USING (SELECT jsonb_agg(dados) FROM master_lixeira_itens WHERE lote_id = _lote AND tipo = 'linha' AND tabela = r.tabela AND nivel = r.nivel);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Não deu para restaurar: já existe de novo um registro igual em % (%).', r.tabela, SQLERRM;
    END;
    GET DIAGNOSTICS _qtd = ROW_COUNT;
    _n := _n + _qtd;
  END LOOP;

  FOR r IN SELECT tabela, pk, dados, colunas FROM master_lixeira_itens WHERE lote_id = _lote AND tipo = 'vinculo' LOOP
    _t := to_regclass(r.tabela);
    CONTINUE WHEN _t IS NULL;
    SELECT string_agg(format('%1$I = p.%1$I', c), ', '), string_agg(format('x.%I IS NULL', c), ' AND ') INTO _set, _onde FROM unnest(r.colunas) c;
    EXECUTE format('UPDATE %s x SET %s FROM jsonb_populate_record(NULL::%s, $1) p WHERE %s = $2 AND %s',
      _t, _set, _t, public._master_pk_expr(_t, 'x'), _onde) USING r.dados, r.pk;
  END LOOP;

  UPDATE master_lixeira_lotes SET restaurado_em = now(),
    restaurado_por_nome = (SELECT nullif(trim(coalesce(nome_completo, '')), '') FROM profiles WHERE id = public.current_profile_id())
  WHERE id = _lote;
  DELETE FROM master_lixeira_itens WHERE lote_id = _lote;
  RETURN jsonb_build_object('restaurados', _n);
END $$;

REVOKE ALL ON FUNCTION public.master_tabelas(), public.master_buscar(text, text, integer), public.master_previa(text, text[]),
  public.master_apagar(text, text[], text), public.master_lixeira(), public.master_restaurar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_tabelas(), public.master_buscar(text, text, integer), public.master_previa(text, text[]),
  public.master_apagar(text, text[], text), public.master_lixeira(), public.master_restaurar(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._master(), public._master_coletar(regclass, text[]), public._master_limpar_lixeira() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
