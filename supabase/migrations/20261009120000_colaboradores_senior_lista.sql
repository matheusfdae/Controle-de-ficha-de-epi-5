-- Módulo "Colaboradores Senior": lista de todos os colaboradores ativos na
-- Senior (web service colaboradoresAdmitidos), para ver quem já tem ficha.
-- Re-executável: pode rodar no SQL Editor mais de uma vez.

-- Tabela (a migration 20260929120000 cria igual; aqui fica idempotente para
-- bancos em que aquela ainda não rodou).
CREATE TABLE IF NOT EXISTS public.colaboradores_senior (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  num_emp integer NOT NULL,
  tip_col integer NOT NULL,
  num_cad integer NOT NULL,
  nome text NOT NULL,
  cpf text,
  telefone text,
  email text,
  data_admissao date,
  empresa_nome text,
  cod_fil integer,
  razao_social text,
  cod_local text,
  nome_local text,
  cod_cargo text,
  cargo text,
  cod_centro_custo text,
  centro_custo text,
  situacao integer,
  situacao_descricao text,
  data_afastamento date,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (num_emp, tip_col, num_cad)
);
CREATE INDEX IF NOT EXISTS idx_colab_senior_cpf ON public.colaboradores_senior (cpf);
CREATE INDEX IF NOT EXISTS idx_colab_senior_nome ON public.colaboradores_senior (lower(nome));

-- Estado (pela filial) e se ainda veio na última sincronização (quem sai da
-- lista da Senior foi demitido: fica marcado, não é apagado).
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_colab_senior_uf ON public.colaboradores_senior (uf);

ALTER TABLE public.colaboradores_senior ENABLE ROW LEVEL SECURITY;

-- Leitura: quem tem o módulo e acesso ao estado do colaborador.
DROP POLICY IF EXISTS "colab_senior select by permission" ON public.colaboradores_senior;
DROP POLICY IF EXISTS "colab_senior select" ON public.colaboradores_senior;
CREATE POLICY "colab_senior select" ON public.colaboradores_senior FOR SELECT TO authenticated
USING (
  public.has_permission(public.current_profile_id(), 'colaboradores', 'view')
  AND public.pode_acessar_uf(uf)
);
-- Sem policy de escrita: grava só a função abaixo (ou o service role).

DROP TRIGGER IF EXISTS colab_senior_updated ON public.colaboradores_senior;
CREATE TRIGGER colab_senior_updated BEFORE UPDATE ON public.colaboradores_senior
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recebe a lista completa de uma ou mais empresas da Senior e grava.
-- Quem estava na tabela, é dessas empresas e não veio na lista fica ativo = false.
CREATE OR REPLACE FUNCTION public.sincronizar_colaboradores_senior(_empresas integer[], _dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agora timestamptz := now();
  _gravados integer;
  _inativados integer;
BEGIN
  -- O agendador da VM chama pela Edge Function com o service role (sem usuário).
  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role'
     AND NOT public.has_permission(public.current_profile_id(), 'colaboradores', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para atualizar os colaboradores da Senior';
  END IF;
  IF jsonb_typeof(_dados) <> 'array' OR jsonb_array_length(_dados) = 0 THEN
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

  UPDATE colaboradores_senior SET ativo = false
  WHERE num_emp = ANY(_empresas) AND ativo AND sincronizado_em < _agora;
  GET DIAGNOSTICS _inativados = ROW_COUNT;

  RETURN jsonb_build_object('gravados', _gravados, 'inativados', _inativados);
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_colaboradores_senior(integer[], jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sincronizar_colaboradores_senior(integer[], jsonb) TO authenticated, service_role;

-- Segredos do servidor (credenciais da Senior, segredo do agendador).
-- SÓ o service role lê: RLS sem nenhuma policy + sem GRANT. Mesma tabela do
-- envio de e-mail; IF NOT EXISTS para valer em qualquer ordem.
CREATE TABLE IF NOT EXISTS public.config_segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.config_segredos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_segredos FROM anon, authenticated;

-- ---------- Posto de trabalho e escala (tabelas R034FUN, R017POS, R006ESC) ----------
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS posto_estrutura integer;
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS posto_codigo text;
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS posto_descricao text;
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS escala_codigo integer;
ALTER TABLE public.colaboradores_senior ADD COLUMN IF NOT EXISTS escala_nome text;

-- Mesmo controle de acesso da sincronização: usuário com colaboradores/edit ou o agendador.
CREATE OR REPLACE FUNCTION public.pode_sincronizar_senior()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      OR public.has_permission(public.current_profile_id(), 'colaboradores', 'edit');
$$;

-- Etapa 2: código do posto e da escala de cada colaborador de uma empresa.
CREATE OR REPLACE FUNCTION public.senior_gravar_postos_escalas(_empresa integer, _dados jsonb)
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
  UPDATE colaboradores_senior c SET
    posto_estrutura = d.posto_estrutura, posto_codigo = d.posto_codigo, escala_codigo = d.escala_codigo,
    posto_descricao = CASE WHEN c.posto_codigo IS DISTINCT FROM d.posto_codigo
                            OR c.posto_estrutura IS DISTINCT FROM d.posto_estrutura THEN NULL ELSE c.posto_descricao END,
    escala_nome = CASE WHEN c.escala_codigo IS DISTINCT FROM d.escala_codigo THEN NULL ELSE c.escala_nome END
  FROM jsonb_to_recordset(_dados) AS d(
    num_emp integer, tip_col integer, num_cad integer, posto_estrutura integer, posto_codigo text, escala_codigo integer
  )
  WHERE d.num_emp = _empresa AND c.num_emp = d.num_emp AND c.tip_col = d.tip_col AND c.num_cad = d.num_cad;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- Etapa 3: descrições dos postos e nomes das escalas.
CREATE OR REPLACE FUNCTION public.senior_gravar_descricoes(_postos jsonb, _escalas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _p integer; _e integer;
BEGIN
  IF NOT public.pode_sincronizar_senior() THEN
    RAISE EXCEPTION 'Sem permissão para atualizar os colaboradores da Senior';
  END IF;
  UPDATE colaboradores_senior c SET posto_descricao = d.descricao
  FROM jsonb_to_recordset(coalesce(_postos, '[]')) AS d(posto_estrutura integer, posto_codigo text, descricao text)
  WHERE c.posto_estrutura = d.posto_estrutura AND c.posto_codigo = d.posto_codigo
    AND c.posto_descricao IS DISTINCT FROM d.descricao;
  GET DIAGNOSTICS _p = ROW_COUNT;
  UPDATE colaboradores_senior c SET escala_nome = d.nome
  FROM jsonb_to_recordset(coalesce(_escalas, '[]')) AS d(codigo integer, nome text)
  WHERE c.escala_codigo = d.codigo AND c.escala_nome IS DISTINCT FROM d.nome;
  GET DIAGNOSTICS _e = ROW_COUNT;
  RETURN jsonb_build_object('postos', _p, 'escalas', _e);
END;
$$;

REVOKE ALL ON FUNCTION public.pode_sincronizar_senior() FROM public, anon;
REVOKE ALL ON FUNCTION public.senior_gravar_postos_escalas(integer, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.senior_gravar_descricoes(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pode_sincronizar_senior() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.senior_gravar_postos_escalas(integer, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.senior_gravar_descricoes(jsonb, jsonb) TO authenticated, service_role;
