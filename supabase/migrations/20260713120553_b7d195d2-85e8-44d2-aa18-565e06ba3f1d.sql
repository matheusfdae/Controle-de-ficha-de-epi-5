DROP POLICY IF EXISTS "user_roles all admin" ON public.user_roles;
CREATE POLICY "user_roles manage admin or rh"
  ON public.user_roles FOR ALL
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

DROP POLICY IF EXISTS "user_roles select self or admin" ON public.user_roles;
CREATE POLICY "user_roles select self or manager"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_rh(auth.uid()));

-- Também alinhar user_permissions para admin/rh
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid = 'public.user_permissions'::regclass LOOP
    EXECUTE format('DROP POLICY %I ON public.user_permissions', p.polname);
  END LOOP;
END $$;

CREATE POLICY "user_permissions select self or manager"
  ON public.user_permissions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin_or_rh(auth.uid()));

CREATE POLICY "user_permissions manage admin or rh"
  ON public.user_permissions FOR ALL
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));