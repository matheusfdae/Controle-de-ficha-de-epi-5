-- =========================================================
-- Cadastro de postos com localização (latitude/longitude) para o mapa da
-- tela "Fichas por Posto" — pedido do Matheus em 08/10/2026.
--
-- A ficha continua guardando o posto como texto (fichas_epi.posto_snapshot);
-- a ligação ficha -> posto é pelo nome, sem diferenciar maiúsculas/espaços.
-- `apelidos` junta grafias diferentes do mesmo lugar ("PARKSHOPPING" ->
-- "PARK SHOPPING").
-- =========================================================
CREATE TABLE IF NOT EXISTS public.postos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (trim(nome) <> ''),
  nome_chave text GENERATED ALWAYS AS (lower(regexp_replace(trim(nome), '\s+', ' ', 'g'))) STORED,
  uf text NOT NULL DEFAULT 'DF' REFERENCES public.estados(uf),
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  apelidos text[] NOT NULL DEFAULT '{}',
  endereco text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT postos_nome_chave_key UNIQUE (nome_chave),
  CONSTRAINT postos_lat_lng_juntos CHECK ((latitude IS NULL) = (longitude IS NULL))
);

DROP TRIGGER IF EXISTS trg_postos_updated ON public.postos;
CREATE TRIGGER trg_postos_updated BEFORE UPDATE ON public.postos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.postos ENABLE ROW LEVEL SECURITY;

-- Ver: quem acessa o estado do posto. Mexer: quem edita Configurações (mesma
-- regra de Modelos de Ficha) e acessa o estado.
DROP POLICY IF EXISTS "postos select por estado" ON public.postos;
CREATE POLICY "postos select por estado" ON public.postos FOR SELECT TO authenticated
  USING (public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "postos insert por permissao" ON public.postos;
CREATE POLICY "postos insert por permissao" ON public.postos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "postos update por permissao" ON public.postos;
CREATE POLICY "postos update por permissao" ON public.postos FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "postos delete por permissao" ON public.postos;
CREATE POLICY "postos delete por permissao" ON public.postos FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit') AND public.pode_acessar_uf(uf));
