-- =========================================================
-- Pedidos — materiais de limpeza dos postos (especificação "Fluxo de Pedido
-- – Materiais de Limpeza", Modernização · Grupo 5 Estrelas; decisões do
-- Matheus de 29/10 a 31/10/2026). Controle só de QUANTIDADE: sem preço,
-- sem teto em reais, sem orçamento.
--
-- * O encarregado pede pelo link público, igual à solicitação de crachá
--   (matrícula OU CPF de colaborador ativo na Senior). Pode ser único ou
--   recorrente (diário, semanal, quinzenal, mensal); cada repetição é um
--   pedido novo.
-- * Fluxo (máquina de estados, só pelas funções):
--     enviada --(supervisor confere/ajusta)--> a_atender
--     enviada --(supervisor devolve)--> devolvida --(encarregado corrige)--> enviada
--     a_atender --(compras atende, com a quantidade entregue de cada item)--> atendida
--     cancelada: encarregado (enviada/devolvida); compras/gerência (antes de atendida)
-- * O supervisor confere comparando com o estoque e o consumo do posto
--   (plantões: 20261031120000_estoque_posto.sql).
-- * Número SOL-AAAA-000001 (sequência por ano).
-- * Itens com variações (item_pai_id), marcados como EPI (aviso imediato) e
--   lista de itens por posto (posto_materiais): posto com lista só pede dela.
-- * Cada passo fica em pedido_eventos.
--
-- Escrita de pedido só pelas funções (SECURITY DEFINER). Re-executável.
-- =========================================================

