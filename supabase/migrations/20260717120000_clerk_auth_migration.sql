-- =========================================================
-- MIGRAÇÃO DE AUTH: Supabase Auth -> Clerk (Third-Party Auth)
--
-- O Clerk passa a emitir o JWT; o Supabase valida via
-- Third-Party Auth (config em supabase/config.toml ou .env do
-- self-hosted). auth.uid() deixa de funcionar porque o `sub`
-- do JWT do Clerk é uma string ("user_xxx"), não um UUID.
--
-- Estratégia: profiles.id continua sendo o UUID interno (fonte
-- da verdade da aplicação). Uma coluna nova profiles.clerk_user_id
-- guarda o id do Clerk. public.current_profile_id() resolve o
-- UUID interno a partir do `sub` do JWT e substitui auth.uid()
-- em todas as policies/triggers. Nenhum tipo de coluna muda.
-- =========================================================

-- =========================================================
-- 1) Identidade Clerk em profiles
-- =========================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE clerk_user_id = (auth.jwt()->>'sub') LIMIT 1;
$$;

-- =========================================================
-- 2) Retargetar FKs de auth.users(id) para public.profiles(id)
--    (uuid -> uuid, sem troca de tipo)
-- =========================================================
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_usuario_id_fkey;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.termos_epi_coletivos DROP CONSTRAINT IF EXISTS termos_epi_coletivos_criado_por_fkey;
ALTER TABLE public.termos_epi_coletivos ADD CONSTRAINT termos_epi_coletivos_criado_por_fkey
  FOREIGN KEY (criado_por) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- termoColetivoService.createTermoColetivo() preenchia criado_por lendo
-- supabase.auth.getUser() no client — não existe mais sessão Supabase, então
-- passa a vir como DEFAULT no banco (mesmo current_profile_id() usado nas
-- policies).
ALTER TABLE public.termos_epi_coletivos ALTER COLUMN criado_por SET DEFAULT public.current_profile_id();

ALTER TABLE public.user_permissions DROP CONSTRAINT IF EXISTS user_permissions_user_id_fkey;
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- =========================================================
-- 3) Provisionamento passa a vir do webhook do Clerk
--    (supabase/functions/clerk-webhook), não de um INSERT em
--    auth.users.
-- =========================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =========================================================
-- 4) Policies — trocar auth.uid() por current_profile_id()
--    (DROP + CREATE, mesmo FOR/TO/USING/WITH CHECK de antes)
-- =========================================================

-- PROFILES
DROP POLICY IF EXISTS "profiles select own or admin/rh/supervisor" ON public.profiles;
CREATE POLICY "profiles select own or admin/rh/supervisor"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = public.current_profile_id()
  OR public.is_admin_or_rh(public.current_profile_id())
  OR supervisor_id = public.current_profile_id()
);

DROP POLICY IF EXISTS "profiles update own basic or admin/rh" ON public.profiles;
CREATE POLICY "profiles update own basic or admin/rh"
ON public.profiles FOR UPDATE TO authenticated
USING (id = public.current_profile_id() OR public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "profiles insert admin/rh" ON public.profiles;
CREATE POLICY "profiles insert admin/rh"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "profiles delete admin" ON public.profiles;
CREATE POLICY "profiles delete admin"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(public.current_profile_id(), 'admin'));

-- USER_ROLES (estado final após 20260713120553 + 20260714170203)
DROP POLICY IF EXISTS "user_roles select self or manager" ON public.user_roles;
CREATE POLICY "user_roles select self or manager"
ON public.user_roles FOR SELECT
USING (user_id = public.current_profile_id() OR public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "user_roles manage admin or rh (sem escalar admin)" ON public.user_roles;
CREATE POLICY "user_roles manage admin or rh (sem escalar admin)"
ON public.user_roles FOR ALL TO authenticated
USING (
  public.has_role(public.current_profile_id(), 'admin')
  OR (public.has_role(public.current_profile_id(), 'rh') AND role <> 'admin')
)
WITH CHECK (
  public.has_role(public.current_profile_id(), 'admin')
  OR (public.has_role(public.current_profile_id(), 'rh') AND role <> 'admin')
);

-- EPIs
DROP POLICY IF EXISTS "epis modify admin/rh" ON public.epis;
CREATE POLICY "epis modify admin/rh"
ON public.epis FOR ALL TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()))
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- UNIFORMES
DROP POLICY IF EXISTS "uniformes modify admin/rh" ON public.uniformes;
CREATE POLICY "uniformes modify admin/rh"
ON public.uniformes FOR ALL TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()))
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- FICHAS EPI
DROP POLICY IF EXISTS "fichas_epi select" ON public.fichas_epi;
CREATE POLICY "fichas_epi select"
ON public.fichas_epi FOR SELECT TO authenticated
USING (
  colaborador_id = public.current_profile_id()
  OR public.is_admin_or_rh(public.current_profile_id())
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi insert admin/rh" ON public.fichas_epi;
CREATE POLICY "fichas_epi insert admin/rh"
ON public.fichas_epi FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "fichas_epi update admin/rh/supervisor" ON public.fichas_epi;
CREATE POLICY "fichas_epi update admin/rh/supervisor"
ON public.fichas_epi FOR UPDATE TO authenticated
USING (
  public.is_admin_or_rh(public.current_profile_id())
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_epi delete admin" ON public.fichas_epi;
CREATE POLICY "fichas_epi delete admin"
ON public.fichas_epi FOR DELETE TO authenticated
USING (public.has_role(public.current_profile_id(), 'admin'));

-- FICHAS EPI ITENS
DROP POLICY IF EXISTS "fei select" ON public.fichas_epi_itens;
CREATE POLICY "fei select"
ON public.fichas_epi_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND (
    f.colaborador_id = public.current_profile_id()
    OR public.is_admin_or_rh(public.current_profile_id())
    OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id)
  )
));

