-- Termo de EPI do pedido de material (modelo "TERMO DE ENTREGA DE EPI - Rev 00").
-- Pedido com item de EPI ganha um termo coletivo (termos_epi_coletivos) ligado a ele:
--   * o encarregado, pelo link do pedido (matrícula/CPF), monta quem recebe o quê
--     (colaborador buscado pelo nome na Senior);
--   * a soma por item não passa da quantidade do pedido (atendida, depois da entrega);
--   * o termo só abre com o pedido atendido (EPI chegou) e só assina com a
--     quantidade entregue inteira distribuída: o
--     colaborador assina no celular do encarregado ou pelo link
--     /assinar-termo-coletivo/:token (o mesmo dos termos coletivos).
-- materiais.ca guarda o CA do EPI (sai no termo).
-- Depende de 20261030120000_pedidos_material.sql. Re-executável.

ALTER TABLE public.materiais ADD COLUMN IF NOT EXISTS ca text;
-- Aviso por WhatsApp ao líder quando o termo fica disponível (pedido com EPI atendido).
-- Os pedidos já atendidos antes desta mudança contam como avisados (não dispara nada antigo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'pedidos_material' AND column_name = 'termo_whatsapp_avisado') THEN
    ALTER TABLE public.pedidos_material ADD COLUMN termo_whatsapp_avisado boolean NOT NULL DEFAULT false;
    UPDATE public.pedidos_material SET termo_whatsapp_avisado = true WHERE status = 'atendida';
  END IF;
END $$;
ALTER TABLE public.termos_epi_coletivos ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos_material(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_termos_epi_coletivos_pedido ON public.termos_epi_coletivos (pedido_id) WHERE pedido_id IS NOT NULL;
ALTER TABLE public.termos_epi_coletivos_itens ADD COLUMN IF NOT EXISTS pedido_item_id uuid REFERENCES public.pedidos_material_itens(id) ON DELETE SET NULL;
ALTER TABLE public.termos_epi_coletivos_itens ADD COLUMN IF NOT EXISTS colaborador_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;

-- Pedido do encarregado (o dono do pedido), travado para alteração.
CREATE OR REPLACE FUNCTION public._pm_termo_pedido(_s public.colaboradores_senior, _pedido_id uuid)
RETURNS public.pedidos_material
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pedidos_material;
BEGIN
  SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id AND solicitante_senior_id = _s.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _p.status = 'cancelada' THEN RAISE EXCEPTION 'Este pedido foi cancelado.'; END IF;
  -- O termo só existe depois que Compras atende o pedido (EPI entregue).
  IF _p.status <> 'atendida' THEN RAISE EXCEPTION 'O Termo de EPI abre quando Compras atender o pedido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = _p.id AND m.is_epi) THEN
    RAISE EXCEPTION 'Este pedido não tem item de EPI.';
  END IF;
  RETURN _p;
END $$;

-- Quanto de cada EPI o termo pode distribuir: o entregue (depois de atendido) ou o pedido.
CREATE OR REPLACE FUNCTION public._pm_termo_limite(_i public.pedidos_material_itens)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT floor(coalesce(_i.quantidade_atendida, _i.quantidade))::integer
$$;

-- Tudo o que a tela do termo precisa: EPIs do pedido, linhas, colaboradores do posto.
CREATE OR REPLACE FUNCTION public._pm_termo_dados(_p public.pedidos_material)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pedido_id', _p.id, 'codigo', _p.codigo, 'status', _p.status,
    'liberado', _p.status = 'atendida',
    'termo_id', t.id,
    'epis', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', public._pm_nome_material(i.material_id),
                'unidade', m.unidade, 'ca', m.ca, 'limite', public._pm_termo_limite(i)) ORDER BY public._pm_nome_material(i.material_id)), '[]')
             FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = _p.id AND m.is_epi),
    'linhas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'pedido_item_id', l.pedido_item_id,
                'colaborador_senior_id', l.colaborador_senior_id, 'colaborador_nome', l.colaborador_nome, 'material', l.material,
                'ca', l.ca, 'quantidade', l.quantidade, 'assinado_em', l.data_assinatura) ORDER BY l.ordem, l.created_at), '[]')
               FROM termos_epi_coletivos_itens l WHERE l.termo_id = t.id),
    'colaboradores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cargo', c.cargo) ORDER BY c.nome), '[]')
                      FROM colaboradores_senior c
                      -- Mesma regra de _pm_posto_do_colaborador, mas calculando as chaves do posto
                      -- uma vez só (chamar a função por colaborador estourava o tempo do banco).
                      WHERE c.ativo
                        AND EXISTS (
                          SELECT 1 FROM (SELECT po.nome_chave AS k FROM postos po WHERE po.id = _p.posto_id
                                         UNION SELECT lower(regexp_replace(trim(a), '\s+', ' ', 'g'))
                                         FROM postos po, unnest(po.apelidos) a WHERE po.id = _p.posto_id) ch
                          WHERE ch.k IN (
                            lower(regexp_replace(trim(regexp_replace(coalesce(c.posto_descricao, ''), '^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*', '')), '\s+', ' ', 'g')),
                            lower(regexp_replace(trim(coalesce(c.nome_local, '')), '\s+', ' ', 'g'))))))
  FROM (SELECT NULL) x LEFT JOIN termos_epi_coletivos t ON t.pedido_id = _p.id
