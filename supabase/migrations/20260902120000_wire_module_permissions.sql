-- =========================================================
-- Liga de verdade a matriz de permissões por módulo
-- (public.user_permissions + a tela "Gestão de Usuários").
--
-- Até aqui, a função public.has_permission(_user_id, _module, _action)
-- (criada em 20260708203112_...sql) nunca era usada por nenhuma policy —
-- todo mundo era só admin/rh (acesso total) ou não-admin/rh (quase nada),
-- não importava o que a tela de permissões marcasse. Esta migration:
--
--   1) Faz o backfill de user_permissions para todo profile que ainda não
--      tem nenhuma linha (preserva o acesso atual antes de trocar as
--      policies abaixo — sem isso, um RH sem linhas custom perderia tudo,
--      já que has_permission() só libera automático para role='admin').
--   2) Troca is_admin_or_rh(...) por has_permission(..., '<módulo>',
--      '<ação>') nas tabelas de negócio mapeadas em src/lib/permissions.ts
--      (MODULES), separando por comando (SELECT->view, INSERT->create,
--      UPDATE->edit, DELETE->delete).
--
-- Fora deste escopo (continuam só admin/rh, hardcoded — ver decisão no
-- plano): profiles, user_roles, user_permissions, assinaturas,
-- notificacoes, assinatura_tokens. "Usuários" (gestão de contas/papéis)
-- não vira controlável pela matriz, pra não abrir brecha de
-- autopromoção.
-- =========================================================

-- =========================================================
-- 1) Backfill — espelha ROLE_PRESETS de src/lib/permissions.ts
--    (com o ajuste de rh.estoque: VIEW -> ALL, ver nota abaixo).
-- =========================================================
WITH profile_role AS (
  SELECT
    p.id AS user_id,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin') THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'rh') THEN 'rh'
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'supervisor') THEN 'supervisor'
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'almoxarife') THEN 'almoxarife'
      ELSE 'colaborador'
    END AS role
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = p.id)
),
role_preset(role, module, can_view, can_create, can_edit, can_delete) AS (
  VALUES
    -- admin: tudo, em todos os módulos
    ('admin','dashboard',true,true,true,true),
    ('admin','assinar_tablet',true,true,true,true),
    ('admin','fichas_epi',true,true,true,true),
    ('admin','fichas_uniforme',true,true,true,true),
    ('admin','termos_coletivos',true,true,true,true),
    ('admin','estoque',true,true,true,true),
    ('admin','vencimentos',true,true,true,true),
    ('admin','rank',true,true,true,true),
    ('admin','integracao',true,true,true,true),
    ('admin','funcoes',true,true,true,true),
    ('admin','usuarios',true,true,true,true),
    ('admin','configuracoes',true,true,true,true),
    -- rh
    ('rh','dashboard',true,false,false,false),
    ('rh','assinar_tablet',true,false,false,false),
    ('rh','fichas_epi',true,true,true,true),
    ('rh','fichas_uniforme',true,true,true,true),
    ('rh','termos_coletivos',true,true,true,true),
    ('rh','estoque',true,true,true,true),
    ('rh','vencimentos',true,false,false,false),
    ('rh','rank',true,false,false,false),
    ('rh','integracao',true,true,true,true),
    ('rh','funcoes',true,true,true,false),
    ('rh','usuarios',true,true,true,true),
    ('rh','configuracoes',true,false,true,false),
    -- supervisor
    ('supervisor','dashboard',true,false,false,false),
    ('supervisor','assinar_tablet',true,false,false,false),
    ('supervisor','fichas_epi',true,false,false,false),
    ('supervisor','fichas_uniforme',true,false,false,false),
    ('supervisor','termos_coletivos',true,false,false,false),
    ('supervisor','estoque',false,false,false,false),
    ('supervisor','vencimentos',true,false,false,false),
    ('supervisor','rank',true,false,false,false),
    ('supervisor','integracao',false,false,false,false),
    ('supervisor','funcoes',false,false,false,false),
    ('supervisor','usuarios',false,false,false,false),
    ('supervisor','configuracoes',false,false,false,false),
    -- almoxarife
    ('almoxarife','dashboard',true,false,false,false),
    ('almoxarife','assinar_tablet',true,false,false,false),
    ('almoxarife','fichas_epi',true,true,true,false),
    ('almoxarife','fichas_uniforme',true,true,true,false),
    ('almoxarife','termos_coletivos',true,true,true,false),
    ('almoxarife','estoque',true,true,true,true),
    ('almoxarife','vencimentos',true,false,false,false),
    ('almoxarife','rank',false,false,false,false),
    ('almoxarife','integracao',false,false,false,false),
    ('almoxarife','funcoes',false,false,false,false),
    ('almoxarife','usuarios',false,false,false,false),
    ('almoxarife','configuracoes',false,false,false,false),
    -- colaborador
    ('colaborador','dashboard',false,false,false,false),
    ('colaborador','assinar_tablet',true,false,false,false),
    ('colaborador','fichas_epi',false,false,false,false),
    ('colaborador','fichas_uniforme',false,false,false,false),
    ('colaborador','termos_coletivos',false,false,false,false),
    ('colaborador','estoque',false,false,false,false),
    ('colaborador','vencimentos',false,false,false,false),
    ('colaborador','rank',false,false,false,false),
    ('colaborador','integracao',false,false,false,false),
    ('colaborador','funcoes',false,false,false,false),
    ('colaborador','usuarios',false,false,false,false),
    ('colaborador','configuracoes',false,false,false,false)
)
INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
SELECT pr.user_id, rp.module, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete
FROM profile_role pr
JOIN role_preset rp ON rp.role = pr.role
ON CONFLICT (user_id, module) DO NOTHING;