-- Funções de uma versão anterior desta migration (alçada por valor), que só existiu em teste.
DROP FUNCTION IF EXISTS public.pedido_material_decidir(uuid, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.material_compra_registrar(uuid, uuid, text, text, date, jsonb, text);
DROP FUNCTION IF EXISTS public.gasto_do_posto(uuid, date);
DROP FUNCTION IF EXISTS public._pm_preco(uuid);
DROP FUNCTION IF EXISTS public._pm_validar_itens(jsonb);
DROP FUNCTION IF EXISTS public._pm_niveis(numeric, boolean);
DROP FUNCTION IF EXISTS public._pm_e_aprovador(text, text, uuid);

-- Versão com preço, teto e orçamento (só existiu em teste): sai tudo o que era de valor.
DROP VIEW IF EXISTS public.vw_material_precos;
DROP FUNCTION IF EXISTS public.pedido_material_orcar(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.pedido_material_aprovar_excesso(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.material_compra_registrar(uuid, uuid, text, text, date, jsonb, text, text, text);
DROP FUNCTION IF EXISTS public.nova_tabela_precos(text);
DROP FUNCTION IF EXISTS public.publicar_tabela_precos(uuid, date);
DROP FUNCTION IF EXISTS public.simular_tabela_precos(uuid);
DROP FUNCTION IF EXISTS public.pedidos_material_marcar_cobrados(uuid[], boolean, text);
DROP FUNCTION IF EXISTS public.pedidos_material_minhas_tarefas();
DROP FUNCTION IF EXISTS public.teto_do_posto(uuid, date);
DROP FUNCTION IF EXISTS public.gasto_do_posto(uuid, date, uuid);
DROP FUNCTION IF EXISTS public._pm_preco(uuid, date);
DROP FUNCTION IF EXISTS public._pm_tabela_em(date);
DO $$ BEGIN
  IF to_regclass('public.pedidos_material') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS public._pm_valor(public.pedidos_material);
  END IF;
END $$;
DROP TABLE IF EXISTS public.material_codigos_fornecedor, public.material_compras_itens, public.material_compras,
  public.tabela_precos_itens, public.tabela_precos, public.posto_tetos CASCADE;

-- ---------- Datas no fuso de Brasília ----------
CREATE OR REPLACE FUNCTION public._pm_hoje()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- ---------- Catálogo de itens ----------
CREATE TABLE IF NOT EXISTS public.materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (trim(nome) <> ''),
  -- Variação de um item (ex.: "Detergente" -> "500 ml"). O item pai só agrupa.
  item_pai_id uuid REFERENCES public.materiais(id) ON DELETE RESTRICT,
  unidade text NOT NULL DEFAULT 'un' CHECK (trim(unidade) <> ''),
  categoria text,
  -- Item de EPI: o pedido avisa na hora os e-mails configurados.
  is_epi boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_pai_diferente CHECK (item_pai_id IS DISTINCT FROM id)
);
-- Nome único entre irmãos (e entre os itens sem pai).
CREATE UNIQUE INDEX IF NOT EXISTS idx_materiais_nome
  ON public.materiais (coalesce(item_pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(regexp_replace(trim(nome), '\s+', ' ', 'g')));

DROP TRIGGER IF EXISTS trg_materiais_updated ON public.materiais;
CREATE TRIGGER trg_materiais_updated BEFORE UPDATE ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Um nível só: o pai não pode ser variação de outro, nem ganhar pai tendo filhos.
CREATE OR REPLACE FUNCTION public._pm_materiais_um_nivel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.item_pai_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM materiais WHERE id = NEW.item_pai_id AND item_pai_id IS NOT NULL) THEN
      RAISE EXCEPTION 'O item pai não pode ser variação de outro item.';
    END IF;
    IF EXISTS (SELECT 1 FROM materiais WHERE item_pai_id = NEW.id) THEN
      RAISE EXCEPTION 'Este item tem variações: ele não pode virar variação de outro.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_materiais_um_nivel ON public.materiais;
CREATE TRIGGER trg_materiais_um_nivel BEFORE INSERT OR UPDATE OF item_pai_id ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public._pm_materiais_um_nivel();

-- Nome para mostrar: "Detergente — 500 ml".
CREATE OR REPLACE FUNCTION public._pm_nome_material(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p.id IS NULL THEN m.nome ELSE p.nome || ' — ' || m.nome END
  FROM materiais m LEFT JOIN materiais p ON p.id = m.item_pai_id WHERE m.id = _id
$$;

-- ---------- Lista de itens por posto: posto com lista só pede dela ----------
CREATE TABLE IF NOT EXISTS public.posto_materiais (
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  PRIMARY KEY (posto_id, material_id)
);

-- ---------- Avisos por e-mail (uma linha só) ----------
CREATE TABLE IF NOT EXISTS public.pedido_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  avisar_email boolean NOT NULL DEFAULT true,
  -- Endereço do sistema para o botão do e-mail (ex.: https://epi.empresa.com.br).
  link_sistema text,
  -- Quem recebe o aviso de pedido com item de EPI.
  emails_epi text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pedido_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_pedido_config_updated ON public.pedido_config;
CREATE TRIGGER trg_pedido_config_updated BEFORE UPDATE ON public.pedido_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Papéis por estado (postos vazio = todos do estado) ----------
CREATE TABLE IF NOT EXISTS public.pedido_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nivel text NOT NULL CHECK (nivel IN ('supervisor', 'compras', 'comercial', 'gerencia')),
  uf text NOT NULL REFERENCES public.estados(uf),
  postos uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_aprovadores_key UNIQUE (user_id, nivel, uf)
);

-- ---------- Recorrência (modelo que gera os pedidos) ----------
CREATE TABLE IF NOT EXISTS public.pedido_recorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  frequencia text NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'quinzenal', 'mensal')),
  -- [{material_id, quantidade}]
  itens jsonb NOT NULL,
  observacao text,
  proxima_data date NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  encerrada_em timestamptz,
  solicitante_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  solicitante_nome text NOT NULL,
  solicitante_matricula text,
  solicitante_cargo text,
  solicitante_telefone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Numeração SOL-AAAA-000001 ----------
CREATE TABLE IF NOT EXISTS public.pedido_numeracao (
  ano integer PRIMARY KEY,
  ultimo integer NOT NULL
);

-- Repetição programada pelo supervisor/gerência a partir de um pedido
-- (criado_por NULL = o encarregado pediu pelo link).
ALTER TABLE public.pedido_recorrencias ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pedido_recorrencias ADD COLUMN IF NOT EXISTS encerrada_por text;
ALTER TABLE public.pedido_recorrencias ADD COLUMN IF NOT EXISTS origem_pedido_id uuid;

-- ---------- Pedido ----------
CREATE TABLE IF NOT EXISTS public.pedidos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  numero integer NOT NULL,
  codigo text GENERATED ALWAYS AS ('SOL-' || ano::text || '-' || lpad(numero::text, 6, '0')) STORED,
  posto_id uuid NOT NULL REFERENCES public.postos(id),
  uf text NOT NULL REFERENCES public.estados(uf),
  recorrencia_id uuid REFERENCES public.pedido_recorrencias(id) ON DELETE SET NULL,
  data_pedido date NOT NULL DEFAULT public._pm_hoje(),
  status text NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada', 'devolvida', 'a_atender', 'atendida', 'cancelada')),
  tem_epi boolean NOT NULL DEFAULT false,
  -- Quando o supervisor conferiu e quando compras atendeu.
  conferida_em timestamptz,
  atendida_em timestamptz,
  observacao text,
  -- Avisos por e-mail já enviados (função avisar-pedidos-material).
  notificado_status text,
  epi_avisado boolean NOT NULL DEFAULT false,
  solicitante_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  solicitante_nome text NOT NULL,
  solicitante_matricula text,
  solicitante_cargo text,
  solicitante_telefone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_material_numero_key UNIQUE (ano, numero),
  -- Uma recorrência gera no máximo um pedido por data.
  CONSTRAINT pedidos_material_recorrencia_data_key UNIQUE (recorrencia_id, data_pedido)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_posto_data ON public.pedidos_material (posto_id, data_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_status ON public.pedidos_material (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_solicitante ON public.pedidos_material (solicitante_senior_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_pedidos_material_updated ON public.pedidos_material;
CREATE TRIGGER trg_pedidos_material_updated BEFORE UPDATE ON public.pedidos_material
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pedidos_material_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  -- Quanto o encarregado pediu e quanto vale agora (depois da conferência).
  quantidade_pedida numeric(12, 2) NOT NULL CHECK (quantidade_pedida > 0),
  quantidade numeric(12, 2) NOT NULL CHECK (quantidade > 0),
  -- Quanto compras entregou (pode ser menos que o conferido).
  quantidade_atendida numeric(12, 2) CHECK (quantidade_atendida >= 0),
  CONSTRAINT pedidos_material_itens_material_key UNIQUE (pedido_id, material_id)
);

-- Banco que já tinha a versão com preço: tira as colunas de valor e leva os
-- pedidos para os estados novos (orçamento/aprovação/a faturar -> a atender,
-- faturada -> atendida, reprovada -> cancelada).
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS conferida_em timestamptz;
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS atendida_em timestamptz;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos_material' AND column_name = 'faturada_em') THEN
    UPDATE public.pedidos_material SET atendida_em = coalesce(atendida_em, faturada_em);
  END IF;
END $$;
ALTER TABLE public.pedidos_material DROP CONSTRAINT IF EXISTS pedidos_material_status_check;
UPDATE public.pedidos_material SET status = CASE status
  WHEN 'em_orcamento' THEN 'a_atender' WHEN 'aguardando_aprovacao' THEN 'a_atender' WHEN 'a_faturar' THEN 'a_atender'
  WHEN 'faturada' THEN 'atendida' WHEN 'reprovada' THEN 'cancelada' ELSE status END
WHERE status IN ('em_orcamento', 'aguardando_aprovacao', 'a_faturar', 'faturada', 'reprovada');
ALTER TABLE public.pedidos_material ADD CONSTRAINT pedidos_material_status_check
  CHECK (status IN ('enviada', 'devolvida', 'a_atender', 'atendida', 'cancelada'));
ALTER TABLE public.pedidos_material DROP COLUMN IF EXISTS valor_estimado, DROP COLUMN IF EXISTS valor_orcado,
  DROP COLUMN IF EXISTS valor_real, DROP COLUMN IF EXISTS excede_teto, DROP COLUMN IF EXISTS sem_preco,
  DROP COLUMN IF EXISTS data_aprovacao, DROP COLUMN IF EXISTS faturada_em, DROP COLUMN IF EXISTS cobrar_cliente,
  DROP COLUMN IF EXISTS cobrado_em, DROP COLUMN IF EXISTS cobrado_por, DROP COLUMN IF EXISTS cobranca_ref;
ALTER TABLE public.pedidos_material_itens ADD COLUMN IF NOT EXISTS quantidade_atendida numeric(12, 2) CHECK (quantidade_atendida >= 0);
ALTER TABLE public.pedidos_material_itens DROP COLUMN IF EXISTS preco_ref, DROP COLUMN IF EXISTS preco_orcado;

-- Histórico: cada passo (inclusive do encarregado pelo link).
CREATE TABLE IF NOT EXISTS public.pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  de_status text,
  para_status text NOT NULL,
  papel text,
  comentario text,
  payload jsonb,
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  usuario_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido ON public.pedido_eventos (pedido_id, created_at);
UPDATE public.pedido_eventos SET
  de_status = CASE de_status WHEN 'em_orcamento' THEN 'a_atender' WHEN 'aguardando_aprovacao' THEN 'a_atender' WHEN 'a_faturar' THEN 'a_atender'
    WHEN 'faturada' THEN 'atendida' WHEN 'reprovada' THEN 'cancelada' ELSE de_status END,
  para_status = CASE para_status WHEN 'em_orcamento' THEN 'a_atender' WHEN 'aguardando_aprovacao' THEN 'a_atender' WHEN 'a_faturar' THEN 'a_atender'
    WHEN 'faturada' THEN 'atendida' WHEN 'reprovada' THEN 'cancelada' ELSE para_status END
WHERE de_status IN ('em_orcamento', 'aguardando_aprovacao', 'a_faturar', 'faturada', 'reprovada')
   OR para_status IN ('em_orcamento', 'aguardando_aprovacao', 'a_faturar', 'faturada', 'reprovada');

-- =========================================================
-- Regras de cálculo e de papel
-- =========================================================

-- O usuário atual tem um destes papéis no posto? (admin sempre tem; NULL = qualquer papel)
CREATE OR REPLACE FUNCTION public._pm_tem_papel(_papeis text[], _uf text, _posto_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(public.current_profile_id(), 'admin') OR EXISTS (
    SELECT 1 FROM pedido_aprovadores
    WHERE user_id = public.current_profile_id() AND uf = _uf
      AND (_papeis IS NULL OR nivel = ANY (_papeis))
      AND (postos = '{}' OR _posto_id = ANY (postos)))
$$;

CREATE OR REPLACE FUNCTION public._pm_aprovador_algum()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pedido_aprovadores WHERE user_id = public.current_profile_id())
$$;

-- Mantém catálogo e listas dos postos: quem edita o módulo ou é de compras.
CREATE OR REPLACE FUNCTION public._pm_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit')
      OR EXISTS (SELECT 1 FROM pedido_aprovadores WHERE user_id = public.current_profile_id() AND nivel = 'compras')
$$;

-- Quem pode ver o pedido: módulo + estado, ou papel naquele posto.
CREATE OR REPLACE FUNCTION public._pm_ve(_uf text, _posto_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') AND public.pode_acessar_uf(_uf))
      OR public._pm_tem_papel(NULL, _uf, _posto_id)
$$;

-- Quem age em cada status.
CREATE OR REPLACE FUNCTION public._pm_responsaveis(_status text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _status
    WHEN 'enviada' THEN ARRAY['supervisor']
    WHEN 'a_atender' THEN ARRAY['compras']
    ELSE '{}'::text[] END
$$;

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posto_materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_aprovadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_numeracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_material_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_eventos ENABLE ROW LEVEL SECURITY;

-- Catálogo e itens por posto: lê quem vê o módulo ou tem papel; mexe o gestor.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['materiais', 'posto_materiais'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s select" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s select" ON public.%I FOR SELECT TO authenticated USING (public.has_permission(public.current_profile_id(), ''pedidos_material'', ''view'') OR public._pm_aprovador_algum())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s escrita" ON public.%I', t, t);
  END LOOP;
END $$;
CREATE POLICY "materiais escrita" ON public.materiais FOR ALL TO authenticated
  USING (public._pm_gestor()) WITH CHECK (public._pm_gestor());
CREATE POLICY "posto_materiais escrita" ON public.posto_materiais FOR ALL TO authenticated
  USING (public._pm_gestor() AND EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public.pode_acessar_uf(p.uf)))
  WITH CHECK (public._pm_gestor() AND EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public.pode_acessar_uf(p.uf)));
DROP POLICY IF EXISTS "pedido_config select" ON public.pedido_config;
CREATE POLICY "pedido_config select" ON public.pedido_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view'));
DROP POLICY IF EXISTS "pedido_config update" ON public.pedido_config;
CREATE POLICY "pedido_config update" ON public.pedido_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'));

-- Papéis: cada um vê as próprias linhas; quem edita o módulo vê e mexe em todas.
DROP POLICY IF EXISTS "pedido_aprovadores select" ON public.pedido_aprovadores;
CREATE POLICY "pedido_aprovadores select" ON public.pedido_aprovadores FOR SELECT TO authenticated
  USING (user_id = public.current_profile_id()
         OR public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'));
DROP POLICY IF EXISTS "pedido_aprovadores escrita" ON public.pedido_aprovadores;
CREATE POLICY "pedido_aprovadores escrita" ON public.pedido_aprovadores FOR ALL TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit') AND public.pode_acessar_uf(uf));

DROP POLICY IF EXISTS "pedido_recorrencias select" ON public.pedido_recorrencias;
CREATE POLICY "pedido_recorrencias select" ON public.pedido_recorrencias FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public._pm_ve(p.uf, p.id)));

DROP POLICY IF EXISTS "pedidos_material select" ON public.pedidos_material;
CREATE POLICY "pedidos_material select" ON public.pedidos_material FOR SELECT TO authenticated
  USING (public._pm_ve(uf, posto_id));
DROP POLICY IF EXISTS "pedidos_material_itens select" ON public.pedidos_material_itens;
CREATE POLICY "pedidos_material_itens select" ON public.pedidos_material_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND public._pm_ve(p.uf, p.posto_id)));
DROP POLICY IF EXISTS "pedido_eventos select" ON public.pedido_eventos;
CREATE POLICY "pedido_eventos select" ON public.pedido_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND public._pm_ve(p.uf, p.posto_id)));