DROP POLICY IF EXISTS "fei modify admin/rh" ON public.fichas_epi_itens;
CREATE POLICY "fei modify admin/rh"
ON public.fichas_epi_itens FOR ALL TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()))
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- FICHAS UNIFORME (mirror)
DROP POLICY IF EXISTS "fichas_uni select" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni select"
ON public.fichas_uniforme FOR SELECT TO authenticated
USING (
  colaborador_id = public.current_profile_id()
  OR public.is_admin_or_rh(public.current_profile_id())
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_uni insert admin/rh" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni insert admin/rh"
ON public.fichas_uniforme FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "fichas_uni update admin/rh/supervisor" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni update admin/rh/supervisor"
ON public.fichas_uniforme FOR UPDATE TO authenticated
USING (
  public.is_admin_or_rh(public.current_profile_id())
  OR public.is_supervisor_of(public.current_profile_id(), colaborador_id)
);

DROP POLICY IF EXISTS "fichas_uni delete admin" ON public.fichas_uniforme;
CREATE POLICY "fichas_uni delete admin"
ON public.fichas_uniforme FOR DELETE TO authenticated
USING (public.has_role(public.current_profile_id(), 'admin'));

DROP POLICY IF EXISTS "fui select" ON public.fichas_uniforme_itens;
CREATE POLICY "fui select"
ON public.fichas_uniforme_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id AND (
    f.colaborador_id = public.current_profile_id()
    OR public.is_admin_or_rh(public.current_profile_id())
    OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id)
  )
));

DROP POLICY IF EXISTS "fui modify admin/rh" ON public.fichas_uniforme_itens;
CREATE POLICY "fui modify admin/rh"
ON public.fichas_uniforme_itens FOR ALL TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()))
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- MOVIMENTAÇÕES
DROP POLICY IF EXISTS "mov select admin/rh" ON public.movimentacoes_estoque;
CREATE POLICY "mov select admin/rh"
ON public.movimentacoes_estoque FOR SELECT TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "mov modify admin/rh" ON public.movimentacoes_estoque;
CREATE POLICY "mov modify admin/rh"
ON public.movimentacoes_estoque FOR ALL TO authenticated
USING (public.is_admin_or_rh(public.current_profile_id()))
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- NOTIFICAÇÕES
DROP POLICY IF EXISTS "notif select own" ON public.notificacoes;
CREATE POLICY "notif select own"
ON public.notificacoes FOR SELECT TO authenticated
USING (usuario_id = public.current_profile_id());

DROP POLICY IF EXISTS "notif update own" ON public.notificacoes;
CREATE POLICY "notif update own"
ON public.notificacoes FOR UPDATE TO authenticated
USING (usuario_id = public.current_profile_id());

DROP POLICY IF EXISTS "notif insert admin/rh" ON public.notificacoes;
CREATE POLICY "notif insert admin/rh"
ON public.notificacoes FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(public.current_profile_id()) OR usuario_id = public.current_profile_id());

-- ASSINATURA TOKENS (estado final após 20260714170203)
DROP POLICY IF EXISTS "tokens select admin/rh/supervisor/dono" ON public.assinatura_tokens;
CREATE POLICY "tokens select admin/rh/supervisor/dono"
ON public.assinatura_tokens FOR SELECT TO authenticated
USING (
  public.is_admin_or_rh(public.current_profile_id())
  OR (tipo_ficha = 'epi' AND EXISTS (
        SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id
          AND (f.colaborador_id = public.current_profile_id() OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id))
      ))
  OR (tipo_ficha = 'uniforme' AND EXISTS (
        SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id
          AND (f.colaborador_id = public.current_profile_id() OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id))
      ))
);