-- =========================================================
-- 2) ESTOQUE — epis, uniformes, epi_tamanhos, movimentacoes_estoque
--    (SELECT já é aberto a todo authenticated nas 3 primeiras — só
--    troca INSERT/UPDATE/DELETE; movimentacoes_estoque não tinha select
--    aberto, então troca os 4 comandos)
-- =========================================================
DROP POLICY IF EXISTS "epis modify admin/rh" ON public.epis;
CREATE POLICY "epis insert by permission" ON public.epis FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create'));
CREATE POLICY "epis update by permission" ON public.epis FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit'));
CREATE POLICY "epis delete by permission" ON public.epis FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete'));

DROP POLICY IF EXISTS "uniformes modify admin/rh" ON public.uniformes;
CREATE POLICY "uniformes insert by permission" ON public.uniformes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create'));
CREATE POLICY "uniformes update by permission" ON public.uniformes FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit'));
CREATE POLICY "uniformes delete by permission" ON public.uniformes FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete'));

DROP POLICY IF EXISTS "epi_tam modify admin/rh" ON public.epi_tamanhos;
CREATE POLICY "epi_tam insert by permission" ON public.epi_tamanhos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create'));
CREATE POLICY "epi_tam update by permission" ON public.epi_tamanhos FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit'));
CREATE POLICY "epi_tam delete by permission" ON public.epi_tamanhos FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete'));

DROP POLICY IF EXISTS "mov select admin/rh" ON public.movimentacoes_estoque;
CREATE POLICY "mov select by permission" ON public.movimentacoes_estoque FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view'));

DROP POLICY IF EXISTS "mov modify admin/rh" ON public.movimentacoes_estoque;
CREATE POLICY "mov insert by permission" ON public.movimentacoes_estoque FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'create'));
CREATE POLICY "mov update by permission" ON public.movimentacoes_estoque FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit'));
CREATE POLICY "mov delete by permission" ON public.movimentacoes_estoque FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'delete'));

-- =========================================================
-- 3) FICHAS EPI — mantém as cláusulas de dono/supervisor que já
--    existiam, só troca a parte is_admin_or_rh/has_role por
--    has_permission('fichas_epi', ...)
-- =========================================================
DROP POLICY IF EXISTS "fichas_epi select" ON public.fichas_epi;
CREATE POLICY "fichas_epi select"
ON public.fichas_epi FOR SELECT TO authenticated
USING (
  colaborador_id = public.current_profile_id()
  OR public.has_permission(public.current_profile_id(), 'fichas_epi', 'view')
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi insert admin/rh" ON public.fichas_epi;
CREATE POLICY "fichas_epi insert by permission"
ON public.fichas_epi FOR INSERT TO authenticated
WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'create'));

DROP POLICY IF EXISTS "fichas_epi update admin/rh/supervisor" ON public.fichas_epi;
CREATE POLICY "fichas_epi update by permission or supervisor"
ON public.fichas_epi FOR UPDATE TO authenticated
USING (
  public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit')
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi delete admin" ON public.fichas_epi;
CREATE POLICY "fichas_epi delete by permission"
ON public.fichas_epi FOR DELETE TO authenticated
USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'delete'));

DROP POLICY IF EXISTS "fei select" ON public.fichas_epi_itens;
CREATE POLICY "fei select"
ON public.fichas_epi_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND (
    f.colaborador_id = public.current_profile_id()
    OR public.has_permission(public.current_profile_id(), 'fichas_epi', 'view')
    OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id)
  )
));

DROP POLICY IF EXISTS "fei modify admin/rh" ON public.fichas_epi_itens;
CREATE POLICY "fei insert by permission" ON public.fichas_epi_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'create'));
CREATE POLICY "fei update by permission" ON public.fichas_epi_itens FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_epi', 'edit'));
CREATE POLICY "fei delete by permission" ON public.fichas_epi_itens FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'delete'));

-- =========================================================
-- 4) FICHAS UNIFORME (mirror de fichas_epi, módulo 'fichas_uniforme')
-- =========================================================
DROP POLICY IF EXISTS "fichas_uni select" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni select"
ON public.fichas_uniforme FOR SELECT TO authenticated
USING (
  colaborador_id = public.current_profile_id()
  OR public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'view')
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_uni insert admin/rh" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni insert by permission"
ON public.fichas_uniforme FOR INSERT TO authenticated
WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'create'));

