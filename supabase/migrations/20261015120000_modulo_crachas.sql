-- Módulo Crachás (antes aplicação separada no Lovable "gerador de crachás").
-- Tabelas com prefixo cracha_ (a aplicação original tinha profiles/user_roles
-- próprios; aqui usa os usuários e a matriz de permissões do EPI: módulo
-- 'crachas'). Acesso por permissão, não por dono: a equipe compartilha
-- modelos, colaboradores e lotes. Re-executável.

DO $$ BEGIN
  CREATE TYPE public.cracha_batch_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.cracha_sheet_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT public.current_profile_id(),
  sheet_id text NOT NULL,
  sheet_name text NOT NULL,
  sheet_url text,
  tab_name text,
  range_spec text,
  last_synced_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.cracha_sheet_connections(id) ON DELETE CASCADE,
  sheet_column text NOT NULL,
  field_name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_badge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT public.current_profile_id(),
  name text NOT NULL,
  description text,
  width_mm numeric NOT NULL DEFAULT 85.6,
  height_mm numeric NOT NULL DEFAULT 53.98,
  background_color text DEFAULT '#FFFFFF',
  background_image_url text,
  has_back_side boolean NOT NULL DEFAULT false,
  back_background_image_url text,
  is_default boolean NOT NULL DEFAULT false,
  ai_layout_bg_url text,
  ai_layout_suggestion jsonb,
  ai_layout_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_template_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.cracha_badge_templates(id) ON DELETE CASCADE,
  side text NOT NULL DEFAULT 'front' CHECK (side IN ('front', 'back')),
  element_type text NOT NULL,
  field_binding text,
  static_value text,
  x_position numeric NOT NULL DEFAULT 0,
  y_position numeric NOT NULL DEFAULT 0,
  width numeric,
  height numeric,
  font_family text DEFAULT 'Inter',
  font_size numeric DEFAULT 12,
  font_weight text DEFAULT 'normal',
  font_color text DEFAULT '#000000',
  text_align text DEFAULT 'left',
  background_color text,
  border_color text,
  border_width numeric DEFAULT 0,
  border_radius numeric DEFAULT 0,
  name_display_mode text NOT NULL DEFAULT 'short',
  object_fit text DEFAULT 'cover',
  show_label boolean NOT NULL DEFAULT true,
  z_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.cracha_sheet_connections(id) ON DELETE SET NULL,
  employee_id text NOT NULL,
  full_name text NOT NULL,
  company text,
  role text,
  photo_url text,
  access_level text,
  qr_value text,
  valid_until date,
  notes text,
  document_id text,
  rg text,
  cpf text,
  cnv text,
  blood_type text,
  phone text,
  address text,
  is_valid boolean NOT NULL DEFAULT true,
  validation_errors jsonb,
  row_number integer,
  -- Solicitação de crachá (pela tela ou pelo formulário público)
  request_status text,
  request_reason text,
  requester_name text,
  requester_phone text,
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_cracha_employees_request_status
  ON public.cracha_employees (request_status) WHERE connection_id IS NULL;

CREATE TABLE IF NOT EXISTS public.cracha_generation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT public.current_profile_id(),
  template_id uuid REFERENCES public.cracha_badge_templates(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.cracha_sheet_connections(id) ON DELETE SET NULL,
  status public.cracha_batch_status NOT NULL DEFAULT 'pending',
  total_badges integer NOT NULL DEFAULT 0,
  processed_badges integer NOT NULL DEFAULT 0,
  failed_badges integer NOT NULL DEFAULT 0,
  export_format text NOT NULL DEFAULT 'pdf',
  layout_config jsonb,
  file_url text,
  error_log jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.cracha_generation_batches(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.cracha_employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  file_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT public.current_profile_id(),
  connection_id uuid REFERENCES public.cracha_sheet_connections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'success',
  total_records integer NOT NULL DEFAULT 0,
  new_records integer NOT NULL DEFAULT 0,
  updated_records integer NOT NULL DEFAULT 0,
  skipped_records integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cracha_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.cracha_sheet_connections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connection_id)
);

