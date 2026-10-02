-- =========================================================
-- Cadastro de fornecedores de EPI/uniforme. O CNPJ é o que liga a nota
-- (XML ou PDF do DANFE) ao fornecedor na tela de entrada de estoque.
-- =========================================================
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  -- Só dígitos; NULL enquanto o CNPJ não for confirmado.
  cnpj text UNIQUE CHECK (cnpj ~ '^\d{14}$'),
  nicho text,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_fornecedores_updated BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fornecedores select by permission" ON public.fornecedores FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view'));
CREATE POLICY "fornecedores insert by permission" ON public.fornecedores FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create'));
CREATE POLICY "fornecedores update by permission" ON public.fornecedores FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit'));
CREATE POLICY "fornecedores delete by permission" ON public.fornecedores FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete'));

-- Fornecedores de EPI/uniforme marcados na planilha de fornecedores (out/2026).
-- Stillus, War Militaria e Raphael Duplo R ficam sem CNPJ: os números da
-- planilha não passaram no dígito verificador (ou não havia) — completar na tela.
INSERT INTO public.fornecedores (nome, cnpj, nicho, observacao) VALUES
  ('POSITIVE COMUNICACAO DIGITAL LTDA', '42742028000144', 'Locação de radiocomunicação', NULL),
  ('AGC CONFECCOES U P LTDA', '72650542000110', 'Uniformes', NULL),
  ('CALCADOS KALLUCCI DE FRANCA LTDA - EPP', '65677890000116', 'Coturno brigada', NULL),
  ('CASA DO SAPATO E VESTUARIO LTDA', '58053367000153', 'Sapatos', NULL),
  ('CONCEITO CONFECCAO DE UNIFORMES EIRELI', '33514094000176', 'Uniformes (Iguatemi / CAF) - terno gabardine', NULL),
  ('RAPHAEL DUPLO R', NULL, 'Uniforme verde', 'Confirmar CNPJ'),
  ('STILLUS COMERCIO DE TECIDOS E UNIFORMES', NULL,
   'Camisa social azul, calça social preta, blazer em oxford preto, gravata, cinto social preto, rede para cabelo, meia 3/4',
   'Confirmar CNPJ (planilha: 05.988.065/0001-57, dígito não confere)'),
  ('WAR MILITARIA ARTIGOS MILITARES LTDA', NULL,
   'Cinto em nylon, capa de colete, fiel e apito, coldre, porta tonfa, tonfa, lanterna tática',
   'Confirmar CNPJ (planilha: 09.432.837/0001-11, dígito não confere)');
