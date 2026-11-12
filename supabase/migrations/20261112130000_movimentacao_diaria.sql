-- Controle de Movimentação Diária (substitui o Microsoft Forms "CONTROLE DE
-- MOVIMENTAÇÃO DIARIA MATRIZ DF").
--
-- O fiscal lança, pelo link público (matrícula ou CPF, igual ao pedido de
-- material), quem faltou e quem cobriu. A DATA é ele quem escolhe (hoje, ontem,
-- anteontem...). Regra do status (a mesma da planilha):
--   * data informada = dia do lançamento (horário de Brasília) -> OK
--   * qualquer outra data                                      -> DIVERGENTE
-- Plantão noturno (12 h): fiscal marcado em movimentacao_fiscais_noturnos que
-- lança depois da meia-noite com a data do plantão (dia anterior) fica OK,
-- desde que lance até o fim do plantão (entrada + 12 h) + a tolerância de
-- movimentacao_config.tolerancia_noturno_min. Ex.: 19:00 às 07:00, tolerância
-- de 60 min -> o plantão de 11/11 aceita lançamento com data 11/11 até 12/11 08:00.
-- Lançamento DIVERGENTE manda e-mail (função avisar-movimentacao, a cada 5 min
-- pelo agendador da VM) para os e-mails de movimentacao_config.emails_divergencia.
-- Uma vez por lançamento: coluna email_avisado_em.
--
-- Funções públicas SECURITY DEFINER liberadas para anon: validam o fiscal a
-- cada chamada (mesma trava de tentativas do crachá) e nunca devolvem CPF.
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.movimentacoes_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT ('MOV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Data que o fiscal informou no formulário.
  data_movimentacao date NOT NULL,
  -- Dia (Brasília) em que o lançamento foi feito.
  data_lancamento date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  status text NOT NULL CHECK (status IN ('ok', 'divergente')),
  empresa text NOT NULL CHECK (empresa IN ('MATRIZ', 'APOIO')),
  uf text,
  fiscal_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  fiscal_matricula text,
  fiscal_nome text NOT NULL,
  falta_matricula text NOT NULL,
  falta_nome text NOT NULL,
  -- Sem cobertura (posto descoberto / reserva): as duas ficam nulas.
  cobertura_matricula text,
  cobertura_nome text,
  posto_id uuid REFERENCES public.postos(id) ON DELETE SET NULL,
  posto_nome text NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('FALTA', 'TREINAMENTO', 'REFORÇO', 'SDF')),
  justificativa text,
  horario text NOT NULL,
  turno text NOT NULL CHECK (turno IN ('DIURNO', 'NOTURNO')),
  cobertura_por_extra boolean NOT NULL,
  ocorrencias_plantao smallint CHECK (ocorrencias_plantao BETWEEN 0 AND 10),
  email_avisado_em timestamptz
);
-- Quem faltou / quem cobriu: escolhidos na Senior (nome e matrícula copiados de lá).
ALTER TABLE public.movimentacoes_diarias ADD COLUMN IF NOT EXISTS falta_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;
ALTER TABLE public.movimentacoes_diarias ADD COLUMN IF NOT EXISTS cobertura_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;
-- OK só por causa do plantão noturno (data do plantão, lançado depois da meia-noite).
ALTER TABLE public.movimentacoes_diarias ADD COLUMN IF NOT EXISTS ok_pelo_plantao boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_mov_data ON public.movimentacoes_diarias (data_movimentacao DESC);
CREATE INDEX IF NOT EXISTS idx_mov_fiscal ON public.movimentacoes_diarias (fiscal_senior_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_aviso ON public.movimentacoes_diarias (created_at) WHERE status = 'divergente' AND email_avisado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.movimentacao_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  emails_divergencia text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.movimentacao_config ADD COLUMN IF NOT EXISTS tolerancia_noturno_min integer NOT NULL DEFAULT 60
  CHECK (tolerancia_noturno_min BETWEEN 0 AND 360);
INSERT INTO public.movimentacao_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Fiscais de plantão noturno (12 h a partir da entrada). Quem não está aqui é diurno.
CREATE TABLE IF NOT EXISTS public.movimentacao_fiscais_noturnos (
  senior_id uuid PRIMARY KEY REFERENCES public.colaboradores_senior(id) ON DELETE CASCADE,
  entrada time NOT NULL DEFAULT '19:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Sem policies: só pelas funções abaixo (que conferem a permissão).
ALTER TABLE public.movimentacao_fiscais_noturnos ENABLE ROW LEVEL SECURITY;

-- ---------- Acesso pelo sistema (módulo "movimentacao") ----------
ALTER TABLE public.movimentacoes_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacao_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimentacao ver" ON public.movimentacoes_diarias;
CREATE POLICY "movimentacao ver" ON public.movimentacoes_diarias FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'movimentacao', 'view')
         AND (uf IS NULL OR public.pode_acessar_uf(uf)));
