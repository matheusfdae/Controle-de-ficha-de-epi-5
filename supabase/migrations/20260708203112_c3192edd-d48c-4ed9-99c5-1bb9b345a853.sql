-- 1) Novo papel Almoxarife
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'almoxarife';

-- 2) Tabela de permissões por usuário e módulo
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or admin/rh"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_rh(auth.uid()));

CREATE POLICY "admin/rh manage permissions"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (public.is_admin_or_rh(auth.uid()))
  WITH CHECK (public.is_admin_or_rh(auth.uid()));

CREATE TRIGGER trg_user_permissions_updated
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Função de consulta de permissão (SECURITY DEFINER evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  -- Admin sempre pode
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN true;
  END IF;

  SELECT CASE _action
           WHEN 'view'   THEN can_view
           WHEN 'create' THEN can_create
           WHEN 'edit'   THEN can_edit
           WHEN 'delete' THEN can_delete
           ELSE false
         END
    INTO ok
  FROM public.user_permissions
  WHERE user_id = _user_id AND module = _module;

  RETURN COALESCE(ok, false);
END;
$$;