-- =========================================================
-- Pedido: criação, recálculo e histórico (internas)
-- =========================================================

CREATE OR REPLACE FUNCTION public._pm_evento(_pedido_id uuid, _de text, _para text, _papel text,
  _comentario text, _payload jsonb DEFAULT NULL, _ator_nome text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO pedido_eventos (pedido_id, de_status, para_status, papel, comentario, payload, usuario_id, usuario_nome)
  VALUES (_pedido_id, _de, _para, _papel, nullif(left(trim(coalesce(_comentario, '')), 1000), ''), _payload,
    public.current_profile_id(),
    coalesce(_ator_nome, (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id())))
$$;

-- Marca se o pedido tem item de EPI (aviso imediato por e-mail).
CREATE OR REPLACE FUNCTION public._pm_recalcular(_pedido_id uuid)
RETURNS public.pedidos_material
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pedidos_material;
BEGIN
  UPDATE pedidos_material p SET
    tem_epi = EXISTS (SELECT 1 FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id AND m.is_epi)
  WHERE p.id = _pedido_id RETURNING * INTO _p;
  RETURN _p;
END $$;

-- _itens = [{material_id, quantidade}] (já validados).
CREATE OR REPLACE FUNCTION public._pm_criar_pedido(
  _posto public.postos, _itens jsonb, _observacao text, _data date, _recorrencia_id uuid,
  _sol_id uuid, _sol_nome text, _sol_matricula text, _sol_cargo text, _sol_telefone text)
RETURNS public.pedidos_material
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material;
  _ano integer := extract(year FROM _data)::integer;
  _num integer;
BEGIN
  INSERT INTO pedido_numeracao (ano, ultimo) VALUES (_ano, 1)
  ON CONFLICT (ano) DO UPDATE SET ultimo = pedido_numeracao.ultimo + 1
  RETURNING ultimo INTO _num;

  INSERT INTO pedidos_material (ano, numero, posto_id, uf, recorrencia_id, data_pedido, observacao,
    solicitante_senior_id, solicitante_nome, solicitante_matricula, solicitante_cargo, solicitante_telefone)
  VALUES (_ano, _num, _posto.id, _posto.uf, _recorrencia_id, _data, nullif(left(trim(coalesce(_observacao, '')), 1000), ''),
    _sol_id, _sol_nome, _sol_matricula, _sol_cargo, _sol_telefone)
  RETURNING * INTO _p;

  -- Mesmo material repetido vira uma linha só.
  INSERT INTO pedidos_material_itens (pedido_id, material_id, quantidade_pedida, quantidade)
  SELECT _p.id, (e ->> 'material_id')::uuid, sum((e ->> 'quantidade')::numeric), sum((e ->> 'quantidade')::numeric)
  FROM jsonb_array_elements(_itens) e GROUP BY 2;

  _p := public._pm_recalcular(_p.id);
  PERFORM public._pm_evento(_p.id, NULL, 'enviada', 'encarregado',
    CASE WHEN _recorrencia_id IS NOT NULL THEN 'Gerado pela recorrência' END, NULL, _sol_nome);
  RETURN _p;
END $$;

-- Item que pode ser pedido: ativo, sem variações ativas (o pai só agrupa) e,
-- quando o posto tem lista própria, está na lista do posto.
CREATE OR REPLACE FUNCTION public._pm_pedivel(_material_id uuid, _posto public.postos)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM materiais m WHERE m.id = _material_id AND m.ativo
      AND (m.item_pai_id IS NULL OR EXISTS (SELECT 1 FROM materiais p WHERE p.id = m.item_pai_id AND p.ativo))
      AND NOT EXISTS (SELECT 1 FROM materiais f WHERE f.item_pai_id = m.id AND f.ativo))
    AND (NOT EXISTS (SELECT 1 FROM posto_materiais WHERE posto_id = _posto.id)
         OR EXISTS (SELECT 1 FROM posto_materiais WHERE posto_id = _posto.id AND material_id = _material_id))
