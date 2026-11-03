-- Importação da planilha de material por posto (depende de 20261030120000_pedidos_material.sql).
--
-- A planilha tem uma aba por posto com a lista de itens que o posto pede. A
-- tela Configurações de Pedidos → Importar planilha lê o arquivo no navegador,
-- liga cada aba a um posto (ou cria o posto) e chama esta função, que grava
-- tudo de uma vez:
--   * itens que ainda não existem entram no catálogo;
--   * a lista do posto passa a ser exatamente a da planilha (o encarregado só
--     vê esses itens no link).
-- O controle é só de quantidade: o "custo em contrato" da planilha não entra.
-- Re-executável.

-- Postos de Vitória (ES) entram no sistema.
INSERT INTO public.estados (uf, nome) VALUES ('ES', 'Espírito Santo') ON CONFLICT (uf) DO NOTHING;

-- Versão anterior recebia também o teto.
DROP FUNCTION IF EXISTS public.pedidos_importar_planilha(jsonb, date);

-- _postos = [{posto_id?, criar?: {nome, uf}, itens: [{nome, unidade?}]}]
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
  _criados_postos integer := 0;
  _criados_itens integer := 0;
  _listas integer := 0;
  _itens_lista integer := 0;
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
    'listas', _listas, 'itens_nas_listas', _itens_lista);
END $$;

REVOKE ALL ON FUNCTION public.pedidos_importar_planilha(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_importar_planilha(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
