-- Envio à Senior em passos curtos (13/11/2026).
--
-- As Edge Functions da VM têm limite de 60 s por chamada e a Senior chegou a
-- levar 64 s só para ler um colaborador. Gravar + reler na mesma chamada
-- passava do limite e a função era cortada no meio, sem registrar nada.
-- Agora:
--  1. troca_posto_marcar_enviando: antes de chamar a Senior a troca fica
--     "enviando" (se a chamada cair no meio, ninguém reenvia sem conferir).
--  2. O envio grava (Posto_4) e registra na hora; se a Senior não responder a
--     tempo, fica "enviando" ('demorou').
--  3. 'conferir' relê o colaborador na Senior (R034FUN) numa chamada separada:
--     se o posto novo já está lá, marca "Gravada na Senior" sem reenviar; se
--     não está (e a troca já vale), libera "Tentar de novo".
-- Re-executável.

ALTER TABLE public.trocas_posto ADD COLUMN IF NOT EXISTS senior_envio_iniciado_em timestamptz;
ALTER TABLE public.trocas_posto DROP CONSTRAINT IF EXISTS trocas_posto_status_check;
ALTER TABLE public.trocas_posto ADD CONSTRAINT trocas_posto_status_check
  CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada', 'enviando', 'enviada', 'erro_envio', 'desfeita'));

