-- RG no crachá: a lista da Senior (colaboradoresAdmitidos) já traz o número do
-- RG (numCid); passa a ser guardado em colaboradores_senior e espelhado para
-- cracha_employees, como o CPF. Só o número — órgão emissor, UF e data de
-- expedição continuam fora (minimização LGPD). Re-executável.
--
-- Os RGs aparecem na próxima atualização da lista da Senior (agendador da VM
-- ou botão "Atualizar da Senior").

ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS rg text;

-- Mesma função de 20261013130000_senior_etapas.sql, agora com rg.
CREATE OR REPLACE FUNCTION public.sincronizar_colaboradores_senior(_empresas integer[], _dados jsonb, _inativar boolean DEFAULT true)
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
    num_emp, tip_col, num_cad, nome, cpf, rg, telefone, email, data_admissao, empresa_nome, cod_fil,
    razao_social, cod_local, nome_local, cod_cargo, cargo, cod_centro_custo, centro_custo,
    situacao, situacao_descricao, data_afastamento, uf, ativo, sincronizado_em
  )
  SELECT d.num_emp, d.tip_col, d.num_cad, d.nome, d.cpf, d.rg, d.telefone, d.email, d.data_admissao,
         d.empresa_nome, d.cod_fil, d.razao_social, d.cod_local, d.nome_local, d.cod_cargo, d.cargo,
         d.cod_centro_custo, d.centro_custo, d.situacao, d.situacao_descricao, d.data_afastamento,
         d.uf, true, _agora
  FROM jsonb_to_recordset(_dados) AS d(
    num_emp integer, tip_col integer, num_cad integer, nome text, cpf text, rg text, telefone text, email text,
    data_admissao date, empresa_nome text, cod_fil integer, razao_social text, cod_local text,
    nome_local text, cod_cargo text, cargo text, cod_centro_custo text, centro_custo text,
    situacao integer, situacao_descricao text, data_afastamento date, uf text
  )
  WHERE d.num_emp = ANY(_empresas) AND d.num_cad IS NOT NULL AND coalesce(d.nome, '') <> ''
  ON CONFLICT (num_emp, tip_col, num_cad) DO UPDATE SET
    nome = EXCLUDED.nome, cpf = EXCLUDED.cpf, rg = EXCLUDED.rg, telefone = EXCLUDED.telefone, email = EXCLUDED.email,
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

-- Espelho Senior -> crachás (20261015120000_modulo_crachas.sql), agora com rg.
-- Se a Senior vier sem RG, fica o que o RH digitou no cadastro do crachá.
CREATE OR REPLACE FUNCTION public.cracha_espelhar_senior()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.nome, NEW.num_cad, NEW.cargo, NEW.empresa_nome, NEW.razao_social, NEW.cpf, NEW.rg, NEW.telefone, NEW.ativo)
         IS NOT DISTINCT FROM
         (OLD.nome, OLD.num_cad, OLD.cargo, OLD.empresa_nome, OLD.razao_social, OLD.cpf, OLD.rg, OLD.telefone, OLD.ativo) THEN
    RETURN NEW;
  END IF;

  IF NEW.ativo THEN
    INSERT INTO public.cracha_employees (senior_id, employee_id, full_name, role, company, cpf, rg, phone)
    VALUES (NEW.id, NEW.num_cad::text, NEW.nome, NEW.cargo, COALESCE(NEW.empresa_nome, NEW.razao_social), NEW.cpf, NEW.rg, NEW.telefone)
    ON CONFLICT (senior_id) DO UPDATE SET
      employee_id = EXCLUDED.employee_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role,
      company = EXCLUDED.company, cpf = EXCLUDED.cpf, rg = COALESCE(EXCLUDED.rg, cracha_employees.rg),
      phone = EXCLUDED.phone, desligado_em = NULL;
  ELSE
    -- Saiu da Senior: fica marcado (não apaga, para não perder o histórico de lotes).
    UPDATE public.cracha_employees SET desligado_em = COALESCE(desligado_em, now())
    WHERE senior_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Linha do crachá criada pela solicitação (20261020150000_cracha_solicitacao_senior.sql), agora com rg.
CREATE OR REPLACE FUNCTION public._cracha_linha(_c public.colaboradores_senior)
RETURNS public.cracha_employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _e public.cracha_employees;
BEGIN
  SELECT * INTO _e FROM cracha_employees WHERE senior_id = _c.id;
  IF _e.id IS NULL THEN
    INSERT INTO cracha_employees (senior_id, employee_id, full_name, role, company, cpf, rg, phone)
    VALUES (_c.id, _c.num_cad::text, _c.nome, _c.cargo, _c.empresa_nome, _c.cpf, _c.rg, _c.telefone)
    RETURNING * INTO _e;
  END IF;
  RETURN _e;
END $$;
