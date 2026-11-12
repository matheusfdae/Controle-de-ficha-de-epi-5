-- Passagem de plantão (Movimentação Diária).
--
-- No fim do plantão o fiscal clica em "Passar o plantão" no link público:
-- escolhe o dia do plantão, quem recebe (opcional, da Senior) e escreve as
-- observações. A passagem fica registrada aqui e a função avisar-movimentacao
-- (a cada 5 min pelo agendador da VM, ou no botão "Enviar avisos pendentes
-- agora") manda o e-mail com o relatório do dia em PDF anexo:
--   * para: movimentacao_config.emails_passagem (vazio -> emails_divergencia);
--   * cópia: e-mail da Senior de quem entrega e de quem recebe, se houver.
-- O PDF é montado no servidor a partir do banco (o navegador não manda arquivo).
-- Depende de 20261113120000 (_mov_lancamento_json). Re-executável.

ALTER TABLE public.movimentacao_config ADD COLUMN IF NOT EXISTS emails_passagem text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.movimentacao_passagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT ('PAS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at timestamptz NOT NULL DEFAULT now(),
  data_plantao date NOT NULL,
  fiscal_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  fiscal_matricula text,
  fiscal_nome text NOT NULL,
  recebe_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  recebe_matricula text,
  recebe_nome text,
  observacao text,
  email_enviado_em timestamptz,
  email_tentativas smallint NOT NULL DEFAULT 0,
  email_erro text
);
CREATE INDEX IF NOT EXISTS idx_mov_passagem_pend ON public.movimentacao_passagens (created_at) WHERE email_enviado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_mov_passagem_fiscal ON public.movimentacao_passagens (fiscal_senior_id, created_at DESC);

ALTER TABLE public.movimentacao_passagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movimentacao passagens ver" ON public.movimentacao_passagens;
CREATE POLICY "movimentacao passagens ver" ON public.movimentacao_passagens FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'movimentacao', 'view'));

-- Dados do relatório de um fiscal num dia (mesma regra do relatório do link).
CREATE OR REPLACE FUNCTION public._mov_lancamentos_do_dia(_fiscal uuid, _data date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(public._mov_lancamento_json(m) ORDER BY m.data_movimentacao, m.created_at), '[]')
  FROM movimentacoes_diarias m
  WHERE m.fiscal_senior_id = _fiscal AND (m.data_movimentacao = _data OR m.data_lancamento = _data)
$$;

-- Link público: registra a passagem. Até 5 por fiscal e dia de plantão.
CREATE OR REPLACE FUNCTION public._mov_passagem(_sol_matricula integer, _sol_cpf text, _d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _data date;
  _r public.colaboradores_senior;
  _obs text := nullif(left(trim(coalesce(_d ->> 'observacao', '')), 1000), '');
  _p public.movimentacao_passagens;
BEGIN
  BEGIN _data := (_d ->> 'data')::date; EXCEPTION WHEN others THEN _data := NULL; END;
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe o dia do plantão.'; END IF;
  IF _data > _hoje OR _data < _hoje - 2 THEN RAISE EXCEPTION 'O dia do plantão tem que ser hoje ou até 2 dias antes.'; END IF;
  IF nullif(_d ->> 'recebe_senior_id', '') IS NOT NULL THEN
    SELECT * INTO _r FROM colaboradores_senior WHERE id = (_d ->> 'recebe_senior_id')::uuid AND ativo;
    IF _r.id IS NULL THEN RAISE EXCEPTION 'Colaborador que recebe o plantão não encontrado na Senior.'; END IF;
    IF _r.id = _s.id THEN RAISE EXCEPTION 'Quem recebe o plantão não pode ser você.'; END IF;
  END IF;
  IF (SELECT count(*) FROM movimentacao_passagens WHERE fiscal_senior_id = _s.id AND data_plantao = _data) >= 5 THEN
    RAISE EXCEPTION 'Você já enviou 5 passagens deste plantão. Fale com a fiscalização.';
  END IF;
  INSERT INTO movimentacao_passagens (data_plantao, fiscal_senior_id, fiscal_matricula, fiscal_nome,
    recebe_senior_id, recebe_matricula, recebe_nome, observacao)
  VALUES (_data, _s.id, _s.num_cad::text, _s.nome, _r.id, _r.num_cad::text, _r.nome, _obs)
  RETURNING * INTO _p;
  RETURN jsonb_build_object('ok', true, 'codigo', _p.codigo, 'data', _p.data_plantao,
    'lancamentos', jsonb_array_length(public._mov_lancamentos_do_dia(_s.id, _data)));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_passar_plantao(_sol_matricula integer, _sol_cpf text, _dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._mov_passagem(_sol_matricula, _sol_cpf, _dados);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

-- Função de e-mail (service role) e botão "Enviar avisos pendentes agora" no
-- localhost (quem edita o módulo): relatório da passagem + e-mails da Senior.
CREATE OR REPLACE FUNCTION public._mov_pode_enviar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR public.has_permission(public.current_profile_id(), 'movimentacao', 'edit')
$$;

CREATE OR REPLACE FUNCTION public.movimentacao_passagem_dados(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._mov_pode_enviar() THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  RETURN (SELECT jsonb_build_object(
    'id', p.id,
    'fiscal', jsonb_build_object('nome', p.fiscal_nome, 'matricula', p.fiscal_matricula, 'cargo', f.cargo),
    'data', p.data_plantao,
    'gerado_em', now(),
    'passagem', jsonb_build_object('codigo', p.codigo, 'criado_em', p.created_at,
      'recebe_nome', p.recebe_nome, 'recebe_matricula', p.recebe_matricula, 'observacao', p.observacao),
    'lancamentos', public._mov_lancamentos_do_dia(p.fiscal_senior_id, p.data_plantao),
    'emails_senior', jsonb_build_array(f.email, r.email))
  FROM movimentacao_passagens p
  LEFT JOIN colaboradores_senior f ON f.id = p.fiscal_senior_id
  LEFT JOIN colaboradores_senior r ON r.id = p.recebe_senior_id
  WHERE p.id = _id);
END $$;

-- Passagens esperando o e-mail (até 5 tentativas), mais antigas primeiro.
CREATE OR REPLACE FUNCTION public.movimentacao_passagens_pendentes()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._mov_pode_enviar() THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  RETURN (SELECT coalesce(array_agg(id ORDER BY created_at), '{}') FROM (
    SELECT id, created_at FROM movimentacao_passagens
    WHERE email_enviado_em IS NULL AND email_tentativas < 5 ORDER BY created_at LIMIT 20) x);
END $$;

-- Fecha o envio (ok) ou conta a tentativa com o erro.
CREATE OR REPLACE FUNCTION public.movimentacao_passagem_marcar(_id uuid, _erro text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._mov_pode_enviar() THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  UPDATE movimentacao_passagens SET
    email_enviado_em = CASE WHEN _erro IS NULL THEN now() ELSE email_enviado_em END,
    email_tentativas = email_tentativas + 1,
    email_erro = left(_erro, 500)
  WHERE id = _id AND email_enviado_em IS NULL;
END $$;

REVOKE ALL ON FUNCTION public._mov_lancamentos_do_dia(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_passagem(integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.movimentacao_passar_plantao(integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.movimentacao_passar_plantao(integer, text, jsonb) TO anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_pode_enviar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_passagem_dados(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_passagens_pendentes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_passagem_marcar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._mov_pode_enviar() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movimentacao_passagem_dados(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movimentacao_passagens_pendentes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.movimentacao_passagem_marcar(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