$$;

-- Confere a lista de itens vinda do link: 1 a 50 itens pedíveis no posto.
CREATE OR REPLACE FUNCTION public._pm_validar_itens(_itens jsonb, _posto public.postos)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _e jsonb; _q numeric;
BEGIN
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um item.';
  END IF;
  IF jsonb_array_length(_itens) > 50 THEN
    RAISE EXCEPTION 'No máximo 50 itens por pedido.';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    IF coalesce(_e ->> 'material_id', '') !~ '^[0-9a-f-]{36}$' OR NOT public._pm_pedivel((_e ->> 'material_id')::uuid, _posto) THEN
      RAISE EXCEPTION 'Item fora do catálogo deste posto. Atualize a página.';
    END IF;
    _q := CASE WHEN (_e ->> 'quantidade') ~ '^\d+(\.\d{1,2})?$' THEN (_e ->> 'quantidade')::numeric END;
    IF _q IS NULL OR _q <= 0 OR _q > 100000 THEN
      RAISE EXCEPTION 'Quantidade inválida.';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._pm_proxima(_data date, _frequencia text)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (_data + CASE _frequencia
    WHEN 'diaria' THEN interval '1 day'
    WHEN 'semanal' THEN interval '7 days'
    WHEN 'quinzenal' THEN interval '14 days'
    ELSE interval '1 month' END)::date
$$;

-- =========================================================
-- Recorrências: gera os pedidos que venceram até hoje (idempotente; as
-- telas e o agendador dos avisos chamam).
-- =========================================================
CREATE OR REPLACE FUNCTION public.gerar_pedidos_recorrentes()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _r public.pedido_recorrencias;
  _posto public.postos;
  _itens jsonb;
  _hoje date := public._pm_hoje();
  _n integer := 0;
  _voltas integer;
BEGIN
  FOR _r IN SELECT * FROM pedido_recorrencias WHERE ativa AND proxima_data <= _hoje
            ORDER BY proxima_data FOR UPDATE SKIP LOCKED LOOP
    SELECT * INTO _posto FROM postos WHERE id = _r.posto_id;
    -- Só itens que continuam pedíveis no posto.
    SELECT coalesce(jsonb_agg(e), '[]') INTO _itens FROM jsonb_array_elements(_r.itens) e
    WHERE public._pm_pedivel((e ->> 'material_id')::uuid, _posto);
    IF NOT coalesce(_posto.ativo, false) OR jsonb_array_length(_itens) = 0
       OR (_r.solicitante_senior_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM colaboradores_senior WHERE id = _r.solicitante_senior_id AND ativo)) THEN
      UPDATE pedido_recorrencias SET ativa = false, encerrada_em = now() WHERE id = _r.id;
      CONTINUE;
    END IF;
    _voltas := 0;
    -- Até 31 repetições atrasadas por vez (ex.: diária parada um mês).
    WHILE _r.proxima_data <= _hoje AND _voltas < 31 LOOP
      IF NOT EXISTS (SELECT 1 FROM pedidos_material WHERE recorrencia_id = _r.id AND data_pedido = _r.proxima_data) THEN
        PERFORM public._pm_criar_pedido(_posto, _itens, _r.observacao, _r.proxima_data, _r.id,
          _r.solicitante_senior_id, _r.solicitante_nome, _r.solicitante_matricula, _r.solicitante_cargo, _r.solicitante_telefone);
        _n := _n + 1;
      END IF;
      _r.proxima_data := public._pm_proxima(_r.proxima_data, _r.frequencia);
      _voltas := _voltas + 1;
    END LOOP;
    UPDATE pedido_recorrencias SET proxima_data = _r.proxima_data WHERE id = _r.id;
  END LOOP;
  RETURN _n;
