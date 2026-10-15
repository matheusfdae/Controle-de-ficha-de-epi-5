-- Integração (admissões) usando a lista da Senior. Re-executável.

-- Quem usa a tela Integração também lê a lista de colaboradores da Senior
-- (só dos estados que acessa), mesmo sem o módulo Colaboradores Senior.
DROP POLICY IF EXISTS "colab_senior select" ON public.colaboradores_senior;
CREATE POLICY "colab_senior select" ON public.colaboradores_senior FOR SELECT TO authenticated
USING (
  (public.has_permission(public.current_profile_id(), 'colaboradores', 'view')
   OR public.has_permission(public.current_profile_id(), 'integracao', 'view'))
  AND public.pode_acessar_uf(uf)
);

-- Cadastro manual (quem ainda não está na Senior): dados para gerar a ficha.
ALTER TABLE public.colaboradores_integracao ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.colaboradores_integracao ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.colaboradores_integracao ADD COLUMN IF NOT EXISTS uf text;
