-- Atualização da lista da Senior em partes (por período de admissão), para
-- cada chamada caber no limite de 60 s das Edge Functions da VM.
-- Os desligados só são marcados no fim, por senior_inativar_ausentes, depois
-- que todas as partes deram certo. Re-executável.

DROP FUNCTION IF EXISTS public.sincronizar_colaboradores_senior(integer[], jsonb);
DROP FUNCTION IF EXISTS public.sincronizar_colaboradores_senior(integer[], jsonb, boolean);

-- _inativar = true: quem é dessas empresas e não veio na lista fica ativo = false
-- (só para lista COMPLETA); false: só grava (lista parcial, um período).
CREATE FUNCTION public.sincronizar_colaboradores_senior(_empresas integer[], _dados jsonb, _inativar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora timestamptz := now();
  _gravados integer;
  _inativados integer := 0;
BEGIN
  IF NOT public.pode_sincronizar_senior() THEN
    RAISE EXCEPTION 'Sem permissão para atualizar os colaboradores da Senior';
  END IF;
  IF jsonb_typeof(_dados) <> 'array' THEN
    RAISE EXCEPTION 'Dados inválidos';
  END IF;
  IF _inativar AND jsonb_array_length(_dados) = 0 THEN
    RAISE EXCEPTION 'Lista vazia: nada foi alterado';
  END IF;

  INSERT INTO colaboradores_senior AS c (
    num_emp, tip_col, num_cad, nome, cpf, telefone, email, data_admissao, empresa_nome, cod_fil,
    razao_social, cod_local, nome_local, cod_cargo, cargo, cod_centro_custo, centro_custo,
    situacao, situacao_descricao, data_afastamento, uf, ativo, sincronizado_em
  )
  SELECT d.num_emp, d.tip_col, d.num_cad, d.nome, d.cpf, d.telefone, d.email, d.data_admissao,
         d.empresa_nome, d.cod_fil, d.razao_social, d.cod_local, d.nome_local, d.cod_cargo, d.cargo,
         d.cod_centro_custo, d.centro_custo, d.situacao, d.situacao_descricao, d.data_afastamento,
         d.uf, true, _agora
  FROM jsonb_to_recordset(_dados) AS d(
    num_emp integer, tip_col integer, num_cad integer, nome text, cpf text, telefone text, email text,
    data_admissao date, empresa_nome text, cod_fil integer, razao_social text, cod_local text,
    nome_local text, cod_cargo text, cargo text, cod_centro_custo text, centro_custo text,
    situacao integer, situacao_descricao text, data_afastamento date, uf text
  )
  WHERE d.num_emp = ANY(_empresas) AND d.num_cad IS NOT NULL AND coalesce(d.nome, '') <> ''
  ON CONFLICT (num_emp, tip_col, num_cad) DO UPDATE SET
    nome = EXCLUDED.nome, cpf = EXCLUDED.cpf, telefone = EXCLUDED.telefone, email = EXCLUDED.email,
    data_admissao = EXCLUDED.data_admissao, empresa_nome = EXCLUDED.empresa_nome,
    cod_fil = EXCLUDED.cod_fil, razao_social = EXCLUDED.razao_social, cod_local = EXCLUDED.cod_local,
    nome_local = EXCLUDED.nome_local, cod_cargo = EXCLUDED.cod_cargo, cargo = EXCLUDED.cargo,
    cod_centro_custo = EXCLUDED.cod_centro_custo, centro_custo = EXCLUDED.centro_custo,
    situacao = EXCLUDED.situacao, situacao_descricao = EXCLUDED.situacao_descricao,
    data_afastamento = EXCLUDED.data_afastamento, uf = EXCLUDED.uf, ativo = true,
    sincronizado_em = _agora;
  GET DIAGNOSTICS _gravados = ROW_COUNT;

  IF _inativar THEN
    UPDATE colaboradores_senior SET ativo = false
    WHERE num_emp = ANY(_empresas) AND ativo AND sincronizado_em < _agora;
    GET DIAGNOSTICS _inativados = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('gravados', _gravados, 'inativados', _inativados, 'sincronizado_em', _agora);
END;
$$;

-- Fim da atualização em partes: quem é da empresa e não foi gravado desde
-- `_desde` (o começo da atualização) saiu da Senior.
CREATE OR REPLACE FUNCTION public.senior_inativar_ausentes(_empresa integer, _desde timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.pode_sincronizar_senior() THEN
    RAISE EXCEPTION 'Sem permissão para atualizar os colaboradores da Senior';
  END IF;
  IF _desde IS NULL OR _desde > now() OR _desde < now() - interval '6 hours' THEN
    RAISE EXCEPTION 'Início da atualização inválido';
  END IF;
  -- Trava de segurança: se quase ninguém foi gravado nesta rodada, algo falhou — não inativa.
  IF (SELECT count(*) FROM colaboradores_senior WHERE num_emp = _empresa AND sincronizado_em >= _desde)
     < 0.5 * (SELECT count(*) FROM colaboradores_senior WHERE num_emp = _empresa AND ativo) THEN
    RAISE EXCEPTION 'Menos da metade dos colaboradores da empresa % veio nesta atualização: nada foi marcado como desligado', _empresa;
  END IF;
  UPDATE colaboradores_senior SET ativo = false
  WHERE num_emp = _empresa AND ativo AND sincronizado_em < _desde;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_colaboradores_senior(integer[], jsonb, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.senior_inativar_ausentes(integer, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_colaboradores_senior(integer[], jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.senior_inativar_ausentes(integer, timestamptz) TO authenticated, service_role;