-- updated_at automático
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cracha_sheet_connections', 'cracha_badge_templates', 'cracha_employees'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- RLS: tudo pela permissão do módulo 'crachas' na matriz do EPI.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cracha_sheet_connections', 'cracha_column_mappings', 'cracha_badge_templates',
    'cracha_template_elements', 'cracha_employees', 'cracha_generation_batches', 'cracha_batch_items',
    'cracha_sync_logs', 'cracha_user_connections'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s ver" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s ver" ON public.%1$s FOR SELECT TO authenticated USING (public.has_permission(public.current_profile_id(), ''crachas'', ''view''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s criar" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s criar" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.has_permission(public.current_profile_id(), ''crachas'', ''create'') OR public.has_permission(public.current_profile_id(), ''crachas'', ''edit''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s editar" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s editar" ON public.%1$s FOR UPDATE TO authenticated USING (public.has_permission(public.current_profile_id(), ''crachas'', ''edit'')) WITH CHECK (public.has_permission(public.current_profile_id(), ''crachas'', ''edit''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s excluir" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s excluir" ON public.%1$s FOR DELETE TO authenticated USING (public.has_permission(public.current_profile_id(), ''crachas'', ''delete''))', t);
  END LOOP;
END $$;

-- Pastas de arquivos: fotos dos colaboradores e imagens dos modelos.
-- Leitura pública (a imagem entra no PDF do crachá); gravar só com o módulo.
INSERT INTO storage.buckets (id, name, public) VALUES ('cracha-fotos', 'cracha-fotos', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('cracha-assets', 'cracha-assets', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cracha arquivos ver" ON storage.objects;
CREATE POLICY "cracha arquivos ver" ON storage.objects FOR SELECT
  USING (bucket_id IN ('cracha-fotos', 'cracha-assets'));
DROP POLICY IF EXISTS "cracha arquivos enviar" ON storage.objects;
CREATE POLICY "cracha arquivos enviar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('cracha-fotos', 'cracha-assets')
    AND (public.has_permission(public.current_profile_id(), 'crachas', 'create')
         OR public.has_permission(public.current_profile_id(), 'crachas', 'edit')));
DROP POLICY IF EXISTS "cracha arquivos alterar" ON storage.objects;
CREATE POLICY "cracha arquivos alterar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('cracha-fotos', 'cracha-assets') AND public.has_permission(public.current_profile_id(), 'crachas', 'edit'));
DROP POLICY IF EXISTS "cracha arquivos apagar" ON storage.objects;
CREATE POLICY "cracha arquivos apagar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('cracha-fotos', 'cracha-assets') AND public.has_permission(public.current_profile_id(), 'crachas', 'delete'));

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- RH entra com acesso total ao módulo (igual ao preset em src/lib/permissions.ts);
-- admin já passa direto em has_permission. Os demais, pela matriz de permissões.
INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
SELECT ur.user_id, 'crachas', true, true, true, true
FROM public.user_roles ur
WHERE ur.role = 'rh'
ON CONFLICT (user_id, module) DO NOTHING;

-- Colaboradores dos crachás = espelho da lista da Senior (colaboradores_senior),
-- igual ao resto do sistema: a lista é atualizada pelo agendador da VM ou pelo
-- botão "Atualizar da Senior" e o gatilho abaixo leva as mudanças para os
-- crachás. Foto, validade e demais dados do crachá ficam no módulo.
-- senior_id nulo = cadastro manual ou solicitação.
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS senior_id uuid
  REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL;
ALTER TABLE public.cracha_employees ADD COLUMN IF NOT EXISTS desligado_em timestamptz;
DO $$ BEGIN
  ALTER TABLE public.cracha_employees ADD CONSTRAINT cracha_employees_senior_id_key UNIQUE (senior_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.cracha_espelhar_senior()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.nome, NEW.num_cad, NEW.cargo, NEW.empresa_nome, NEW.razao_social, NEW.cpf, NEW.telefone, NEW.ativo)
         IS NOT DISTINCT FROM
         (OLD.nome, OLD.num_cad, OLD.cargo, OLD.empresa_nome, OLD.razao_social, OLD.cpf, OLD.telefone, OLD.ativo) THEN
    RETURN NEW;
  END IF;

  IF NEW.ativo THEN
    INSERT INTO public.cracha_employees (senior_id, employee_id, full_name, role, company, cpf, phone)
    VALUES (NEW.id, NEW.num_cad::text, NEW.nome, NEW.cargo, COALESCE(NEW.empresa_nome, NEW.razao_social), NEW.cpf, NEW.telefone)
    ON CONFLICT (senior_id) DO UPDATE SET
      employee_id = EXCLUDED.employee_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role,
      company = EXCLUDED.company, cpf = EXCLUDED.cpf, phone = EXCLUDED.phone, desligado_em = NULL;
  ELSE
    -- Saiu da Senior: fica marcado (não apaga, para não perder o histórico de lotes).
    UPDATE public.cracha_employees SET desligado_em = COALESCE(desligado_em, now())
    WHERE senior_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cracha_espelhar_senior ON public.colaboradores_senior;
CREATE TRIGGER trg_cracha_espelhar_senior
  AFTER INSERT OR UPDATE ON public.colaboradores_senior
  FOR EACH ROW EXECUTE FUNCTION public.cracha_espelhar_senior();

-- Carga inicial: todos que já estão na lista.
INSERT INTO public.cracha_employees (senior_id, employee_id, full_name, role, company, cpf, phone)
SELECT c.id, c.num_cad::text, c.nome, c.cargo, COALESCE(c.empresa_nome, c.razao_social), c.cpf, c.telefone
FROM public.colaboradores_senior c
WHERE c.ativo
ON CONFLICT (senior_id) DO UPDATE SET
  employee_id = EXCLUDED.employee_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role,
  company = EXCLUDED.company, cpf = EXCLUDED.cpf, phone = EXCLUDED.phone, desligado_em = NULL;
UPDATE public.cracha_employees e SET desligado_em = COALESCE(e.desligado_em, now())
FROM public.colaboradores_senior c
WHERE e.senior_id = c.id AND NOT c.ativo;

-- Quem usa o módulo Crachás também lê a lista da Senior (só dos estados que acessa).
DROP POLICY IF EXISTS "colab_senior select" ON public.colaboradores_senior;
CREATE POLICY "colab_senior select" ON public.colaboradores_senior FOR SELECT TO authenticated
USING (
  (public.has_permission(public.current_profile_id(), 'colaboradores', 'view')
   OR public.has_permission(public.current_profile_id(), 'integracao', 'view')
   OR public.has_permission(public.current_profile_id(), 'crachas', 'view'))
  AND public.pode_acessar_uf(uf)
);

-- Colaborador da Senior só aparece nos crachás para quem acessa o estado dele
-- (a leitura de colaboradores_senior já aplica pode_acessar_uf).
DROP POLICY IF EXISTS "cracha_employees ver" ON public.cracha_employees;
CREATE POLICY "cracha_employees ver" ON public.cracha_employees FOR SELECT TO authenticated
USING (
  public.has_permission(public.current_profile_id(), 'crachas', 'view')
  AND (senior_id IS NULL OR EXISTS (SELECT 1 FROM public.colaboradores_senior c WHERE c.id = senior_id))
);