-- "enviando" parado há mais de 3 min pode ser reenviado (a chamada anterior já acabou ou caiu).
CREATE OR REPLACE FUNCTION public.troca_posto_marcar_enviando(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.trocas_posto;
BEGIN
  IF NOT public._tp_pode_senior() THEN RAISE EXCEPTION 'Só administrador pode enviar à Senior.'; END IF;
  SELECT * INTO _t FROM trocas_posto WHERE id = _id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF _t.status = 'enviando' AND _t.senior_envio_iniciado_em > now() - interval '3 minutes' THEN
    RAISE EXCEPTION 'Esta troca já está sendo enviada à Senior. Aguarde e clique em Conferir na Senior.';
  END IF;
  IF _t.status NOT IN ('aprovada', 'erro_envio', 'enviando') THEN
    RAISE EXCEPTION 'Só troca aprovada vai para a Senior (esta está %).', _t.status;
  END IF;
  UPDATE trocas_posto SET status = 'enviando', senior_envio_iniciado_em = now(),
    senior_resposta = 'Enviando à Senior…' WHERE id = _id;
  RETURN (SELECT to_jsonb(x) FROM trocas_posto x WHERE x.id = _id);
END $$;
REVOKE ALL ON FUNCTION public.troca_posto_marcar_enviando(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.troca_posto_marcar_enviando(uuid) TO authenticated, service_role;

-- Resultado do envio/desfazer/conferência na Senior.
--  _acao 'enviar' | 'desfazer': _erro null = deu certo (_lido pode vir nulo).
--  _acao 'demorou': a Senior não respondeu a tempo ao envio (fica "enviando").
--  _acao 'desfazer_demorou': idem ao desfazer (fica "enviada", marcada para conferir).
--  _acao 'conferir': _lido = situação relida na Senior (R034FUN).
CREATE OR REPLACE FUNCTION public.troca_posto_registrar_senior(_id uuid, _acao text, _erro text, _lido jsonb, _quem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t public.trocas_posto;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _nome text := coalesce(nullif(_quem, ''), public._tp_nome_usuario(), 'sistema');
  _no_novo boolean;
  _no_atual boolean;
BEGIN
  IF NOT public._tp_pode_senior() THEN RAISE EXCEPTION 'Só administrador pode enviar à Senior.'; END IF;
  SELECT * INTO _t FROM trocas_posto WHERE id = _id FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;

  IF _acao = 'enviar' THEN
    IF _t.status NOT IN ('aprovada', 'erro_envio', 'enviando') THEN RAISE EXCEPTION 'Só troca aprovada vai para a Senior (esta está %).', _t.status; END IF;
    UPDATE trocas_posto SET status = CASE WHEN _erro IS NULL THEN 'enviada' ELSE 'erro_envio' END,
      senior_enviado_em = CASE WHEN _erro IS NULL THEN now() ELSE senior_enviado_em END,
      senior_enviado_por = _nome, senior_resposta = coalesce(left(_erro, 1000), 'Gravada na Senior.'),
      senior_lido = coalesce(_lido, senior_lido)
    WHERE id = _id;
    -- Já valendo: atualiza a lista local na hora (a sincronização com a Senior confirma depois).
    IF _erro IS NULL AND _t.data_inicio <= _hoje AND _t.colaborador_senior_id IS NOT NULL THEN
      UPDATE colaboradores_senior SET posto_estrutura = _t.posto_novo_estrutura, posto_codigo = _t.posto_novo_codigo,
        posto_descricao = _t.posto_novo_descricao,
        escala_codigo = coalesce(_t.escala_nova_codigo, escala_codigo),
        escala_nome = CASE WHEN _t.escala_nova_codigo IS NULL THEN escala_nome ELSE _t.escala_nova_nome END
      WHERE id = _t.colaborador_senior_id;
    END IF;

  ELSIF _acao = 'demorou' THEN
    IF _t.status <> 'enviando' THEN RETURN to_jsonb(_t); END IF;
    UPDATE trocas_posto SET senior_enviado_por = _nome,
      senior_resposta = 'A Senior não respondeu a tempo. Clique em "Conferir na Senior" para ver se gravou.'
    WHERE id = _id;

  ELSIF _acao = 'desfazer_demorou' THEN
    IF _t.status <> 'enviada' THEN RETURN to_jsonb(_t); END IF;
    UPDATE trocas_posto SET senior_resposta = 'Desfazendo: a Senior não respondeu a tempo. Clique em "Conferir na Senior" para ver se desfez.'
    WHERE id = _id;

  ELSIF _acao = 'desfazer' THEN
    IF _t.status <> 'enviada' THEN RAISE EXCEPTION 'Só dá para desfazer troca já gravada na Senior.'; END IF;
    IF _erro IS NULL THEN
      UPDATE trocas_posto SET status = 'desfeita', senior_desfeito_em = now(), senior_lido = coalesce(_lido, senior_lido),
        senior_resposta = 'Desfeita na Senior por ' || _nome || '.' WHERE id = _id;
      IF _t.colaborador_senior_id IS NOT NULL THEN
        UPDATE colaboradores_senior SET posto_estrutura = _t.posto_atual_estrutura, posto_codigo = _t.posto_atual_codigo,
          posto_descricao = _t.posto_atual_descricao, escala_codigo = _t.escala_atual_codigo, escala_nome = _t.escala_atual_nome
        WHERE id = _t.colaborador_senior_id AND posto_codigo = _t.posto_novo_codigo;
      END IF;
    ELSE
      UPDATE trocas_posto SET senior_resposta = 'Erro ao desfazer: ' || left(_erro, 900) WHERE id = _id;
    END IF;

  ELSIF _acao = 'conferir' THEN
    IF _lido IS NULL OR _lido ? 'erro_leitura' THEN
      UPDATE trocas_posto SET senior_lido = coalesce(_lido, senior_lido) WHERE id = _id;
      RETURN (SELECT to_jsonb(x) FROM trocas_posto x WHERE x.id = _id);
    END IF;
    _no_novo := _lido ->> 'posto' = _t.posto_novo_codigo
                AND coalesce((_lido ->> 'estrutura')::integer, _t.posto_novo_estrutura) = _t.posto_novo_estrutura;
    _no_atual := _lido ->> 'posto' IS NOT DISTINCT FROM _t.posto_atual_codigo AND NOT _no_novo;
    UPDATE trocas_posto SET senior_lido = _lido WHERE id = _id;

    IF _t.status IN ('enviando', 'erro_envio') AND _no_novo THEN
      -- Gravou (a chamada anterior caiu ou a Senior demorou): marca sem reenviar.
      UPDATE trocas_posto SET status = 'enviada', senior_enviado_em = coalesce(senior_enviado_em, now()),
        senior_enviado_por = coalesce(senior_enviado_por, _nome),
        senior_resposta = 'Confirmada na Senior pela conferência.' WHERE id = _id;
      IF _t.colaborador_senior_id IS NOT NULL THEN
        UPDATE colaboradores_senior SET posto_estrutura = _t.posto_novo_estrutura, posto_codigo = _t.posto_novo_codigo,
          posto_descricao = _t.posto_novo_descricao,
          escala_codigo = coalesce(_t.escala_nova_codigo, escala_codigo),
          escala_nome = CASE WHEN _t.escala_nova_codigo IS NULL THEN escala_nome ELSE _t.escala_nova_nome END
        WHERE id = _t.colaborador_senior_id;
      END IF;
    ELSIF _t.status = 'enviando' AND _t.data_inicio <= _hoje THEN
      -- Já valeria hoje e a Senior não mostra o posto novo: não gravou.
      UPDATE trocas_posto SET status = 'erro_envio',
        senior_resposta = 'A troca não apareceu na Senior (o colaborador continua no posto ' || coalesce(_lido ->> 'posto', '—') || '). Pode tentar enviar de novo.'
      WHERE id = _id;
    ELSIF _t.status = 'enviando' THEN
      UPDATE trocas_posto SET senior_resposta = 'A troca começa em ' || to_char(_t.data_inicio, 'DD/MM/YYYY')
        || ': até lá a Senior mostra o posto atual e não dá para conferir por aqui. Confira no G5; se não gravou, envie de novo depois de 3 minutos.'
      WHERE id = _id;
    ELSIF _t.status = 'enviada' AND _t.data_inicio <= _hoje AND _no_atual AND _t.senior_resposta LIKE 'Desfazendo:%' THEN
      -- Desfazer que caiu no meio, mas a Senior apagou: marca como desfeita.
      UPDATE trocas_posto SET status = 'desfeita', senior_desfeito_em = now(),
        senior_resposta = 'Desfeita na Senior (confirmada pela conferência).' WHERE id = _id;
      IF _t.colaborador_senior_id IS NOT NULL THEN
        UPDATE colaboradores_senior SET posto_estrutura = _t.posto_atual_estrutura, posto_codigo = _t.posto_atual_codigo,
          posto_descricao = _t.posto_atual_descricao, escala_codigo = _t.escala_atual_codigo, escala_nome = _t.escala_atual_nome
        WHERE id = _t.colaborador_senior_id AND posto_codigo = _t.posto_novo_codigo;
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;
  RETURN (SELECT to_jsonb(x) FROM trocas_posto x WHERE x.id = _id);
END $$;

NOTIFY pgrst, 'reload schema';
