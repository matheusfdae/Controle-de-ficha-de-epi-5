-- Funções (e seus EPIs padrão) por estado: cada estado tem as suas, cada
-- usuário só vê/edita as dos estados que acessa (pode_acessar_uf, igual ao
-- estoque e às fichas) e editar a de um estado não muda as dos outros. As que
-- existem hoje ficam no DF (todo o cadastro atual é do DF). Re-executável.

ALTER TABLE public.funcoes ADD COLUMN IF NOT EXISTS uf text REFERENCES public.estados(uf);
UPDATE public.funcoes SET uf = 'DF' WHERE uf IS NULL;
ALTER TABLE public.funcoes ALTER COLUMN uf SET NOT NULL;

-- O nome passa a ser único dentro do estado (o mesmo nome pode existir em outro).
ALTER TABLE public.funcoes DROP CONSTRAINT IF EXISTS funcoes_nome_key;
DO $$ BEGIN
  ALTER TABLE public.funcoes ADD CONSTRAINT funcoes_uf_nome_key UNIQUE (uf, nome);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_funcoes_uf ON public.funcoes (uf, nome);

-- A função não troca de estado depois de criada (copiar cria outra).
CREATE OR REPLACE FUNCTION public.travar_uf_funcao()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.uf IS DISTINCT FROM OLD.uf THEN
    RAISE EXCEPTION 'A função não pode mudar de estado. Use "Copiar de outro estado".';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_travar_uf_funcao ON public.funcoes;
CREATE TRIGGER trg_travar_uf_funcao BEFORE UPDATE ON public.funcoes
  FOR EACH ROW EXECUTE FUNCTION public.travar_uf_funcao();

-- RLS: permissão do módulo + estado que o usuário acessa.
DROP POLICY IF EXISTS "funcoes select auth" ON public.funcoes;
DROP POLICY IF EXISTS "funcoes select por estado" ON public.funcoes;
CREATE POLICY "funcoes select por estado" ON public.funcoes FOR SELECT TO authenticated
  USING (public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "funcoes insert by permission" ON public.funcoes;
CREATE POLICY "funcoes insert by permission" ON public.funcoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'create') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "funcoes update by permission" ON public.funcoes;
CREATE POLICY "funcoes update by permission" ON public.funcoes FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "funcoes delete by permission" ON public.funcoes;
CREATE POLICY "funcoes delete by permission" ON public.funcoes FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'delete') AND public.pode_acessar_uf(uf));

-- EPIs padrão seguem o estado da função.
DROP POLICY IF EXISTS "funcao_epis select auth" ON public.funcao_epis;
DROP POLICY IF EXISTS "funcao_epis select por estado" ON public.funcao_epis;
CREATE POLICY "funcao_epis select por estado" ON public.funcao_epis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.funcoes f WHERE f.id = funcao_id AND public.pode_acessar_uf(f.uf)));
DROP POLICY IF EXISTS "funcao_epis insert by permission" ON public.funcao_epis;
CREATE POLICY "funcao_epis insert by permission" ON public.funcao_epis FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'create')
    AND EXISTS (SELECT 1 FROM public.funcoes f WHERE f.id = funcao_id AND public.pode_acessar_uf(f.uf)));
DROP POLICY IF EXISTS "funcao_epis update by permission" ON public.funcao_epis;
CREATE POLICY "funcao_epis update by permission" ON public.funcao_epis FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'edit')
    AND EXISTS (SELECT 1 FROM public.funcoes f WHERE f.id = funcao_id AND public.pode_acessar_uf(f.uf)))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'edit')
    AND EXISTS (SELECT 1 FROM public.funcoes f WHERE f.id = funcao_id AND public.pode_acessar_uf(f.uf)));
DROP POLICY IF EXISTS "funcao_epis delete by permission" ON public.funcao_epis;
CREATE POLICY "funcao_epis delete by permission" ON public.funcao_epis FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'delete')
    AND EXISTS (SELECT 1 FROM public.funcoes f WHERE f.id = funcao_id AND public.pode_acessar_uf(f.uf)));

-- Copia as funções (com os EPIs padrão) de um estado para outro, como cópias
-- independentes. Pula as que já existem no destino (mesmo nome). Devolve
-- quantas copiou.
CREATE OR REPLACE FUNCTION public.copiar_funcoes_estado(_de text, _para text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.current_profile_id();
  r record;
  v_nova uuid;
  v_total integer := 0;
BEGIN
  IF v_user IS NULL OR NOT public.has_permission(v_user, 'funcoes', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar funções';
  END IF;
  IF _de = _para THEN RAISE EXCEPTION 'Escolha um estado de origem diferente'; END IF;
  IF NOT public.pode_acessar_uf(_de) OR NOT public.pode_acessar_uf(_para) THEN
    RAISE EXCEPTION 'Sem acesso a um dos estados';
  END IF;

  FOR r IN SELECT * FROM public.funcoes WHERE uf = _de ORDER BY nome LOOP
    INSERT INTO public.funcoes (nome, descricao, ativo, uf)
    VALUES (r.nome, r.descricao, r.ativo, _para)
    ON CONFLICT (uf, nome) DO NOTHING
    RETURNING id INTO v_nova;
    IF v_nova IS NOT NULL THEN
      INSERT INTO public.funcao_epis (funcao_id, epi_id, quantidade, tamanho)
      SELECT v_nova, fe.epi_id, fe.quantidade, fe.tamanho FROM public.funcao_epis fe WHERE fe.funcao_id = r.id;
      v_total := v_total + 1;
    END IF;
    v_nova := NULL;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copiar_funcoes_estado(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copiar_funcoes_estado(text, text) TO authenticated;
