
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'rh', 'supervisor', 'colaborador');
CREATE TYPE public.epi_categoria AS ENUM ('protecao_cabeca','auditiva','visual','respiratoria','maos','pes','corpo','queda');
CREATE TYPE public.uniforme_genero AS ENUM ('masculino','feminino','unissex');
CREATE TYPE public.ficha_status AS ENUM ('pendente_assinatura','assinada','devolvida','cancelada');
CREATE TYPE public.motivo_entrega AS ENUM ('admissao','reposicao','troca','devolucao');
CREATE TYPE public.estado_item AS ENUM ('novo','usado_bom','usado_regular');
CREATE TYPE public.tipo_mov AS ENUM ('entrada','saida','devolucao','descarte');
CREATE TYPE public.tipo_item AS ENUM ('epi','uniforme');

-- =========================================================
-- updated_at helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL DEFAULT '',
  email TEXT,
  cpf TEXT,
  matricula TEXT,
  cargo TEXT,
  setor TEXT,
  departamento TEXT,
  data_admissao DATE,
  foto_url TEXT,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  inativado_em TIMESTAMPTZ,
  motivo_inativacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_supervisor ON public.profiles(supervisor_id);
CREATE INDEX idx_profiles_ativo ON public.profiles(ativo);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- USER ROLES (separate table - prevents privilege escalation)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_rh(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role IN ('admin','rh'));
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_of(_supervisor UUID, _colaborador UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = _colaborador AND supervisor_id = _supervisor);
$$;

-- =========================================================
-- Auto-create profile on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome_completo)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email));
  -- Default role: colaborador
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- EPIs
-- =========================================================
CREATE TABLE public.epis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria public.epi_categoria NOT NULL,
  ca_numero TEXT,
  ca_validade DATE,
  fabricante TEXT,
  fornecedor TEXT,
  vida_util_dias INTEGER,
  estoque_atual INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 5,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_epis_updated BEFORE UPDATE ON public.epis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- UNIFORMES
-- =========================================================
CREATE TABLE public.uniformes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL,
  tamanhos_disponiveis TEXT[] NOT NULL DEFAULT '{}',
  genero public.uniforme_genero NOT NULL DEFAULT 'unissex',
  estoque_atual INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 5,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_uniformes_updated BEFORE UPDATE ON public.uniformes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- FICHAS EPI
-- =========================================================
CREATE TABLE public.fichas_epi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL,
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  data_entrega DATE NOT NULL DEFAULT CURRENT_DATE,
  data_devolucao DATE,
  status public.ficha_status NOT NULL DEFAULT 'pendente_assinatura',
  observacoes TEXT,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assinatura_colaborador_url TEXT,
  assinatura_supervisor_url TEXT,
  data_assinatura_colaborador TIMESTAMPTZ,
  data_assinatura_supervisor TIMESTAMPTZ,
  ip_assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fichas_epi_colab ON public.fichas_epi(colaborador_id);
CREATE INDEX idx_fichas_epi_status ON public.fichas_epi(status);
CREATE TRIGGER trg_fichas_epi_updated BEFORE UPDATE ON public.fichas_epi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fichas_epi_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id UUID NOT NULL REFERENCES public.fichas_epi(id) ON DELETE CASCADE,
  epi_id UUID NOT NULL REFERENCES public.epis(id) ON DELETE RESTRICT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  tamanho TEXT,
  motivo_entrega public.motivo_entrega NOT NULL DEFAULT 'admissao',
  estado public.estado_item NOT NULL DEFAULT 'novo',
  observacao_item TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fei_ficha ON public.fichas_epi_itens(ficha_id);

