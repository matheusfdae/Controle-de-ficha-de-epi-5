-- Controle de gasto mensal por posto: o modelo da planilha "Controle de gasto mensal
-- DF e GO - Por posto" (uma aba por posto: itens x meses, datas de faturamento, valor
-- previsto, realizado com as notas, variação/saldo, equipamentos e observações).
-- Uma linha por posto e ano; o conteúdo da aba fica em `dados` (jsonb) para a tela
-- mostrar igual à planilha. Importado pela própria tela (Excel) e editável nela.
-- Acesso: módulo "Pedidos de Material" (ver / editar) e o estado do posto.
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.gasto_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
  aba text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  posto_id uuid REFERENCES public.postos(id) ON DELETE SET NULL,
  posto_nome text NOT NULL,
  uf text NOT NULL,
  custo_texto text,
  custo_valor numeric(14, 2),
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT public.current_profile_id(),
  UNIQUE (ano, aba)
);
CREATE INDEX IF NOT EXISTS idx_gasto_mensal_ano ON public.gasto_mensal (ano, ordem);

ALTER TABLE public.gasto_mensal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gasto_mensal ver" ON public.gasto_mensal;
CREATE POLICY "gasto_mensal ver" ON public.gasto_mensal FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "gasto_mensal incluir" ON public.gasto_mensal;
CREATE POLICY "gasto_mensal incluir" ON public.gasto_mensal FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "gasto_mensal alterar" ON public.gasto_mensal;
CREATE POLICY "gasto_mensal alterar" ON public.gasto_mensal FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "gasto_mensal excluir" ON public.gasto_mensal;
CREATE POLICY "gasto_mensal excluir" ON public.gasto_mensal FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf));

-- Quem alterou e quando (a tela mostra "atualizado em ... por ...").
CREATE OR REPLACE FUNCTION public.gasto_mensal_carimbo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  NEW.atualizado_por := coalesce(public.current_profile_id(), NEW.atualizado_por);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gasto_mensal_carimbo ON public.gasto_mensal;
CREATE TRIGGER trg_gasto_mensal_carimbo BEFORE INSERT OR UPDATE ON public.gasto_mensal
  FOR EACH ROW EXECUTE FUNCTION public.gasto_mensal_carimbo();

NOTIFY pgrst, 'reload schema';