DROP POLICY IF EXISTS "movimentacao excluir" ON public.movimentacoes_diarias;
CREATE POLICY "movimentacao excluir" ON public.movimentacoes_diarias FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'movimentacao', 'delete')
         AND (uf IS NULL OR public.pode_acessar_uf(uf)));

DROP POLICY IF EXISTS "movimentacao_config ver" ON public.movimentacao_config;
CREATE POLICY "movimentacao_config ver" ON public.movimentacao_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'movimentacao', 'view'));
DROP POLICY IF EXISTS "movimentacao_config alterar" ON public.movimentacao_config;
CREATE POLICY "movimentacao_config alterar" ON public.movimentacao_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'movimentacao', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'movimentacao', 'edit'));

-- Marca como avisados (botão "Enviar avisos agora" no localhost; a função usa o service role).
CREATE OR REPLACE FUNCTION public.movimentacao_marcar_avisado(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'movimentacao', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  UPDATE movimentacoes_diarias SET email_avisado_em = now()
  WHERE id = ANY(_ids) AND status = 'divergente' AND email_avisado_em IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.movimentacao_marcar_avisado(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentacao_marcar_avisado(uuid[]) TO authenticated;

-- ---------- Plantão noturno ----------
-- Plantão em curso do fiscal, no horário de Brasília (_agora sem fuso).
-- Noturno ainda dentro do plantão que começou ontem (até entrada + 12 h + tolerância) -> data de ontem.
CREATE OR REPLACE FUNCTION public._mov_plantao(_fiscal uuid, _agora timestamp)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN n.senior_id IS NULL THEN
      jsonb_build_object('noturno', false, 'data_plantao', _agora::date)
    ELSE jsonb_build_object(
      'noturno', true,
      'entrada', to_char(n.entrada, 'HH24:MI'),
      'saida', to_char(n.entrada + interval '12 hours', 'HH24:MI'),
      'tolerancia_min', c.tolerancia_noturno_min,
      'data_plantao', CASE WHEN _agora < (_agora::date - 1) + n.entrada + interval '12 hours' + make_interval(mins => c.tolerancia_noturno_min)
                           THEN _agora::date - 1 ELSE _agora::date END,
      -- Até quando (Brasília) o plantão que começou ontem aceita lançamento com a data de ontem.
      'aceita_ate', to_char((_agora::date - 1) + n.entrada + interval '12 hours' + make_interval(mins => c.tolerancia_noturno_min), 'YYYY-MM-DD"T"HH24:MI'))
    END
  FROM (SELECT 1) x
  LEFT JOIN movimentacao_fiscais_noturnos n ON n.senior_id = _fiscal
  CROSS JOIN (SELECT tolerancia_noturno_min FROM movimentacao_config WHERE id = 1) c
$$;
REVOKE ALL ON FUNCTION public._mov_plantao(uuid, timestamp) FROM PUBLIC, anon, authenticated;

-- Tela "Plantão noturno" (módulo movimentacao): listar, buscar na Senior, salvar e remover.
CREATE OR REPLACE FUNCTION public.movimentacao_noturnos_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'movimentacao', 'view') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  RETURN jsonb_build_object(
    'tolerancia_min', (SELECT tolerancia_noturno_min FROM movimentacao_config WHERE id = 1),
    'fiscais', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'senior_id', c.id, 'nome', c.nome, 'matricula', c.num_cad, 'cargo', c.cargo, 'uf', c.uf, 'local', c.nome_local,
        'ativo', c.ativo, 'entrada', to_char(n.entrada, 'HH24:MI'), 'saida', to_char(n.entrada + interval '12 hours', 'HH24:MI'))
        ORDER BY c.nome), '[]')
      FROM movimentacao_fiscais_noturnos n JOIN colaboradores_senior c ON c.id = n.senior_id
      WHERE c.uf IS NULL OR public.pode_acessar_uf(c.uf)));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_noturnos_buscar(_busca text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t text := trim(coalesce(_busca, ''));
  _palavras text[] := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(coalesce(_busca, ''))), '\s+'), '');
  _mat integer;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'movimentacao', 'edit') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF _t ~ '^\d{1,9}$' THEN
    _mat := _t::integer;
  ELSIF length(array_to_string(_palavras, '')) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'matricula', x.num_cad, 'cargo', x.cargo,
            'local', x.nome_local, 'uf', x.uf, 'noturno', x.noturno) ORDER BY x.nome), '[]')
          FROM (SELECT c.id, c.nome, c.num_cad, c.cargo, c.nome_local, c.uf,
                       EXISTS (SELECT 1 FROM movimentacao_fiscais_noturnos n WHERE n.senior_id = c.id) AS noturno
                FROM colaboradores_senior c
                WHERE c.ativo AND (c.uf IS NULL OR public.pode_acessar_uf(c.uf))
                  AND CASE WHEN _mat IS NOT NULL THEN c.num_cad = _mat
                           ELSE (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w) END
                ORDER BY c.nome LIMIT 15) x);
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_noturnos_salvar(_senior_id uuid, _entrada time)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'movimentacao', 'edit') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM colaboradores_senior WHERE id = _senior_id AND (uf IS NULL OR public.pode_acessar_uf(uf))) THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;
  INSERT INTO movimentacao_fiscais_noturnos (senior_id, entrada) VALUES (_senior_id, coalesce(_entrada, '19:00'))
  ON CONFLICT (senior_id) DO UPDATE SET entrada = EXCLUDED.entrada, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_noturnos_remover(_senior_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'movimentacao', 'edit') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  DELETE FROM movimentacao_fiscais_noturnos n USING colaboradores_senior c
  WHERE n.senior_id = _senior_id AND c.id = n.senior_id AND (c.uf IS NULL OR public.pode_acessar_uf(c.uf));