DROP POLICY IF EXISTS "tokens insert admin/rh/supervisor/dono" ON public.assinatura_tokens;
CREATE POLICY "tokens insert admin/rh/supervisor/dono"
ON public.assinatura_tokens FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_rh(public.current_profile_id())
  OR (tipo_ficha = 'epi' AND EXISTS (
        SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id
          AND (f.colaborador_id = public.current_profile_id() OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id))
      ))
  OR (tipo_ficha = 'uniforme' AND EXISTS (
        SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id
          AND (f.colaborador_id = public.current_profile_id() OR public.is_supervisor_of(public.current_profile_id(), f.colaborador_id))
      ))
);

-- FUNÇÕES / TAMANHOS / FUNÇÃO-EPIS
DROP POLICY IF EXISTS "funcoes modify admin/rh" ON public.funcoes;
CREATE POLICY "funcoes modify admin/rh" ON public.funcoes FOR ALL TO authenticated
  USING (is_admin_or_rh(public.current_profile_id())) WITH CHECK (is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "epi_tam modify admin/rh" ON public.epi_tamanhos;
CREATE POLICY "epi_tam modify admin/rh" ON public.epi_tamanhos FOR ALL TO authenticated
  USING (is_admin_or_rh(public.current_profile_id())) WITH CHECK (is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "funcao_epis modify admin/rh" ON public.funcao_epis;
CREATE POLICY "funcao_epis modify admin/rh" ON public.funcao_epis FOR ALL TO authenticated
  USING (is_admin_or_rh(public.current_profile_id())) WITH CHECK (is_admin_or_rh(public.current_profile_id()));

-- COLABORADORES INTEGRAÇÃO
DROP POLICY IF EXISTS "ci modify admin/rh" ON public.colaboradores_integracao;
CREATE POLICY "ci modify admin/rh" ON public.colaboradores_integracao FOR ALL TO authenticated
  USING (is_admin_or_rh(public.current_profile_id())) WITH CHECK (is_admin_or_rh(public.current_profile_id()));

-- TERMOS EPI COLETIVOS
DROP POLICY IF EXISTS "admins/rh gerenciam termos coletivos" ON public.termos_epi_coletivos;
CREATE POLICY "admins/rh gerenciam termos coletivos"
  ON public.termos_epi_coletivos FOR ALL TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "admins/rh gerenciam itens coletivos" ON public.termos_epi_coletivos_itens;
CREATE POLICY "admins/rh gerenciam itens coletivos"
  ON public.termos_epi_coletivos_itens FOR ALL TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- TERMO COLETIVO TOKENS
DROP POLICY IF EXISTS "termo tokens admin/rh manage" ON public.termo_coletivo_tokens;
CREATE POLICY "termo tokens admin/rh manage"
  ON public.termo_coletivo_tokens FOR ALL TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- ASSINATURAS
DROP POLICY IF EXISTS "Admin/RH can manage assinaturas" ON public.assinaturas;
CREATE POLICY "Admin/RH can manage assinaturas"
  ON public.assinaturas FOR ALL TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- APP CONFIG
DROP POLICY IF EXISTS "Admin RH can manage app config" ON public.app_config;
CREATE POLICY "Admin RH can manage app config"
  ON public.app_config FOR ALL TO authenticated
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

CREATE OR REPLACE FUNCTION public.touch_app_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = public.current_profile_id();
  RETURN NEW;
END;
$$;

-- USER_PERMISSIONS (estado final após 20260713120553)
DROP POLICY IF EXISTS "user_permissions select self or manager" ON public.user_permissions;
CREATE POLICY "user_permissions select self or manager"
  ON public.user_permissions FOR SELECT
  USING (user_id = public.current_profile_id() OR public.is_admin_or_rh(public.current_profile_id()));

DROP POLICY IF EXISTS "user_permissions manage admin or rh" ON public.user_permissions;
CREATE POLICY "user_permissions manage admin or rh"
  ON public.user_permissions FOR ALL
  USING (public.is_admin_or_rh(public.current_profile_id()))
  WITH CHECK (public.is_admin_or_rh(public.current_profile_id()));

-- =========================================================
-- 5) Trigger de profiles que chama auth.uid() diretamente
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_rh(public.current_profile_id()) THEN
    RETURN NEW;
  END IF;

  NEW.cpf := OLD.cpf;
  NEW.matricula := OLD.matricula;
  NEW.cargo := OLD.cargo;
  NEW.posto := OLD.posto;
  NEW.departamento := OLD.departamento;
  NEW.data_admissao := OLD.data_admissao;
  NEW.supervisor_id := OLD.supervisor_id;
  NEW.ativo := OLD.ativo;
  NEW.inativado_em := OLD.inativado_em;
  NEW.motivo_inativacao := OLD.motivo_inativacao;

  RETURN NEW;
END;
$$;