DROP POLICY IF EXISTS "fichas_uni update admin/rh/supervisor" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni update by permission or supervisor"
ON public.fichas_uniforme FOR UPDATE TO authenticated
USING (
  public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'edit')
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_uni delete admin" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni delete by permission"
ON public.fichas_uniforme FOR DELETE TO authenticated
USING (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'delete'));

DROP POLICY IF EXISTS "fui select" ON public.fichas_uniforme_itens;
CREATE POLICY "fui select"
ON public.fichas_uniforme_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id AND (
    f.colaborador_id = public.current_profile_id()
    OR public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'view')
    OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id)
  )
));

DROP POLICY IF EXISTS "fui modify admin/rh" ON public.fichas_uniforme_itens;
CREATE POLICY "fui insert by permission" ON public.fichas_uniforme_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'create'));
CREATE POLICY "fui update by permission" ON public.fichas_uniforme_itens FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'edit'));
CREATE POLICY "fui delete by permission" ON public.fichas_uniforme_itens FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'delete'));

-- =========================================================
-- 5) FUNÇÕES — funcoes, funcao_epis (SELECT já aberto, só troca modify)
-- =========================================================
DROP POLICY IF EXISTS "funcoes modify admin/rh" ON public.funcoes;
CREATE POLICY "funcoes insert by permission" ON public.funcoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'create'));
CREATE POLICY "funcoes update by permission" ON public.funcoes FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'edit'));
CREATE POLICY "funcoes delete by permission" ON public.funcoes FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'delete'));

DROP POLICY IF EXISTS "funcao_epis modify admin/rh" ON public.funcao_epis;
CREATE POLICY "funcao_epis insert by permission" ON public.funcao_epis FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'create'));
CREATE POLICY "funcao_epis update by permission" ON public.funcao_epis FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'funcoes', 'edit'));
CREATE POLICY "funcao_epis delete by permission" ON public.funcao_epis FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'funcoes', 'delete'));

-- =========================================================
-- 6) INTEGRAÇÃO — colaboradores_integracao (SELECT já aberto)
-- =========================================================
DROP POLICY IF EXISTS "ci modify admin/rh" ON public.colaboradores_integracao;
CREATE POLICY "ci insert by permission" ON public.colaboradores_integracao FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'integracao', 'create'));
CREATE POLICY "ci update by permission" ON public.colaboradores_integracao FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'integracao', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'integracao', 'edit'));
CREATE POLICY "ci delete by permission" ON public.colaboradores_integracao FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'integracao', 'delete'));

-- =========================================================
-- 7) TERMOS COLETIVOS — termos_epi_coletivos(_itens) já têm SELECT
--    aberto a todo authenticated ("leitura por autenticados" /
--    "leitura itens autenticados", não tocadas); termo_coletivo_tokens
--    não tem select aberto (só usado autenticado; o fluxo público usa
--    função SECURITY DEFINER, não RLS direta)
-- =========================================================
DROP POLICY IF EXISTS "admins/rh gerenciam termos coletivos" ON public.termos_epi_coletivos;
CREATE POLICY "termos insert by permission" ON public.termos_epi_coletivos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'create'));
CREATE POLICY "termos update by permission" ON public.termos_epi_coletivos FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'));
CREATE POLICY "termos delete by permission" ON public.termos_epi_coletivos FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'delete'));

DROP POLICY IF EXISTS "admins/rh gerenciam itens coletivos" ON public.termos_epi_coletivos_itens;
CREATE POLICY "termos itens insert by permission" ON public.termos_epi_coletivos_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'create'));
CREATE POLICY "termos itens update by permission" ON public.termos_epi_coletivos_itens FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'));
CREATE POLICY "termos itens delete by permission" ON public.termos_epi_coletivos_itens FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'delete'));

DROP POLICY IF EXISTS "termo tokens admin/rh manage" ON public.termo_coletivo_tokens;
CREATE POLICY "termo tokens select by permission" ON public.termo_coletivo_tokens FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'view'));
CREATE POLICY "termo tokens insert by permission" ON public.termo_coletivo_tokens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'create'));
CREATE POLICY "termo tokens update by permission" ON public.termo_coletivo_tokens FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'edit'));
CREATE POLICY "termo tokens delete by permission" ON public.termo_coletivo_tokens FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'termos_coletivos', 'delete'));

-- =========================================================
-- 8) CONFIGURAÇÕES — app_config (SELECT já aberto a anon+authenticated,
--    não tocado; só troca quem pode gravar)
-- =========================================================
DROP POLICY IF EXISTS "Admin RH can manage app config" ON public.app_config;
CREATE POLICY "app_config insert by permission" ON public.app_config FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'create'));
CREATE POLICY "app_config update by permission" ON public.app_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'));
CREATE POLICY "app_config delete by permission" ON public.app_config FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'delete'));
