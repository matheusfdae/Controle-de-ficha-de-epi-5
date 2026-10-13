-- Cache local dos colaboradores consultados na Senior (web service
-- com.senior.g5.rh.hr.consultarColaborador). Só a Edge Function
-- senior-consultar-colaborador escreve aqui (service role); a Senior
-- continua sendo a fonte da verdade. Guarda apenas os campos usados nas
-- fichas — nada de RG, filiação, CNH etc. (minimização LGPD).
CREATE TABLE public.colaboradores_senior (
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

CREATE INDEX idx_colab_senior_cpf ON public.colaboradores_senior (cpf);
CREATE INDEX idx_colab_senior_nome ON public.colaboradores_senior (lower(nome));

ALTER TABLE public.colaboradores_senior ENABLE ROW LEVEL SECURITY;

-- Leitura para quem já pode ver fichas (EPI ou uniforme); sem políticas de
-- escrita: só o service role da Edge Function grava.
CREATE POLICY "colab_senior select by permission"
ON public.colaboradores_senior FOR SELECT TO authenticated
USING (
  public.has_permission(public.current_profile_id(), 'fichas_epi', 'view')
  OR public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'view')
);

CREATE TRIGGER colab_senior_updated BEFORE UPDATE ON public.colaboradores_senior
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