END $$;

-- =========================================================
-- Link público (mesma identificação da solicitação de crachá:
-- _cracha_solicitante confere a matrícula/CPF e limita tentativas)
-- =========================================================

-- Posto cadastrado que bate com o posto/local do colaborador na Senior.
CREATE OR REPLACE FUNCTION public._pm_posto_do_colaborador(_c public.colaboradores_senior)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH chaves AS (
    SELECT lower(regexp_replace(trim(v), '\s+', ' ', 'g')) AS chave FROM unnest(ARRAY[
      regexp_replace(coalesce(_c.posto_descricao, ''), '^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*', ''),
      coalesce(_c.nome_local, '')]) v
    WHERE trim(v) <> '')
  SELECT p.id FROM postos p, chaves k
  WHERE p.ativo AND (p.nome_chave = k.chave
    OR EXISTS (SELECT 1 FROM unnest(p.apelidos) a WHERE lower(regexp_replace(trim(a), '\s+', ' ', 'g')) = k.chave))
  LIMIT 1
$$;

-- Pedidos do solicitante (os 50 últimos), com itens e histórico. Sem valores.
CREATE OR REPLACE FUNCTION public._pm_pedidos_do_solicitante(_sol_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.criado_em DESC), '[]') FROM (
    SELECT p.id, p.codigo, p.status, p.data_pedido, p.created_at AS criado_em, p.posto_id,
      p.recorrencia_id IS NOT NULL AS recorrente, po.nome AS posto, p.observacao,
      (SELECT jsonb_agg(jsonb_build_object('material_id', i.material_id, 'nome', public._pm_nome_material(i.material_id),
          'unidade', m.unidade, 'quantidade', i.quantidade, 'quantidade_pedida', i.quantidade_pedida,
          'quantidade_atendida', i.quantidade_atendida)
          ORDER BY public._pm_nome_material(i.material_id))
       FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id) AS itens,
      (SELECT jsonb_agg(jsonb_build_object('status', e.para_status, 'em', e.created_at,
          'comentario', CASE WHEN e.para_status IN ('devolvida', 'cancelada', 'atendida') THEN e.comentario END)
          ORDER BY e.created_at)
       FROM pedido_eventos e WHERE e.pedido_id = p.id) AS historico
    FROM pedidos_material p JOIN postos po ON po.id = p.posto_id
    WHERE p.solicitante_senior_id = _sol_id
    ORDER BY p.created_at DESC LIMIT 50) x
$$;

CREATE OR REPLACE FUNCTION public._pm_identificar(_matricula integer, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
BEGIN
  PERFORM public.gerar_pedidos_recorrentes();
  RETURN jsonb_build_object(
    'nome', _s.nome, 'cargo', _s.cargo, 'uf', _s.uf,
    'posto_sugerido', public._pm_posto_do_colaborador(_s),
    -- Posto com lista própria leva a lista: o encarregado só vê esses itens.
    'postos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'uf', p.uf,
                 'itens', CASE WHEN EXISTS (SELECT 1 FROM posto_materiais x WHERE x.posto_id = p.id)
                               THEN (SELECT coalesce(jsonb_agg(pm.material_id), '[]')
                                                         FROM posto_materiais pm WHERE pm.posto_id = p.id) END)
                 ORDER BY p.nome), '[]')
               FROM postos p WHERE p.ativo AND (_s.uf IS NULL OR p.uf = _s.uf)),
    'materiais', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'unidade', m.unidade,
                    'categoria', coalesce(m.categoria, p.categoria), 'grupo', p.nome)
                    ORDER BY coalesce(m.categoria, p.categoria) NULLS LAST, coalesce(p.nome, m.nome), m.nome), '[]')
                  FROM materiais m LEFT JOIN materiais p ON p.id = m.item_pai_id
                  WHERE public._pm_pedivel(m.id, NULL)),
    'pedidos', public._pm_pedidos_do_solicitante(_s.id),
    'recorrencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'frequencia', r.frequencia,
                       'proxima_data', r.proxima_data, 'posto', po.nome,
                       'itens', (SELECT jsonb_agg(jsonb_build_object('nome', public._pm_nome_material(m.id), 'unidade', m.unidade,
                                   'quantidade', (e ->> 'quantidade')::numeric) ORDER BY m.nome)
                                 FROM jsonb_array_elements(r.itens) e JOIN materiais m ON m.id::text = e ->> 'material_id'))
                       ORDER BY r.created_at DESC), '[]')
                     FROM pedido_recorrencias r JOIN postos po ON po.id = r.posto_id
                     WHERE r.ativa AND r.solicitante_senior_id = _s.id));
END $$;