END $$;

REVOKE ALL ON FUNCTION public.movimentacao_noturnos_listar() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_noturnos_buscar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_noturnos_salvar(uuid, time) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.movimentacao_noturnos_remover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentacao_noturnos_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_noturnos_buscar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_noturnos_salvar(uuid, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_noturnos_remover(uuid) TO authenticated;

-- ---------- Link público do fiscal ----------
CREATE OR REPLACE FUNCTION public._mov_lancamentos_do_fiscal(_fiscal uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'codigo', m.codigo, 'criado_em', m.created_at, 'data', m.data_movimentacao,
           'status', m.status, 'posto', m.posto_nome, 'motivo', m.motivo, 'falta_nome', m.falta_nome,
           'cobertura_nome', m.cobertura_nome, 'horario', m.horario, 'turno', m.turno, 'ok_pelo_plantao', m.ok_pelo_plantao)
         ORDER BY m.created_at DESC), '[]')
  FROM (SELECT * FROM movimentacoes_diarias WHERE fiscal_senior_id = _fiscal
        ORDER BY created_at DESC LIMIT 40) m
$$;

CREATE OR REPLACE FUNCTION public._mov_identificar(_matricula integer, _cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
BEGIN
  RETURN jsonb_build_object(
    'nome', _s.nome, 'matricula', _s.num_cad, 'cargo', _s.cargo, 'uf', _s.uf,
    'hoje', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'plantao', public._mov_plantao(_s.id, (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp),
    'postos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) ORDER BY p.nome), '[]')
               FROM postos p WHERE p.ativo AND (_s.uf IS NULL OR p.uf = _s.uf)),
    'lancamentos', public._mov_lancamentos_do_fiscal(_s.id));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_identificar(_matricula integer, _cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._mov_identificar(_matricula, _cpf);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

-- Versão anterior (só matrícula -> nome) sai: a busca abaixo substitui.
DROP FUNCTION IF EXISTS public.movimentacao_colaborador(integer, text, integer);
DROP FUNCTION IF EXISTS public._mov_colaborador(integer, text, integer);

-- Busca de colaborador ativo na Senior por nome (3+ letras), matrícula ou CPF.
-- Devolve até 15: id, nome, matrícula, cargo e local. Nunca devolve o CPF.
CREATE OR REPLACE FUNCTION public._mov_buscar(_sol_matricula integer, _sol_cpf text, _modo text, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _dig text := regexp_replace(coalesce(_busca, ''), '\D', '', 'g');
  _palavras text[];
BEGIN
  IF _modo = 'matricula' THEN
    IF _dig = '' OR length(_dig) > 9 THEN RETURN '[]'::jsonb; END IF;
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'matricula', c.num_cad, 'cargo', c.cargo, 'local', c.nome_local) ORDER BY c.nome), '[]')
            FROM colaboradores_senior c WHERE c.ativo AND c.num_cad = _dig::integer);
  ELSIF _modo = 'cpf' THEN
    IF length(_dig) <> 11 THEN RETURN '[]'::jsonb; END IF;
    RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'matricula', c.num_cad, 'cargo', c.cargo, 'local', c.nome_local) ORDER BY c.data_admissao DESC NULLS LAST), '[]')
            FROM colaboradores_senior c WHERE c.ativo AND c.cpf = _dig);
  END IF;
  _palavras := array_remove(regexp_split_to_array(public._pm_sem_acento(trim(coalesce(_busca, ''))), '\s+'), '');
  IF length(array_to_string(_palavras, '')) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'matricula', x.num_cad, 'cargo', x.cargo, 'local', x.nome_local) ORDER BY x.nome), '[]')
          FROM (SELECT c.id, c.nome, c.num_cad, c.cargo, c.nome_local FROM colaboradores_senior c
                WHERE c.ativo AND (SELECT bool_and(public._pm_sem_acento(c.nome) LIKE '%' || w || '%') FROM unnest(_palavras) w)
                ORDER BY c.nome LIMIT 15) x);
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_buscar_colaborador(_sol_matricula integer, _sol_cpf text, _modo text, _busca text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._mov_buscar(_sol_matricula, _sol_cpf, _modo, _busca);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

CREATE OR REPLACE FUNCTION public._mov_enviar(_sol_matricula integer, _sol_cpf text, _d jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_sol_matricula, _sol_cpf);
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Noturno depois da meia-noite: a data do plantão (ontem) também conta como OK.
  _data_plantao date := (public._mov_plantao(_s.id, (now() AT TIME ZONE 'America/Sao_Paulo')::timestamp) ->> 'data_plantao')::date;
  _data date;
  _posto public.postos;
  _posto_nome text := nullif(trim(_d ->> 'posto_nome'), '');
  _sem_cobertura boolean := coalesce((_d ->> 'sem_cobertura')::boolean, false);
  _txt text;
  _m public.movimentacoes_diarias;
  _recentes integer;
  _falta public.colaboradores_senior;
  _cob public.colaboradores_senior;
BEGIN
  BEGIN _data := (_d ->> 'data')::date;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Data inválida.'; END;
  IF _data IS NULL THEN RAISE EXCEPTION 'Informe a data.'; END IF;
  IF _data > _hoje THEN RAISE EXCEPTION 'A data não pode ser depois de hoje.'; END IF;
  IF _data < _hoje - 366 THEN RAISE EXCEPTION 'Data muito antiga. Confira o ano.'; END IF;

  -- Trava contra envio em massa: 60 lançamentos por fiscal por hora.
  SELECT count(*) INTO _recentes FROM movimentacoes_diarias
  WHERE fiscal_senior_id = _s.id AND created_at > now() - interval '1 hour';
  IF _recentes >= 60 THEN RAISE EXCEPTION 'Muitos lançamentos em pouco tempo. Aguarde e tente de novo.'; END IF;

  IF nullif(_d ->> 'posto_id', '') IS NOT NULL THEN
    SELECT * INTO _posto FROM postos WHERE id = (_d ->> 'posto_id')::uuid AND ativo;
    IF _posto.id IS NULL THEN RAISE EXCEPTION 'Posto não encontrado.'; END IF;
    _posto_nome := _posto.nome;
  END IF;
  IF _posto_nome IS NULL THEN RAISE EXCEPTION 'Informe o posto da extra.'; END IF;

  FOREACH _txt IN ARRAY ARRAY['empresa', 'motivo', 'horario', 'turno'] LOOP
    IF nullif(trim(_d ->> _txt), '') IS NULL THEN
      RAISE EXCEPTION 'Preencha todos os campos obrigatórios (%).', _txt;
    END IF;
  END LOOP;
  SELECT * INTO _falta FROM colaboradores_senior WHERE id = nullif(_d ->> 'falta_senior_id', '')::uuid;
  IF _falta.id IS NULL THEN RAISE EXCEPTION 'Escolha na lista da Senior quem está na falta.'; END IF;
  IF NOT _sem_cobertura THEN
    SELECT * INTO _cob FROM colaboradores_senior WHERE id = nullif(_d ->> 'cobertura_senior_id', '')::uuid;
    IF _cob.id IS NULL THEN RAISE EXCEPTION 'Escolha na lista da Senior quem efetuou a cobertura (ou marque "Ninguém cobriu").'; END IF;
    IF _cob.id = _falta.id THEN RAISE EXCEPTION 'Quem cobriu não pode ser a mesma pessoa que faltou.'; END IF;
  END IF;
  IF (_d ->> 'cobertura_por_extra') IS NULL THEN RAISE EXCEPTION 'Informe se a cobertura foi por extra.'; END IF;

  INSERT INTO movimentacoes_diarias (
    data_movimentacao, data_lancamento, status, empresa, uf, fiscal_senior_id, fiscal_matricula, fiscal_nome,
    falta_senior_id, falta_matricula, falta_nome, cobertura_senior_id, cobertura_matricula, cobertura_nome, posto_id, posto_nome,
    motivo, justificativa, horario, turno, cobertura_por_extra, ocorrencias_plantao, ok_pelo_plantao)
  VALUES (
    _data, _hoje, CASE WHEN _data IN (_hoje, _data_plantao) THEN 'ok' ELSE 'divergente' END,
    upper(trim(_d ->> 'empresa')), coalesce(_posto.uf, _s.uf), _s.id, _s.num_cad::text, _s.nome,
    _falta.id, _falta.num_cad::text, _falta.nome,
    _cob.id, _cob.num_cad::text, _cob.nome,
    _posto.id, left(_posto_nome, 150),
    upper(trim(_d ->> 'motivo')), left(nullif(trim(_d ->> 'justificativa'), ''), 500),
    left(trim(_d ->> 'horario'), 40), upper(trim(_d ->> 'turno')),
    (_d ->> 'cobertura_por_extra')::boolean,
    nullif(_d ->> 'ocorrencias', '')::smallint,
    _data <> _hoje AND _data = _data_plantao)
  RETURNING * INTO _m;

  RETURN jsonb_build_object('ok', true, 'codigo', _m.codigo, 'status', _m.status,
    'data', _m.data_movimentacao, 'data_lancamento', _m.data_lancamento, 'ok_pelo_plantao', _m.ok_pelo_plantao,
    'lancamentos', public._mov_lancamentos_do_fiscal(_s.id));
END $$;

CREATE OR REPLACE FUNCTION public.movimentacao_enviar(_sol_matricula integer, _sol_cpf text, _dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._mov_enviar(_sol_matricula, _sol_cpf, _dados);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception OR check_violation OR invalid_text_representation THEN
  RETURN public._cracha_erro(SQLSTATE, CASE WHEN SQLSTATE = '23514' THEN 'Algum campo tem valor inválido.' ELSE SQLERRM END,
    public._cracha_chave(_sol_matricula, _sol_cpf));
END $$;

REVOKE ALL ON FUNCTION public._mov_identificar(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_buscar(integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_enviar(integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mov_lancamentos_do_fiscal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_identificar(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_buscar_colaborador(integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentacao_enviar(integer, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