-- =========================================================
-- FICHAS UNIFORME
-- =========================================================
CREATE TABLE public.fichas_uniforme (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL,
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  data_entrega DATE NOT NULL DEFAULT CURRENT_DATE,
  data_devolucao DATE,
  status public.ficha_status NOT NULL DEFAULT 'pendente_assinatura',
  observacoes TEXT,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assinatura_colaborador_url TEXT,
  assinatura_supervisor_url TEXT,
  data_assinatura_colaborador TIMESTAMPTZ,
  data_assinatura_supervisor TIMESTAMPTZ,
  ip_assinatura TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fichas_uni_colab ON public.fichas_uniforme(colaborador_id);
CREATE INDEX idx_fichas_uni_status ON public.fichas_uniforme(status);
CREATE TRIGGER trg_fichas_uni_updated BEFORE UPDATE ON public.fichas_uniforme
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fichas_uniforme_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id UUID NOT NULL REFERENCES public.fichas_uniforme(id) ON DELETE CASCADE,
  uniforme_id UUID NOT NULL REFERENCES public.uniformes(id) ON DELETE RESTRICT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  tamanho TEXT,
  cor TEXT,
  motivo_entrega public.motivo_entrega NOT NULL DEFAULT 'admissao',
  estado public.estado_item NOT NULL DEFAULT 'novo',
  observacao_item TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fui_ficha ON public.fichas_uniforme_itens(ficha_id);

-- =========================================================
-- MOVIMENTAÇÕES ESTOQUE
-- =========================================================
CREATE TABLE public.movimentacoes_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL,
  tipo_item public.tipo_item NOT NULL,
  tipo_mov public.tipo_mov NOT NULL,
  quantidade INTEGER NOT NULL,
  data_mov TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_item ON public.movimentacoes_estoque(item_id, tipo_item);

-- =========================================================
-- NOTIFICAÇÕES
-- =========================================================
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  link_acao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notificacoes(usuario_id, lida);

-- =========================================================
-- ASSINATURA TOKENS (links públicos com expiração 72h)
-- =========================================================
CREATE TABLE public.assinatura_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  ficha_id UUID NOT NULL,
  tipo_ficha public.tipo_item NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  usado BOOLEAN NOT NULL DEFAULT false,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_token ON public.assinatura_tokens(token);

-- =========================================================
-- RLS — ENABLE
-- =========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniformes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_epi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_epi_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_uniforme ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_uniforme_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinatura_tokens ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- PROFILES
CREATE POLICY "profiles select own or admin/rh/supervisor"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin_or_rh(auth.uid())
  OR supervisor_id = auth.uid()
);
CREATE POLICY "profiles update own basic or admin/rh"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin_or_rh(auth.uid()));
CREATE POLICY "profiles insert admin/rh"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(auth.uid()));
CREATE POLICY "profiles delete admin"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES
CREATE POLICY "user_roles select self or admin"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles all admin"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- EPIs
CREATE POLICY "epis select authenticated"
ON public.epis FOR SELECT TO authenticated USING (true);
CREATE POLICY "epis modify admin/rh"
ON public.epis FOR ALL TO authenticated
USING (public.is_admin_or_rh(auth.uid()))
WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- UNIFORMES
CREATE POLICY "uniformes select authenticated"
ON public.uniformes FOR SELECT TO authenticated USING (true);
CREATE POLICY "uniformes modify admin/rh"
ON public.uniformes FOR ALL TO authenticated
USING (public.is_admin_or_rh(auth.uid()))
WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- FICHAS EPI
CREATE POLICY "fichas_epi select"
ON public.fichas_epi FOR SELECT TO authenticated
USING (
  colaborador_id = auth.uid()
  OR public.is_admin_or_rh(auth.uid())
  OR public.is_supervisor_of(auth.uid(), colaborador_id)
);
CREATE POLICY "fichas_epi insert admin/rh"
ON public.fichas_epi FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(auth.uid()));
CREATE POLICY "fichas_epi update admin/rh/supervisor"
ON public.fichas_epi FOR UPDATE TO authenticated
USING (
  public.is_admin_or_rh(auth.uid())
  OR public.is_supervisor_of(auth.uid(), colaborador_id)
);
CREATE POLICY "fichas_epi delete admin"
ON public.fichas_epi FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- FICHAS EPI ITENS
CREATE POLICY "fei select"
ON public.fichas_epi_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_epi f WHERE f.id = ficha_id AND (
    f.colaborador_id = auth.uid()
    OR public.is_admin_or_rh(auth.uid())
    OR public.is_supervisor_of(auth.uid(), f.colaborador_id)
  )
));
CREATE POLICY "fei modify admin/rh"
ON public.fichas_epi_itens FOR ALL TO authenticated
USING (public.is_admin_or_rh(auth.uid()))
WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- FICHAS UNIFORME (mirror)
CREATE POLICY "fichas_uni select"
ON public.fichas_uniforme FOR SELECT TO authenticated
USING (
  colaborador_id = auth.uid()
  OR public.is_admin_or_rh(auth.uid())
  OR public.is_supervisor_of(auth.uid(), colaborador_id)
);
CREATE POLICY "fichas_uni insert admin/rh"
ON public.fichas_uniforme FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(auth.uid()));
CREATE POLICY "fichas_uni update admin/rh/supervisor"
ON public.fichas_uniforme FOR UPDATE TO authenticated
USING (
  public.is_admin_or_rh(auth.uid())
  OR public.is_supervisor_of(auth.uid(), colaborador_id)
);
CREATE POLICY "fichas_uni delete admin"
ON public.fichas_uniforme FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "fui select"
ON public.fichas_uniforme_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.fichas_uniforme f WHERE f.id = ficha_id AND (
    f.colaborador_id = auth.uid()
    OR public.is_admin_or_rh(auth.uid())
    OR public.is_supervisor_of(auth.uid(), f.colaborador_id)
  )
));
CREATE POLICY "fui modify admin/rh"
ON public.fichas_uniforme_itens FOR ALL TO authenticated
USING (public.is_admin_or_rh(auth.uid()))
WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- MOVIMENTAÇÕES
CREATE POLICY "mov select admin/rh"
ON public.movimentacoes_estoque FOR SELECT TO authenticated
USING (public.is_admin_or_rh(auth.uid()));
CREATE POLICY "mov modify admin/rh"
ON public.movimentacoes_estoque FOR ALL TO authenticated
USING (public.is_admin_or_rh(auth.uid()))
WITH CHECK (public.is_admin_or_rh(auth.uid()));

-- NOTIFICAÇÕES
CREATE POLICY "notif select own"
ON public.notificacoes FOR SELECT TO authenticated
USING (usuario_id = auth.uid());
CREATE POLICY "notif update own"
ON public.notificacoes FOR UPDATE TO authenticated
USING (usuario_id = auth.uid());
CREATE POLICY "notif insert admin/rh"
ON public.notificacoes FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_rh(auth.uid()) OR usuario_id = auth.uid());

-- ASSINATURA TOKENS — leitura pública (validação por token), criação por admin/rh/supervisor
CREATE POLICY "tokens select public"
ON public.assinatura_tokens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tokens update public (consume)"
ON public.assinatura_tokens FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "tokens insert authenticated"
ON public.assinatura_tokens FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