CREATE OR REPLACE FUNCTION public._pm_enviar(
  _matricula integer, _cpf text, _telefone text, _posto_id uuid, _itens jsonb,
  _observacao text, _frequencia text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _tel text := nullif(regexp_replace(coalesce(_telefone, ''), '\D', '', 'g'), '');
  _posto public.postos;
  _rec uuid;
  _p public.pedidos_material;
  _hoje date := public._pm_hoje();
BEGIN
  IF coalesce(_frequencia, 'unica') NOT IN ('unica', 'diaria', 'semanal', 'quinzenal', 'mensal') THEN
    RAISE EXCEPTION 'Frequência inválida.';
  END IF;
  IF _tel IS NULL OR length(_tel) NOT BETWEEN 10 AND 13 THEN
    RAISE EXCEPTION 'Informe seu telefone com DDD.';
  END IF;
  SELECT * INTO _posto FROM postos WHERE id = _posto_id AND ativo;
  IF _posto.id IS NULL OR (_s.uf IS NOT NULL AND _posto.uf <> _s.uf) THEN
    RAISE EXCEPTION 'Escolha o posto.';
  END IF;
  PERFORM public._pm_validar_itens(_itens, _posto);
  -- Freio contra envio repetido: 20 pedidos por pessoa por dia.
  IF (SELECT count(*) FROM pedidos_material WHERE solicitante_senior_id = _s.id
        AND recorrencia_id IS NULL AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Limite de pedidos do dia atingido. Fale com o seu supervisor.';
  END IF;

  IF coalesce(_frequencia, 'unica') <> 'unica' THEN
    INSERT INTO pedido_recorrencias (posto_id, frequencia, itens, observacao, proxima_data,
      solicitante_senior_id, solicitante_nome, solicitante_matricula, solicitante_cargo, solicitante_telefone)
    VALUES (_posto.id, _frequencia,
      (SELECT jsonb_agg(jsonb_build_object('material_id', e ->> 'material_id', 'quantidade', (e ->> 'quantidade')::numeric))
       FROM jsonb_array_elements(_itens) e),
      nullif(left(trim(coalesce(_observacao, '')), 1000), ''), public._pm_proxima(_hoje, _frequencia),
      _s.id, _s.nome, _s.num_cad::text, _s.cargo, _tel)
    RETURNING id INTO _rec;
  END IF;

  _p := public._pm_criar_pedido(_posto, _itens, _observacao, _hoje, _rec,
    _s.id, _s.nome, _s.num_cad::text, _s.cargo, _tel);
  RETURN jsonb_build_object('ok', true, 'codigo', _p.codigo, 'recorrente', _rec IS NOT NULL);
END $$;

-- Pedido devolvido: o encarregado corrige os itens e reenvia.
CREATE OR REPLACE FUNCTION public._pm_reenviar(_matricula integer, _cpf text, _pedido_id uuid, _itens jsonb, _observacao text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _p public.pedidos_material;
  _posto public.postos;
BEGIN
  SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id AND solicitante_senior_id = _s.id FOR UPDATE;
  IF _p.id IS NULL OR _p.status <> 'devolvida' THEN RAISE EXCEPTION 'Só dá para reenviar pedido devolvido.'; END IF;
  SELECT * INTO _posto FROM postos WHERE id = _p.posto_id;
  PERFORM public._pm_validar_itens(_itens, _posto);
  DELETE FROM pedidos_material_itens WHERE pedido_id = _p.id;
  INSERT INTO pedidos_material_itens (pedido_id, material_id, quantidade_pedida, quantidade)
  SELECT _p.id, (e ->> 'material_id')::uuid, sum((e ->> 'quantidade')::numeric), sum((e ->> 'quantidade')::numeric)
  FROM jsonb_array_elements(_itens) e GROUP BY 2;
  UPDATE pedidos_material SET status = 'enviada', notificado_status = NULL,
    observacao = coalesce(nullif(left(trim(coalesce(_observacao, '')), 1000), ''), observacao)
  WHERE id = _p.id;
  PERFORM public._pm_recalcular(_p.id);
  PERFORM public._pm_evento(_p.id, 'devolvida', 'enviada', 'encarregado', _observacao, NULL, _s.nome);
  RETURN jsonb_build_object('ok', true, 'pedidos', public._pm_pedidos_do_solicitante(_s.id));
END $$;

CREATE OR REPLACE FUNCTION public._pm_cancelar(_matricula integer, _cpf text, _pedido_id uuid, _recorrencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
  _de text;
BEGIN
  IF _pedido_id IS NOT NULL THEN
    SELECT status INTO _de FROM pedidos_material WHERE id = _pedido_id AND solicitante_senior_id = _s.id FOR UPDATE;
    IF _de IS NULL OR _de NOT IN ('enviada', 'devolvida') THEN
      RAISE EXCEPTION 'Esse pedido não pode mais ser cancelado por aqui. Fale com compras.';
    END IF;
    UPDATE pedidos_material SET status = 'cancelada' WHERE id = _pedido_id;
    PERFORM public._pm_evento(_pedido_id, _de, 'cancelada', 'encarregado', 'Cancelado pelo encarregado', NULL, _s.nome);
  END IF;
  IF _recorrencia_id IS NOT NULL THEN
    UPDATE pedido_recorrencias SET ativa = false, encerrada_em = now(), encerrada_por = _s.nome || ' (encarregado)'
    WHERE id = _recorrencia_id AND solicitante_senior_id = _s.id AND ativa;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido recorrente não encontrado.'; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'pedidos', public._pm_pedidos_do_solicitante(_s.id));
END $$;

-- Funções chamadas pelo link: devolvem {erro} (a tentativa errada fica gravada).
CREATE OR REPLACE FUNCTION public.pedido_material_identificar(_matricula integer, _cpf text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_identificar(_matricula, _cpf);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_enviar(
  _matricula integer, _cpf text, _telefone text, _posto_id uuid, _itens jsonb,
  _observacao text DEFAULT NULL, _frequencia text DEFAULT 'unica')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_enviar(_matricula, _cpf, _telefone, _posto_id, _itens, _observacao, _frequencia);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_reenviar(
  _matricula integer, _cpf text, _pedido_id uuid, _itens jsonb, _observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_reenviar(_matricula, _cpf, _pedido_id, _itens, _observacao);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_cancelar(
  _matricula integer, _cpf text, _pedido_id uuid DEFAULT NULL, _recorrencia_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_cancelar(_matricula, _cpf, _pedido_id, _recorrencia_id);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

-- =========================================================
-- Fluxo (usuário logado)
-- =========================================================

-- Trava o pedido e confere status e papel.
CREATE OR REPLACE FUNCTION public._pm_pegar(_pedido_id uuid, _status text[], _papeis text[])
RETURNS public.pedidos_material
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pedidos_material;
BEGIN
  SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT (_p.status = ANY (_status)) THEN
    RAISE EXCEPTION 'O pedido % não está mais nesta etapa (agora: %).', _p.codigo, _p.status;
  END IF;
  IF NOT public._pm_tem_papel(_papeis, _p.uf, _p.posto_id) THEN
    RAISE EXCEPTION 'Esta etapa é de %, e você não tem esse papel neste posto.', array_to_string(_papeis, ' ou ');
  END IF;
  RETURN _p;
END $$;

-- Supervisor: confere (ajusta quantidades -> a_atender) ou devolve ao encarregado.
-- _quantidades = [{item_id, quantidade}] (0 tira o item).
CREATE OR REPLACE FUNCTION public.pedido_material_conferir(
  _pedido_id uuid, _conferido boolean, _comentario text DEFAULT NULL, _quantidades jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material := public._pm_pegar(_pedido_id, ARRAY['enviada'], ARRAY['supervisor']);
  _e jsonb;
  _q numeric;
  _antes numeric;
  _nome text;
  _ajustes jsonb := '[]';
BEGIN
  IF NOT _conferido THEN
    IF nullif(trim(coalesce(_comentario, '')), '') IS NULL THEN RAISE EXCEPTION 'Escreva o motivo da devolução.'; END IF;
    UPDATE pedidos_material SET status = 'devolvida' WHERE id = _p.id;
    PERFORM public._pm_evento(_p.id, 'enviada', 'devolvida', 'supervisor', _comentario);
    RETURN jsonb_build_object('status', 'devolvida');
  END IF;

  IF _quantidades IS NOT NULL AND jsonb_typeof(_quantidades) = 'array' THEN
    FOR _e IN SELECT * FROM jsonb_array_elements(_quantidades) LOOP
      _q := CASE WHEN (_e ->> 'quantidade') ~ '^\d+(\.\d{1,2})?$' THEN (_e ->> 'quantidade')::numeric END;
      SELECT i.quantidade, public._pm_nome_material(i.material_id) INTO _antes, _nome
      FROM pedidos_material_itens i WHERE i.id::text = _e ->> 'item_id' AND i.pedido_id = _p.id;
      IF _antes IS NULL THEN RAISE EXCEPTION 'Item não pertence ao pedido.'; END IF;
      IF _q IS NULL OR _q > 100000 THEN RAISE EXCEPTION 'Quantidade inválida em %.', _nome; END IF;
      IF _q = _antes THEN CONTINUE; END IF;
      IF _q = 0 THEN
        DELETE FROM pedidos_material_itens WHERE id::text = _e ->> 'item_id';
      ELSE
        UPDATE pedidos_material_itens SET quantidade = _q WHERE id::text = _e ->> 'item_id';
      END IF;
      _ajustes := _ajustes || jsonb_build_object('item', _nome, 'de', _antes, 'para', _q);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pedidos_material_itens WHERE pedido_id = _p.id) THEN
      RAISE EXCEPTION 'O pedido ficaria sem itens. Para não atender, devolva com o motivo.';
    END IF;
  END IF;

  UPDATE pedidos_material SET status = 'a_atender', conferida_em = now() WHERE id = _p.id;
  _p := public._pm_recalcular(_p.id);
  PERFORM public._pm_evento(_p.id, 'enviada', 'a_atender', 'supervisor', _comentario,
    CASE WHEN jsonb_array_length(_ajustes) > 0 THEN jsonb_build_object('ajustes', _ajustes) END);
  RETURN jsonb_build_object('status', 'a_atender');
END $$;

-- Compras: atende o pedido. _quantidades = [{item_id, quantidade}] com o que foi
-- entregue de cada item; item que não vier fica com a quantidade conferida.
-- Entregar menos que o conferido exige o motivo no comentário.
CREATE OR REPLACE FUNCTION public.pedido_material_atender(_pedido_id uuid, _comentario text DEFAULT NULL, _quantidades jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material := public._pm_pegar(_pedido_id, ARRAY['a_atender'], ARRAY['compras']);
  _e jsonb;
  _q numeric;
  _antes numeric;
  _nome text;
  _faltas jsonb := '[]';
BEGIN
  UPDATE pedidos_material_itens SET quantidade_atendida = quantidade WHERE pedido_id = _p.id;
  IF _quantidades IS NOT NULL AND jsonb_typeof(_quantidades) = 'array' THEN
    FOR _e IN SELECT * FROM jsonb_array_elements(_quantidades) LOOP
      _q := CASE WHEN (_e ->> 'quantidade') ~ '^\d+(\.\d{1,2})?$' THEN (_e ->> 'quantidade')::numeric END;
      SELECT i.quantidade, public._pm_nome_material(i.material_id) INTO _antes, _nome
      FROM pedidos_material_itens i WHERE i.id::text = _e ->> 'item_id' AND i.pedido_id = _p.id;
      IF _antes IS NULL THEN RAISE EXCEPTION 'Item não pertence ao pedido.'; END IF;
      IF _q IS NULL OR _q > 100000 THEN RAISE EXCEPTION 'Quantidade inválida em %.', _nome; END IF;
      UPDATE pedidos_material_itens SET quantidade_atendida = _q WHERE id::text = _e ->> 'item_id';
      IF _q <> _antes THEN _faltas := _faltas || jsonb_build_object('item', _nome, 'de', _antes, 'para', _q); END IF;
    END LOOP;
  END IF;
  IF jsonb_array_length(_faltas) > 0 AND nullif(trim(coalesce(_comentario, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A entrega é diferente do conferido. Escreva o motivo no comentário.';
  END IF;
  UPDATE pedidos_material SET status = 'atendida', atendida_em = now() WHERE id = _p.id;
  PERFORM public._pm_evento(_p.id, 'a_atender', 'atendida', 'compras', _comentario,
    CASE WHEN jsonb_array_length(_faltas) > 0 THEN jsonb_build_object('ajustes', _faltas) END);
  RETURN jsonb_build_object('status', 'atendida', 'diferencas', jsonb_array_length(_faltas));
END $$;

-- Compras/gerência cancelam antes de atender.
CREATE OR REPLACE FUNCTION public.pedido_material_cancelar_interno(_pedido_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material := public._pm_pegar(_pedido_id,
    ARRAY['enviada', 'devolvida', 'a_atender'], ARRAY['compras', 'gerencia']);
BEGIN
  IF nullif(trim(coalesce(_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Escreva o motivo do cancelamento.'; END IF;
  UPDATE pedidos_material SET status = 'cancelada' WHERE id = _p.id;
  PERFORM public._pm_evento(_p.id, _p.status, 'cancelada', NULL, _motivo);
  RETURN jsonb_build_object('status', 'cancelada');
END $$;

-- Supervisor/gerência: repete um pedido (itens e quantidades atuais) com a
-- frequência escolhida. Cada repetição é um pedido novo que passa pela
-- conferência normalmente.
CREATE OR REPLACE FUNCTION public.pedido_material_repetir(_pedido_id uuid, _frequencia text, _primeira date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material;
  _hoje date := public._pm_hoje();
  _data date;
  _id uuid;
  _rotulo text;
BEGIN
  SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id;
  IF _p.id IS NULL OR NOT public._pm_ve(_p.uf, _p.posto_id) THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF NOT public._pm_tem_papel(ARRAY['supervisor', 'gerencia'], _p.uf, _p.posto_id) THEN
    RAISE EXCEPTION 'Só o supervisor ou a gerência do posto programa a repetição.';
  END IF;
  IF _frequencia IS NULL OR _frequencia NOT IN ('diaria', 'semanal', 'quinzenal', 'mensal') THEN
    RAISE EXCEPTION 'Escolha a frequência.';
  END IF;
  IF _p.status IN ('cancelada', 'devolvida') THEN
    RAISE EXCEPTION 'Pedido cancelado ou devolvido não pode ser repetido.';
  END IF;
  IF EXISTS (SELECT 1 FROM pedido_recorrencias WHERE ativa AND (origem_pedido_id = _p.id OR id = _p.recorrencia_id)) THEN
    RAISE EXCEPTION 'Este pedido já se repete. Encerre a repetição atual antes de programar outra.';
  END IF;
  _data := coalesce(_primeira, public._pm_proxima(_hoje, _frequencia));
  IF _data <= _hoje THEN RAISE EXCEPTION 'A primeira repetição tem de ser depois de hoje.'; END IF;
  IF _data > _hoje + 90 THEN RAISE EXCEPTION 'A primeira repetição tem de ser nos próximos 90 dias.'; END IF;

  INSERT INTO pedido_recorrencias (posto_id, frequencia, itens, observacao, proxima_data, criado_por, origem_pedido_id,
    solicitante_senior_id, solicitante_nome, solicitante_matricula, solicitante_cargo, solicitante_telefone)
  SELECT _p.posto_id, _frequencia,
    (SELECT jsonb_agg(jsonb_build_object('material_id', i.material_id, 'quantidade', i.quantidade))
     FROM pedidos_material_itens i WHERE i.pedido_id = _p.id),
    _p.observacao, _data, public.current_profile_id(), _p.id,
    _p.solicitante_senior_id, _p.solicitante_nome, _p.solicitante_matricula, _p.solicitante_cargo, _p.solicitante_telefone
  RETURNING id INTO _id;

  _rotulo := CASE _frequencia WHEN 'diaria' THEN 'todo dia' WHEN 'semanal' THEN 'toda semana'
    WHEN 'quinzenal' THEN 'a cada 15 dias' ELSE 'todo mês' END;
  PERFORM public._pm_evento(_p.id, _p.status, _p.status, NULL,
    format('Repetição programada: %s, a partir de %s', _rotulo, to_char(_data, 'DD/MM/YYYY')));
  RETURN jsonb_build_object('id', _id, 'proxima_data', _data);
END $$;

-- Encerrar uma repetição pelo sistema: supervisor, compras ou gerência do posto.
CREATE OR REPLACE FUNCTION public.pedido_material_encerrar_recorrencia(_recorrencia_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.pedido_recorrencias; _uf text;
BEGIN
  SELECT * INTO _r FROM pedido_recorrencias WHERE id = _recorrencia_id;
  SELECT uf INTO _uf FROM postos WHERE id = _r.posto_id;
  IF _r.id IS NULL OR NOT public._pm_tem_papel(ARRAY['supervisor', 'compras', 'gerencia'], _uf, _r.posto_id) THEN
    RAISE EXCEPTION 'Repetição não encontrada.';
  END IF;
  IF NOT _r.ativa THEN RETURN; END IF;
  UPDATE pedido_recorrencias SET ativa = false, encerrada_em = now(),
    encerrada_por = (SELECT nome_completo FROM profiles WHERE id = public.current_profile_id())
  WHERE id = _r.id;
END $$;

-- Pedidos que esperam o usuário atual, com a etapa (sino e avisos na tela).
-- desde = quando o pedido entrou na etapa atual.
CREATE OR REPLACE FUNCTION public.pedidos_material_minhas_tarefas()
RETURNS TABLE (id uuid, codigo text, status text, posto text, uf text, itens integer, tem_epi boolean, desde timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.codigo, p.status, po.nome, p.uf,
    (SELECT count(*)::integer FROM pedidos_material_itens i WHERE i.pedido_id = p.id), p.tem_epi,
    coalesce((SELECT max(e.created_at) FROM pedido_eventos e WHERE e.pedido_id = p.id AND e.para_status = p.status), p.created_at)
  FROM pedidos_material p JOIN postos po ON po.id = p.posto_id
  WHERE cardinality(public._pm_responsaveis(p.status)) > 0
    AND EXISTS (SELECT 1 FROM pedido_aprovadores a
                WHERE a.user_id = public.current_profile_id() AND a.uf = p.uf
                  AND a.nivel = ANY (public._pm_responsaveis(p.status))
                  AND (a.postos = '{}' OR p.posto_id = ANY (a.postos)))
  ORDER BY 8 DESC
  LIMIT 200
$$;

-- Quantos pedidos esperam o usuário atual (aviso no menu).
CREATE OR REPLACE FUNCTION public.pedidos_material_minhas_pendencias()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM pedidos_material p
  WHERE cardinality(public._pm_responsaveis(p.status)) > 0
    AND EXISTS (SELECT 1 FROM pedido_aprovadores a
                WHERE a.user_id = public.current_profile_id() AND a.uf = p.uf
                  AND a.nivel = ANY (public._pm_responsaveis(p.status))
                  AND (a.postos = '{}' OR p.posto_id = ANY (a.postos)))
$$;

-- =========================================================
-- Permissões das funções
-- =========================================================
DO $$
DECLARE f text;
BEGIN
  -- Internas: só as funções acima chamam.
  FOREACH f IN ARRAY ARRAY[
    'public._pm_criar_pedido(public.postos, jsonb, text, date, uuid, uuid, text, text, text, text)',
    'public._pm_validar_itens(jsonb, public.postos)', 'public._pm_pedivel(uuid, public.postos)',
    'public._pm_posto_do_colaborador(public.colaboradores_senior)',
    'public._pm_pedidos_do_solicitante(uuid)', 'public._pm_identificar(integer, text)',
    'public._pm_enviar(integer, text, text, uuid, jsonb, text, text)',
    'public._pm_reenviar(integer, text, uuid, jsonb, text)',
    'public._pm_cancelar(integer, text, uuid, uuid)',
    'public._pm_recalcular(uuid)', 'public._pm_evento(uuid, text, text, text, text, jsonb, text)',
    'public._pm_pegar(uuid, text[], text[])'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.pedido_material_conferir(uuid, boolean, text, jsonb)',
    'public.pedido_material_atender(uuid, text, jsonb)',
    'public.pedido_material_cancelar_interno(uuid, text)',
    'public.pedidos_material_minhas_pendencias()', 'public.pedidos_material_minhas_tarefas()',
    'public.pedido_material_repetir(uuid, text, date)', 'public.pedido_material_encerrar_recorrencia(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pedido_material_identificar(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_enviar(integer, text, text, uuid, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_reenviar(integer, text, uuid, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_cancelar(integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_pedidos_recorrentes() TO anon, authenticated;

-- Admin passa direto em has_permission; os demais recebem o módulo pela tela de usuários.
NOTIFY pgrst, 'reload schema';