$$;

CREATE OR REPLACE FUNCTION public._pm_termo(_matricula integer, _cpf text, _pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo_dados(public._pm_termo_pedido(public._cracha_solicitante(_matricula, _cpf), _pedido_id));
END $$;

-- Salva as linhas do termo (as já assinadas não mudam).
-- _linhas: [{id?, pedido_item_id, colaborador_senior_id, quantidade}]
CREATE OR REPLACE FUNCTION public._pm_termo_salvar(_matricula integer, _cpf text, _pedido_id uuid, _linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _p public.pedidos_material := public._pm_termo_pedido(_s, _pedido_id);
  _termo uuid;
  _l jsonb;
  _i public.pedidos_material_itens;
  _c public.colaboradores_senior;
  _nome text;
  _qtd integer;
  _ordem integer := 0;
  _manter uuid[] := '{}';
  _id uuid;
  _excesso text;
BEGIN
  IF jsonb_typeof(coalesce(_linhas, '[]')) <> 'array' OR jsonb_array_length(coalesce(_linhas, '[]')) > 300 THEN
    RAISE EXCEPTION 'Lista inválida.';
  END IF;

  SELECT id INTO _termo FROM termos_epi_coletivos WHERE pedido_id = _p.id;
  IF _termo IS NULL THEN
    INSERT INTO termos_epi_coletivos (posto, mes_referencia, lider, observacoes, status, pedido_id, criado_por)
    VALUES ((SELECT nome FROM postos WHERE id = _p.posto_id), to_char(_p.data_pedido, 'MM/YYYY'), _s.nome,
      'Pedido de material ' || _p.codigo, 'em_assinatura', _p.id, NULL)
    RETURNING id INTO _termo;
  END IF;

  FOR _l IN SELECT * FROM jsonb_array_elements(coalesce(_linhas, '[]')) LOOP
    _ordem := _ordem + 1;
    SELECT * INTO _i FROM pedidos_material_itens WHERE id = nullif(_l->>'pedido_item_id', '')::uuid AND pedido_id = _p.id;
    IF NOT FOUND OR NOT (SELECT is_epi FROM materiais WHERE id = _i.material_id) THEN RAISE EXCEPTION 'Escolha o EPI de cada linha.'; END IF;
    _qtd := CASE WHEN (_l->>'quantidade') ~ '^\d{1,5}$' THEN (_l->>'quantidade')::integer END;
    IF coalesce(_qtd, 0) <= 0 THEN RAISE EXCEPTION 'Quantidade inválida na linha %.', _ordem; END IF;
    _c := NULL;
    IF nullif(_l->>'colaborador_senior_id', '') IS NOT NULL THEN
      SELECT * INTO _c FROM colaboradores_senior WHERE id = (_l->>'colaborador_senior_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador da linha % não encontrado.', _ordem; END IF;
    END IF;
    -- Só colaborador da Senior (buscado pelo nome): nada de nome digitado.
    IF _c.id IS NULL THEN RAISE EXCEPTION 'Busque o colaborador da linha % na Senior.', _ordem; END IF;
    _nome := _c.nome;

    _id := nullif(_l->>'id', '')::uuid;
    IF _id IS NOT NULL AND EXISTS (SELECT 1 FROM termos_epi_coletivos_itens WHERE id = _id AND termo_id = _termo AND data_assinatura IS NOT NULL) THEN
      _manter := _manter || _id;  -- assinada: fica como está
      CONTINUE;
    END IF;
    IF _id IS NOT NULL AND EXISTS (SELECT 1 FROM termos_epi_coletivos_itens WHERE id = _id AND termo_id = _termo) THEN
      UPDATE termos_epi_coletivos_itens SET ordem = _ordem, colaborador_nome = _nome, colaborador_cpf = _c.cpf, colaborador_senior_id = _c.id,
        epi_id = NULL, pedido_item_id = _i.id, material = public._pm_nome_material(_i.material_id),
        ca = (SELECT ca FROM materiais WHERE id = _i.material_id), quantidade = _qtd
      WHERE id = _id;
    ELSE
      INSERT INTO termos_epi_coletivos_itens (termo_id, ordem, colaborador_nome, colaborador_cpf, colaborador_senior_id, pedido_item_id, material, ca, quantidade)
      VALUES (_termo, _ordem, _nome, _c.cpf, _c.id, _i.id, public._pm_nome_material(_i.material_id), (SELECT ca FROM materiais WHERE id = _i.material_id), _qtd)
      RETURNING id INTO _id;
    END IF;
    _manter := _manter || _id;
  END LOOP;

  -- Linha que saiu da lista: some (assinada nunca sai).
  DELETE FROM termos_epi_coletivos_itens WHERE termo_id = _termo AND data_assinatura IS NULL AND NOT (id = ANY (_manter));

  SELECT string_agg(format('%s (%s de %s)', public._pm_nome_material(i.material_id), s.total, public._pm_termo_limite(i)), ', ') INTO _excesso
  FROM (SELECT pedido_item_id, sum(quantidade) AS total FROM termos_epi_coletivos_itens WHERE termo_id = _termo GROUP BY pedido_item_id) s
  JOIN pedidos_material_itens i ON i.id = s.pedido_item_id
  WHERE s.total > public._pm_termo_limite(i);
  IF _excesso IS NOT NULL THEN RAISE EXCEPTION 'Passa da quantidade do pedido: %.', _excesso; END IF;
  -- Linha nova num termo já finalizado reabre o termo.
  UPDATE termos_epi_coletivos SET status = 'em_assinatura'
  WHERE id = _termo AND status = 'finalizado' AND EXISTS (SELECT 1 FROM termos_epi_coletivos_itens WHERE termo_id = _termo AND data_assinatura IS NULL);
  PERFORM public._pm_termo_fechar(_termo);

  RETURN public._pm_termo_dados(_p);
END $$;

-- Linha do termo do encarregado, pronta para assinar (pedido atendido, não assinada,
-- e o EPI dela não passa do que chegou).
CREATE OR REPLACE FUNCTION public._pm_termo_linha(_s public.colaboradores_senior, _linha_id uuid)
RETURNS public.termos_epi_coletivos_itens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _l public.termos_epi_coletivos_itens;
  _p public.pedidos_material;
  _falta text;
BEGIN
  SELECT l.* INTO _l FROM termos_epi_coletivos_itens l JOIN termos_epi_coletivos t ON t.id = l.termo_id
  JOIN pedidos_material p ON p.id = t.pedido_id
  WHERE l.id = _linha_id AND p.solicitante_senior_id = _s.id FOR UPDATE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha do termo não encontrada.'; END IF;
  SELECT p.* INTO _p FROM pedidos_material p JOIN termos_epi_coletivos t ON t.pedido_id = p.id WHERE t.id = _l.termo_id;
  IF _p.status <> 'atendida' THEN RAISE EXCEPTION 'As assinaturas abrem quando o pedido for atendido (EPI entregue no posto).'; END IF;
  IF _l.data_assinatura IS NOT NULL THEN RAISE EXCEPTION 'Esta linha já foi assinada.'; END IF;
  -- Só assina com a quantidade entregue inteira distribuída (pediu 10: a soma tem que dar 10).
  _falta := public._pm_termo_falta(_l.termo_id);
  IF _falta IS NOT NULL THEN
    RAISE EXCEPTION 'Distribua a quantidade inteira entregue antes de assinar: %.', _falta;
  END IF;
  RETURN _l;
END $$;

-- EPIs do pedido que o termo ainda não distribuiu por inteiro ("Luva (6 de 10)"); NULL = completo.
CREATE OR REPLACE FUNCTION public._pm_termo_falta(_termo uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT string_agg(format('%s (%s de %s)', public._pm_nome_material(i.material_id), coalesce(s.total, 0), public._pm_termo_limite(i)), ', '
                    ORDER BY public._pm_nome_material(i.material_id))
  FROM termos_epi_coletivos t
  JOIN pedidos_material_itens i ON i.pedido_id = t.pedido_id
  JOIN materiais m ON m.id = i.material_id AND m.is_epi
  LEFT JOIN (SELECT pedido_item_id, sum(quantidade) AS total FROM termos_epi_coletivos_itens WHERE termo_id = _termo GROUP BY 1) s ON s.pedido_item_id = i.id
  WHERE t.id = _termo AND coalesce(s.total, 0) <> public._pm_termo_limite(i)
$$;

-- Termo todo assinado e com a quantidade inteira do pedido distribuída vira "finalizado".
CREATE OR REPLACE FUNCTION public._pm_termo_fechar(_termo uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE termos_epi_coletivos t SET status = 'finalizado'
  WHERE t.id = _termo AND t.pedido_id IS NOT NULL AND t.status <> 'finalizado'
    AND EXISTS (SELECT 1 FROM termos_epi_coletivos_itens WHERE termo_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM termos_epi_coletivos_itens WHERE termo_id = t.id AND data_assinatura IS NULL)
    AND public._pm_termo_falta(t.id) IS NULL
$$;

-- Termo de pedido não finaliza (nem pelo botão Finalizar) sem a quantidade do pedido inteira.
CREATE OR REPLACE FUNCTION public._pm_termo_trava_finalizar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _falta text;
BEGIN
  IF NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' AND NEW.pedido_id IS NOT NULL THEN
    _falta := public._pm_termo_falta(NEW.id);
    IF _falta IS NOT NULL THEN
      RAISE EXCEPTION 'O termo só finaliza com a quantidade do pedido inteira distribuída. Falta: %.', _falta;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pm_termo_trava_finalizar ON public.termos_epi_coletivos;
CREATE TRIGGER trg_pm_termo_trava_finalizar BEFORE UPDATE OF status ON public.termos_epi_coletivos
  FOR EACH ROW EXECUTE FUNCTION public._pm_termo_trava_finalizar();

-- Assinatura colhida no celular do encarregado.
CREATE OR REPLACE FUNCTION public._pm_termo_assinar(_matricula integer, _cpf text, _linha_id uuid, _assinatura text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _l public.termos_epi_coletivos_itens := public._pm_termo_linha(_s, _linha_id);
BEGIN
  IF _assinatura IS NULL OR _assinatura !~ '^data:image/(png|jpeg|svg\+xml);base64,' OR length(_assinatura) > 2000000 THEN
    RAISE EXCEPTION 'Assinatura inválida.';
  END IF;
  UPDATE termos_epi_coletivos_itens SET assinatura_url = _assinatura, data_assinatura = now(), ip_assinatura = 'celular do encarregado: ' || _s.nome
  WHERE id = _l.id;
  PERFORM public._pm_termo_fechar(_l.termo_id);
  RETURN public._pm_termo_dados((SELECT p FROM pedidos_material p JOIN termos_epi_coletivos t ON t.pedido_id = p.id WHERE t.id = _l.termo_id));
END $$;

-- Link para o colaborador assinar no próprio celular (reaproveita um link ainda válido).
CREATE OR REPLACE FUNCTION public._pm_termo_link(_matricula integer, _cpf text, _linha_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _l public.termos_epi_coletivos_itens := public._pm_termo_linha(_s, _linha_id);
  _token text;
BEGIN
  SELECT token INTO _token FROM termo_coletivo_tokens WHERE item_id = _l.id AND NOT usado AND expira_em > now() + interval '1 day'
  ORDER BY created_at DESC LIMIT 1;
  IF _token IS NULL THEN
    INSERT INTO termo_coletivo_tokens (item_id) VALUES (_l.id) RETURNING token INTO _token;
  END IF;
  RETURN jsonb_build_object('token', _token, 'colaborador', _l.colaborador_nome);
END $$;

-- Link assinado pelo colaborador também fecha o termo quando for o último.
CREATE OR REPLACE FUNCTION public._pm_termo_fechar_gatilho()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data_assinatura IS NOT NULL AND OLD.data_assinatura IS NULL THEN PERFORM public._pm_termo_fechar(NEW.termo_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pm_termo_fechar ON public.termos_epi_coletivos_itens;
CREATE TRIGGER trg_pm_termo_fechar AFTER UPDATE OF data_assinatura ON public.termos_epi_coletivos_itens
  FOR EACH ROW EXECUTE FUNCTION public._pm_termo_fechar_gatilho();

-- Funções chamadas pelo link do pedido: devolvem {erro} (a tentativa errada fica gravada).
CREATE OR REPLACE FUNCTION public.pedido_material_termo(_matricula integer, _cpf text, _pedido_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo(_matricula, _cpf, _pedido_id);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_termo_salvar(_matricula integer, _cpf text, _pedido_id uuid, _linhas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo_salvar(_matricula, _cpf, _pedido_id, _linhas);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_termo_assinar(_matricula integer, _cpf text, _linha_id uuid, _assinatura text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo_assinar(_matricula, _cpf, _linha_id, _assinatura);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_termo_link(_matricula integer, _cpf text, _linha_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo_link(_matricula, _cpf, _linha_id);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

-- "Meus pedidos" do link passa a dizer se o pedido tem EPI e como está o termo.
CREATE OR REPLACE FUNCTION public._pm_pedidos_do_solicitante(_sol_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.criado_em DESC), '[]') FROM (
    SELECT p.id, p.codigo, p.status, p.data_pedido, p.created_at AS criado_em, p.posto_id,
      p.recorrencia_id IS NOT NULL AS recorrente, po.nome AS posto, p.observacao,
      EXISTS (SELECT 1 FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id AND m.is_epi) AS tem_epi,
      (SELECT jsonb_build_object('linhas', count(*), 'assinadas', count(l.data_assinatura))
       FROM termos_epi_coletivos t JOIN termos_epi_coletivos_itens l ON l.termo_id = t.id WHERE t.pedido_id = p.id) AS termo,
      (SELECT jsonb_agg(jsonb_build_object('material_id', i.material_id, 'nome', public._pm_nome_material(i.material_id),
          'unidade', m.unidade, 'quantidade', i.quantidade, 'quantidade_pedida', i.quantidade_pedida,
          'quantidade_atendida', i.quantidade_atendida, 'is_epi', m.is_epi)
          ORDER BY public._pm_nome_material(i.material_id))
       FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id) AS itens,
      (SELECT jsonb_agg(jsonb_build_object('status', e.para_status, 'em', e.created_at,
          'comentario', CASE WHEN e.para_status IN ('devolvida', 'cancelada', 'atendida') THEN e.comentario END)
          ORDER BY e.created_at)
       FROM pedido_eventos e WHERE e.pedido_id = p.id) AS historico
    FROM pedidos_material p JOIN postos po ON po.id = p.posto_id
    WHERE p.solicitante_senior_id = _sol_id
    ORDER BY p.created_at DESC LIMIT 50) x
$$;

-- Busca de colaborador na Senior inteira, pelo nome (para quem não está na lista do posto).
-- Só ativos, no máximo 15, sem CPF; cada palavra digitada precisa aparecer no nome (sem acento).
CREATE OR REPLACE FUNCTION public._pm_sem_acento(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(coalesce(_t, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
$$;

CREATE OR REPLACE FUNCTION public._pm_termo_buscar(_matricula integer, _cpf text, _pedido_id uuid, _busca text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pedidos_material; _palavras text[];
BEGIN
  _p := public._pm_termo_pedido(public._cracha_solicitante(_matricula, _cpf), _pedido_id);
  _palavras := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(_busca)), '\s+'), '');
  IF length(array_to_string(_palavras, '')) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cargo', x.cargo, 'matricula', x.num_cad) ORDER BY x.nome), '[]')
          FROM (SELECT c.id, c.nome, c.cargo, c.num_cad FROM colaboradores_senior c
                WHERE c.ativo
                  AND (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w)
                ORDER BY c.nome LIMIT 15) x);
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_termo_buscar(_matricula integer, _cpf text, _pedido_id uuid, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_termo_buscar(_matricula, _cpf, _pedido_id, _busca);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

REVOKE ALL ON FUNCTION public._pm_termo_pedido(public.colaboradores_senior, uuid), public._pm_termo_dados(public.pedidos_material),
  public._pm_termo(integer, text, uuid), public._pm_termo_salvar(integer, text, uuid, jsonb),
  public._pm_termo_linha(public.colaboradores_senior, uuid), public._pm_termo_fechar(uuid), public._pm_termo_falta(uuid),
  public._pm_termo_assinar(integer, text, uuid, text), public._pm_termo_link(integer, text, uuid),
  public._pm_termo_buscar(integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_termo(integer, text, uuid), public.pedido_material_termo_salvar(integer, text, uuid, jsonb),
  public.pedido_material_termo_assinar(integer, text, uuid, text), public.pedido_material_termo_link(integer, text, uuid),
  public.pedido_material_termo_buscar(integer, text, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
