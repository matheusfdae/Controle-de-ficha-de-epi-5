-- =========================================================
-- Pedido de material dos postos (pedido do Matheus em 29/10/2026).
--
-- * O líder do posto pede pelo link público, igual à solicitação de crachá:
--   ele se identifica com a matrícula OU o CPF (colaborador ativo na Senior),
--   escolhe o posto e os materiais. O pedido pode ser único ou recorrente
--   (diário, semanal, quinzenal, mensal); cada repetição vira um pedido novo
--   que passa pela aprovação de novo.
-- * Alçada por valor: supervisor -> gerente -> diretor -> compras. Cada nível
--   entra quando o total passa do "valor acima de" dele (NULL = sempre).
--   Pedido acima do teto do posto exige justificativa e sempre passa pelo
--   diretor.
-- * Teto mensal por posto (posto_tetos, com vigência). O gasto do mês é a
--   soma dos pedidos aprovados no mês (data da aprovação final): valor real
--   da compra quando já houver, senão o estimado.
-- * Compra por pedido: compras registra a nota (fornecedor, NF, preço de cada
--   item). Os preços das notas alimentam o relatório de variação de preço
--   (vw_material_precos: mesma compra x compra anterior do mesmo item no
--   mesmo fornecedor).
--
-- Escrita só pelas funções (SECURITY DEFINER); as tabelas só têm SELECT por
-- RLS, exceto o cadastro (materiais, tetos, alçadas, aprovadores), que quem
-- tem pedidos_material/edit mexe direto. Re-executável.
-- =========================================================

-- ---------- Datas no fuso de Brasília ----------
CREATE OR REPLACE FUNCTION public._pm_hoje()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- ---------- Catálogo de materiais ----------
CREATE TABLE IF NOT EXISTS public.materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (trim(nome) <> ''),
  nome_chave text GENERATED ALWAYS AS (lower(regexp_replace(trim(nome), '\s+', ' ', 'g'))) STORED,
  unidade text NOT NULL DEFAULT 'un' CHECK (trim(unidade) <> ''),
  categoria text,
  -- Preço usado na estimativa enquanto o item não tem nenhuma compra registrada.
  preco_referencia numeric(14, 4) CHECK (preco_referencia >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materiais_nome_chave_key UNIQUE (nome_chave)
);

DROP TRIGGER IF EXISTS trg_materiais_updated ON public.materiais;
CREATE TRIGGER trg_materiais_updated BEFORE UPDATE ON public.materiais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Teto de gastos por posto (vale do mês informado em diante) ----------
CREATE TABLE IF NOT EXISTS public.posto_tetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  vigente_desde date NOT NULL CHECK (extract(day FROM vigente_desde) = 1),
  valor numeric(14, 2) NOT NULL CHECK (valor >= 0),
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posto_tetos_mes_key UNIQUE (posto_id, vigente_desde)
);

-- ---------- Alçada por valor ----------
CREATE TABLE IF NOT EXISTS public.pedido_alcadas (
  nivel text PRIMARY KEY CHECK (nivel IN ('supervisor', 'gerente', 'diretor', 'compras')),
  ordem integer NOT NULL UNIQUE,
  -- O nível entra quando o total do pedido passa deste valor. NULL = sempre.
  valor_acima_de numeric(14, 2) CHECK (valor_acima_de >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pedido_alcadas (nivel, ordem, valor_acima_de) VALUES
  ('supervisor', 1, NULL),
  ('gerente', 2, 1000),
  ('diretor', 3, 5000),
  ('compras', 4, NULL)
ON CONFLICT (nivel) DO NOTHING;

DROP TRIGGER IF EXISTS trg_pedido_alcadas_updated ON public.pedido_alcadas;
CREATE TRIGGER trg_pedido_alcadas_updated BEFORE UPDATE ON public.pedido_alcadas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Avisos por e-mail (uma linha só) ----------
CREATE TABLE IF NOT EXISTS public.pedido_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  avisar_email boolean NOT NULL DEFAULT true,
  -- Endereço do sistema para o botão do e-mail (ex.: https://epi.empresa.com.br).
  link_sistema text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pedido_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_pedido_config_updated ON public.pedido_config;
CREATE TRIGGER trg_pedido_config_updated BEFORE UPDATE ON public.pedido_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Quem aprova cada nível (por estado; postos vazio = todos do estado) ----------
CREATE TABLE IF NOT EXISTS public.pedido_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nivel text NOT NULL REFERENCES public.pedido_alcadas(nivel),
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

-- ---------- Pedido ----------
CREATE TABLE IF NOT EXISTS public.pedidos_material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  posto_id uuid NOT NULL REFERENCES public.postos(id),
  uf text NOT NULL REFERENCES public.estados(uf),
  recorrencia_id uuid REFERENCES public.pedido_recorrencias(id) ON DELETE SET NULL,
  data_pedido date NOT NULL DEFAULT public._pm_hoje(),
  status text NOT NULL DEFAULT 'em_aprovacao'
    CHECK (status IN ('em_aprovacao', 'aprovado', 'comprado', 'reprovado', 'cancelado')),
  -- Nível que precisa decidir agora (NULL fora de em_aprovacao).
  nivel_atual text REFERENCES public.pedido_alcadas(nivel),
  -- Caminho da aprovação: níveis já aprovados + os que faltam.
  niveis text[] NOT NULL DEFAULT '{}',
  valor_estimado numeric(14, 2) NOT NULL DEFAULT 0,
  valor_real numeric(14, 2),
  acima_do_teto boolean NOT NULL DEFAULT false,
  -- Algum item sem preço (nem compra anterior, nem preço de referência).
  sem_preco boolean NOT NULL DEFAULT false,
  -- Último nível que já recebeu o aviso por e-mail (função avisar-pedidos-material).
  notificado_nivel text,
  data_aprovacao date,
  aprovado_em timestamptz,
  observacao text,
  solicitante_senior_id uuid REFERENCES public.colaboradores_senior(id) ON DELETE SET NULL,
  solicitante_nome text NOT NULL,
  solicitante_matricula text,
  solicitante_cargo text,
  solicitante_telefone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Uma recorrência gera no máximo um pedido por data.
  CONSTRAINT pedidos_material_recorrencia_data_key UNIQUE (recorrencia_id, data_pedido)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_posto ON public.pedidos_material (posto_id, data_aprovacao);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_status ON public.pedidos_material (status, nivel_atual);
CREATE INDEX IF NOT EXISTS idx_pedidos_material_solicitante ON public.pedidos_material (solicitante_senior_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_pedidos_material_updated ON public.pedidos_material;
CREATE TRIGGER trg_pedidos_material_updated BEFORE UPDATE ON public.pedidos_material
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pedidos_material_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  quantidade numeric(12, 2) NOT NULL CHECK (quantidade > 0),
  -- Quanto o líder pediu (a aprovação pode reduzir `quantidade`).
  quantidade_pedida numeric(12, 2) NOT NULL CHECK (quantidade_pedida > 0),
  preco_estimado numeric(14, 4),
  CONSTRAINT pedidos_material_itens_material_key UNIQUE (pedido_id, material_id)
);

CREATE TABLE IF NOT EXISTS public.pedido_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_material(id) ON DELETE CASCADE,
  nivel text NOT NULL,
  decisao text NOT NULL CHECK (decisao IN ('aprovado', 'reprovado')),
  comentario text,
  valor_no_momento numeric(14, 2),
  saldo_teto_no_momento numeric(14, 2),
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  usuario_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedido_aprovacoes_pedido ON public.pedido_aprovacoes (pedido_id, created_at);

-- ---------- Compra (nota) ----------
CREATE TABLE IF NOT EXISTS public.material_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = compra avulsa (só para registrar preço).
  pedido_id uuid REFERENCES public.pedidos_material(id) ON DELETE SET NULL,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome text NOT NULL CHECK (trim(fornecedor_nome) <> ''),
  fornecedor_cnpj text,
  numero_nf text,
  -- Chave de 44 dígitos quando a nota veio do XML.
  chave_acesso text CHECK (chave_acesso ~ '^\d{44}$'),
  data_compra date NOT NULL,
  observacao text,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_material_compras_pedido ON public.material_compras (pedido_id);
-- A mesma nota não entra duas vezes no mesmo pedido (nem duas vezes como avulsa).
CREATE UNIQUE INDEX IF NOT EXISTS idx_material_compras_chave
  ON public.material_compras (chave_acesso, coalesce(pedido_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE chave_acesso IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.material_compras_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.material_compras(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materiais(id),
  -- Na unidade do material (já convertida pelo fator da embalagem).
  quantidade numeric(12, 2) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(14, 4) NOT NULL CHECK (valor_unitario >= 0),
  -- Como veio na nota (XML): código, descrição, unidade e quantas unidades
  -- do material vêm em 1 unidade da nota (ex.: 1 CX = 12 un).
  codigo_fornecedor text,
  descricao_nf text,
  unidade_nf text,
  fator numeric(12, 4) NOT NULL DEFAULT 1 CHECK (fator > 0)
);
CREATE INDEX IF NOT EXISTS idx_material_compras_itens_material ON public.material_compras_itens (material_id);

-- "Memória" da importação: código do produto no fornecedor -> material e
-- fator da embalagem. Aprendida a cada compra; a próxima nota do mesmo
-- fornecedor vem pré-preenchida.
CREATE TABLE IF NOT EXISTS public.material_codigos_fornecedor (
  fornecedor_cnpj text NOT NULL,
  codigo_fornecedor text NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  fator numeric(12, 4) NOT NULL DEFAULT 1 CHECK (fator > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fornecedor_cnpj, codigo_fornecedor)
);

-- =========================================================
-- Regras de cálculo
-- =========================================================

-- Teto do posto no mês: a última definição com vigência até o mês.
CREATE OR REPLACE FUNCTION public.teto_do_posto(_posto_id uuid, _mes date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT valor FROM posto_tetos
  WHERE posto_id = _posto_id AND vigente_desde <= date_trunc('month', _mes)::date
  ORDER BY vigente_desde DESC LIMIT 1
$$;

-- Gasto do posto no mês: pedidos aprovados no mês (real quando houver compra).
CREATE OR REPLACE FUNCTION public.gasto_do_posto(_posto_id uuid, _mes date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(coalesce(valor_real, valor_estimado)), 0) FROM pedidos_material
  WHERE posto_id = _posto_id AND status IN ('aprovado', 'comprado')
    AND data_aprovacao >= date_trunc('month', _mes)::date
    AND data_aprovacao < (date_trunc('month', _mes) + interval '1 month')::date
$$;

-- Preço para estimar: última compra do material; senão o preço de referência.
CREATE OR REPLACE FUNCTION public._pm_preco(_material_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT ci.valor_unitario FROM material_compras_itens ci JOIN material_compras c ON c.id = ci.compra_id
     WHERE ci.material_id = _material_id ORDER BY c.data_compra DESC, c.created_at DESC LIMIT 1),
    (SELECT preco_referencia FROM materiais WHERE id = _material_id))
$$;

-- Níveis que o pedido precisa (em ordem). Acima do teto, o diretor sempre entra.
CREATE OR REPLACE FUNCTION public._pm_niveis(_total numeric, _acima boolean)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(nivel ORDER BY ordem), '{}') FROM pedido_alcadas
  WHERE valor_acima_de IS NULL OR _total > valor_acima_de OR (_acima AND nivel = 'diretor')
$$;

-- O usuário atual aprova esse nível nesse posto?
CREATE OR REPLACE FUNCTION public._pm_e_aprovador(_nivel text, _uf text, _posto_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pedido_aprovadores
    WHERE user_id = public.current_profile_id() AND uf = _uf
      AND (_nivel IS NULL OR nivel = _nivel)
      AND (postos = '{}' OR _posto_id = ANY (postos)))
$$;

CREATE OR REPLACE FUNCTION public._pm_aprovador_algum()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pedido_aprovadores WHERE user_id = public.current_profile_id())
$$;

-- Quem pode ver o pedido: módulo + estado, ou aprovador daquele posto.
CREATE OR REPLACE FUNCTION public._pm_ve(_uf text, _posto_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') AND public.pode_acessar_uf(_uf))
      OR public._pm_e_aprovador(NULL, _uf, _posto_id)
$$;

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posto_tetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_alcadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_aprovadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_material_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_compras_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_codigos_fornecedor ENABLE ROW LEVEL SECURITY;

-- Quem enxerga o módulo (ou aprova algo) lê o catálogo e a alçada.
DROP POLICY IF EXISTS "materiais select" ON public.materiais;
CREATE POLICY "materiais select" ON public.materiais FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') OR public._pm_aprovador_algum());
DROP POLICY IF EXISTS "materiais escrita" ON public.materiais;
CREATE POLICY "materiais escrita" ON public.materiais FOR ALL TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'));

DROP POLICY IF EXISTS "pedido_alcadas select" ON public.pedido_alcadas;
CREATE POLICY "pedido_alcadas select" ON public.pedido_alcadas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pedido_alcadas update" ON public.pedido_alcadas;
CREATE POLICY "pedido_alcadas update" ON public.pedido_alcadas FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'));

DROP POLICY IF EXISTS "pedido_config select" ON public.pedido_config;
CREATE POLICY "pedido_config select" ON public.pedido_config FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view'));
DROP POLICY IF EXISTS "pedido_config update" ON public.pedido_config;
CREATE POLICY "pedido_config update" ON public.pedido_config FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit'));

-- Tetos: lê quem vê pedidos do estado; mexe quem edita o módulo e acessa o estado.
DROP POLICY IF EXISTS "posto_tetos select" ON public.posto_tetos;
CREATE POLICY "posto_tetos select" ON public.posto_tetos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public._pm_ve(p.uf, p.id)));
DROP POLICY IF EXISTS "posto_tetos escrita" ON public.posto_tetos;
CREATE POLICY "posto_tetos escrita" ON public.posto_tetos FOR ALL TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit')
         AND EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public.pode_acessar_uf(p.uf)))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'pedidos_material', 'edit')
         AND EXISTS (SELECT 1 FROM public.postos p WHERE p.id = posto_id AND public.pode_acessar_uf(p.uf)));

-- Aprovadores: cada um vê as próprias linhas; quem edita o módulo vê e mexe em todas.
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
DROP POLICY IF EXISTS "pedido_aprovacoes select" ON public.pedido_aprovacoes;
CREATE POLICY "pedido_aprovacoes select" ON public.pedido_aprovacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND public._pm_ve(p.uf, p.posto_id)));

-- Compras: do pedido visível, ou avulsas para quem vê o módulo.
DROP POLICY IF EXISTS "material_compras select" ON public.material_compras;
CREATE POLICY "material_compras select" ON public.material_compras FOR SELECT TO authenticated
  USING (CASE WHEN pedido_id IS NULL
    THEN public.has_permission(public.current_profile_id(), 'pedidos_material', 'view')
    ELSE EXISTS (SELECT 1 FROM public.pedidos_material p WHERE p.id = pedido_id AND public._pm_ve(p.uf, p.posto_id)) END);
DROP POLICY IF EXISTS "material_compras_itens select" ON public.material_compras_itens;
CREATE POLICY "material_compras_itens select" ON public.material_compras_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.material_compras c WHERE c.id = compra_id));
-- Memória do XML: lê quem registra compra (compras ou permissão de criar). Escrita só pela função.
DROP POLICY IF EXISTS "material_codigos_fornecedor select" ON public.material_codigos_fornecedor;
CREATE POLICY "material_codigos_fornecedor select" ON public.material_codigos_fornecedor FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'create') OR public._pm_aprovador_algum());

-- =========================================================
-- Criar pedido (interna: usada pelo link público e pela recorrência)
-- _itens = [{material_id, quantidade}]
-- =========================================================
CREATE OR REPLACE FUNCTION public._pm_criar_pedido(
  _posto public.postos, _itens jsonb, _observacao text, _data date, _recorrencia_id uuid,
  _sol_id uuid, _sol_nome text, _sol_matricula text, _sol_cargo text, _sol_telefone text)
RETURNS public.pedidos_material
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.pedidos_material;
  _total numeric := 0;
  _sem_preco boolean := false;
  _teto numeric := public.teto_do_posto(_posto.id, _data);
  _acima boolean;
  _niveis text[];
  _i record;
BEGIN
  -- Soma os itens (mesmo material repetido vira uma linha só).
  FOR _i IN
    SELECT (e ->> 'material_id')::uuid AS material_id, sum((e ->> 'quantidade')::numeric) AS quantidade
    FROM jsonb_array_elements(_itens) e GROUP BY 1
  LOOP
    IF public._pm_preco(_i.material_id) IS NULL THEN _sem_preco := true; END IF;
    _total := _total + _i.quantidade * coalesce(public._pm_preco(_i.material_id), 0);
  END LOOP;
  _total := round(_total, 2);
  _acima := _teto IS NOT NULL AND public.gasto_do_posto(_posto.id, _data) + _total > _teto;
  _niveis := public._pm_niveis(_total, _acima);
  IF cardinality(_niveis) = 0 THEN
    RAISE EXCEPTION 'A alçada de aprovação não está configurada.';
  END IF;

  INSERT INTO pedidos_material (posto_id, uf, recorrencia_id, data_pedido, nivel_atual, niveis,
    valor_estimado, acima_do_teto, sem_preco, observacao,
    solicitante_senior_id, solicitante_nome, solicitante_matricula, solicitante_cargo, solicitante_telefone)
  VALUES (_posto.id, _posto.uf, _recorrencia_id, _data, _niveis[1], _niveis,
    _total, _acima, _sem_preco, nullif(left(trim(coalesce(_observacao, '')), 1000), ''),
    _sol_id, _sol_nome, _sol_matricula, _sol_cargo, _sol_telefone)
  RETURNING * INTO _p;

  INSERT INTO pedidos_material_itens (pedido_id, material_id, quantidade, quantidade_pedida, preco_estimado)
  SELECT _p.id, (e ->> 'material_id')::uuid, sum((e ->> 'quantidade')::numeric), sum((e ->> 'quantidade')::numeric),
         public._pm_preco((e ->> 'material_id')::uuid)
  FROM jsonb_array_elements(_itens) e GROUP BY 1, 2;

  RETURN _p;
END $$;

-- Confere a lista de itens vinda do link: 1 a 50 materiais ativos, quantidades válidas.
CREATE OR REPLACE FUNCTION public._pm_validar_itens(_itens jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _e jsonb; _q numeric;
BEGIN
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um material.';
  END IF;
  IF jsonb_array_length(_itens) > 50 THEN
    RAISE EXCEPTION 'No máximo 50 materiais por pedido.';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    IF NOT EXISTS (SELECT 1 FROM materiais WHERE ativo AND id::text = _e ->> 'material_id') THEN
      RAISE EXCEPTION 'Material não encontrado ou fora do catálogo. Atualize a página.';
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
-- Recorrências: gera os pedidos que venceram até hoje. Pode ser chamada a
-- qualquer hora (as telas chamam ao abrir): só cria o que falta.
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
    -- Só materiais que continuam no catálogo.
    SELECT coalesce(jsonb_agg(e), '[]') INTO _itens FROM jsonb_array_elements(_r.itens) e
    WHERE EXISTS (SELECT 1 FROM materiais m WHERE m.ativo AND m.id::text = e ->> 'material_id');
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

-- Pedidos do solicitante (os 50 últimos), com itens e andamento. Sem valores.
CREATE OR REPLACE FUNCTION public._pm_pedidos_do_solicitante(_sol_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.criado_em DESC), '[]') FROM (
    SELECT p.id, p.numero, p.status, p.nivel_atual, p.data_pedido, p.created_at AS criado_em,
      p.recorrencia_id IS NOT NULL AS recorrente, po.nome AS posto, p.observacao,
      (SELECT jsonb_agg(jsonb_build_object('nome', m.nome, 'unidade', m.unidade,
          'quantidade', i.quantidade, 'quantidade_pedida', i.quantidade_pedida) ORDER BY m.nome)
       FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id) AS itens,
      (SELECT jsonb_agg(jsonb_build_object('nivel', a.nivel, 'decisao', a.decisao, 'em', a.created_at,
          'comentario', CASE WHEN a.decisao = 'reprovado' THEN a.comentario END) ORDER BY a.created_at)
       FROM pedido_aprovacoes a WHERE a.pedido_id = p.id) AS andamento
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
    'postos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'uf', uf) ORDER BY nome), '[]')
               FROM postos WHERE ativo AND (_s.uf IS NULL OR uf = _s.uf)),
    'materiais', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'unidade', unidade,
                    'categoria', categoria) ORDER BY categoria NULLS LAST, nome), '[]')
                  FROM materiais WHERE ativo),
    'pedidos', public._pm_pedidos_do_solicitante(_s.id),
    'recorrencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'frequencia', r.frequencia,
                       'proxima_data', r.proxima_data, 'posto', po.nome,
                       'itens', (SELECT jsonb_agg(jsonb_build_object('nome', m.nome, 'unidade', m.unidade,
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
  PERFORM public._pm_validar_itens(_itens);
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
  RETURN jsonb_build_object('ok', true, 'numero', _p.numero, 'recorrente', _rec IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public._pm_cancelar(_matricula integer, _cpf text, _pedido_id uuid, _recorrencia_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
BEGIN
  IF _pedido_id IS NOT NULL THEN
    UPDATE pedidos_material SET status = 'cancelado', nivel_atual = NULL
    WHERE id = _pedido_id AND solicitante_senior_id = _s.id AND status = 'em_aprovacao';
    IF NOT FOUND THEN RAISE EXCEPTION 'Esse pedido não pode mais ser cancelado.'; END IF;
  END IF;
  IF _recorrencia_id IS NOT NULL THEN
    UPDATE pedido_recorrencias SET ativa = false, encerrada_em = now()
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

CREATE OR REPLACE FUNCTION public.pedido_material_cancelar(
  _matricula integer, _cpf text, _pedido_id uuid DEFAULT NULL, _recorrencia_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public._pm_cancelar(_matricula, _cpf, _pedido_id, _recorrencia_id);
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

-- =========================================================
-- Aprovação (usuário logado)
-- _quantidades = [{item_id, quantidade}] só para reduzir (0 tira o item).
-- =========================================================
CREATE OR REPLACE FUNCTION public.pedido_material_decidir(
  _pedido_id uuid, _aprovar boolean, _comentario text DEFAULT NULL, _quantidades jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public.current_profile_id();
  _p public.pedidos_material;
  _coment text := nullif(left(trim(coalesce(_comentario, '')), 1000), '');
  _hoje date := public._pm_hoje();
  _teto numeric;
  _gasto numeric;
  _total numeric;
  _acima boolean;
  _ordem integer;
  _feitos text[];
  _faltam text[];
  _e jsonb;
  _q numeric;
  _ajustes text := '';
  _nome_mat text;
  _antes numeric;
BEGIN
  SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF _p.status <> 'em_aprovacao' THEN RAISE EXCEPTION 'Este pedido não está mais em aprovação.'; END IF;
  IF NOT (public._pm_e_aprovador(_p.nivel_atual, _p.uf, _p.posto_id)
          OR public.has_role(_uid, 'admin')) THEN
    RAISE EXCEPTION 'Você não é aprovador do nível % deste posto.', _p.nivel_atual;
  END IF;

  _teto := public.teto_do_posto(_p.posto_id, _hoje);
  _gasto := public.gasto_do_posto(_p.posto_id, _hoje);

  IF NOT _aprovar THEN
    IF _coment IS NULL THEN RAISE EXCEPTION 'Escreva o motivo da reprovação.'; END IF;
    INSERT INTO pedido_aprovacoes (pedido_id, nivel, decisao, comentario, valor_no_momento, saldo_teto_no_momento, usuario_id, usuario_nome)
    VALUES (_p.id, _p.nivel_atual, 'reprovado', _coment, _p.valor_estimado, _teto - _gasto, _uid,
            (SELECT nome_completo FROM profiles WHERE id = _uid));
    UPDATE pedidos_material SET status = 'reprovado', nivel_atual = NULL WHERE id = _p.id;
    RETURN jsonb_build_object('status', 'reprovado');
  END IF;

  -- Ajuste de quantidades (só para menos).
  IF _quantidades IS NOT NULL AND jsonb_typeof(_quantidades) = 'array' THEN
    FOR _e IN SELECT * FROM jsonb_array_elements(_quantidades) LOOP
      _q := (_e ->> 'quantidade')::numeric;
      SELECT i.quantidade, m.nome INTO _antes, _nome_mat FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id
      WHERE i.id::text = _e ->> 'item_id' AND i.pedido_id = _p.id;
      IF _antes IS NULL THEN RAISE EXCEPTION 'Item não pertence ao pedido.'; END IF;
      IF _q IS NULL OR _q < 0 OR _q > _antes THEN
        RAISE EXCEPTION 'Na aprovação a quantidade de % só pode diminuir.', _nome_mat;
      END IF;
      IF _q = _antes THEN CONTINUE; END IF;
      IF _q = 0 THEN
        DELETE FROM pedidos_material_itens WHERE id::text = _e ->> 'item_id';
      ELSE
        UPDATE pedidos_material_itens SET quantidade = _q WHERE id::text = _e ->> 'item_id';
      END IF;
      _ajustes := _ajustes || format('%s: %s → %s; ', _nome_mat, trim_scale(_antes), trim_scale(_q));
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pedidos_material_itens WHERE pedido_id = _p.id) THEN
      RAISE EXCEPTION 'O pedido ficaria sem itens. Para não atender, reprove.';
    END IF;
  END IF;

  SELECT round(coalesce(sum(quantidade * coalesce(preco_estimado, 0)), 0), 2) INTO _total
  FROM pedidos_material_itens WHERE pedido_id = _p.id;
  _acima := _teto IS NOT NULL AND _gasto + _total > _teto;
  IF _acima AND _coment IS NULL THEN
    RAISE EXCEPTION 'Pedido acima do teto do posto: escreva a justificativa para aprovar.';
  END IF;

  INSERT INTO pedido_aprovacoes (pedido_id, nivel, decisao, comentario, valor_no_momento, saldo_teto_no_momento, usuario_id, usuario_nome)
  VALUES (_p.id, _p.nivel_atual, 'aprovado',
          nullif(concat_ws(' ', _coment, CASE WHEN _ajustes <> '' THEN '[Quantidades ajustadas: ' || rtrim(_ajustes, '; ') || ']' END), ''),
          _total, _teto - _gasto, _uid, (SELECT nome_completo FROM profiles WHERE id = _uid));

  -- Recalcula o caminho: o que já foi aprovado fica; depois do nível atual,
  -- entram os níveis exigidos pelo valor/teto de agora.
  SELECT ordem INTO _ordem FROM pedido_alcadas WHERE nivel = _p.nivel_atual;
  SELECT coalesce(array_agg(n ORDER BY a.ordem), '{}') INTO _feitos
  FROM unnest(_p.niveis) n JOIN pedido_alcadas a ON a.nivel = n WHERE a.ordem <= _ordem;
  SELECT coalesce(array_agg(n ORDER BY a.ordem), '{}') INTO _faltam
  FROM unnest(public._pm_niveis(_total, _acima)) n JOIN pedido_alcadas a ON a.nivel = n WHERE a.ordem > _ordem;

  UPDATE pedidos_material SET
    valor_estimado = _total,
    acima_do_teto = _acima,
    niveis = _feitos || _faltam,
    nivel_atual = _faltam[1],
    status = CASE WHEN cardinality(_faltam) = 0 THEN 'aprovado' ELSE 'em_aprovacao' END,
    data_aprovacao = CASE WHEN cardinality(_faltam) = 0 THEN _hoje END,
    aprovado_em = CASE WHEN cardinality(_faltam) = 0 THEN now() END
  WHERE id = _p.id;

  RETURN jsonb_build_object('status', CASE WHEN cardinality(_faltam) = 0 THEN 'aprovado' ELSE 'em_aprovacao' END,
                            'nivel_atual', _faltam[1]);
END $$;

-- Quantos pedidos esperam o usuário atual (para o aviso no menu).
CREATE OR REPLACE FUNCTION public.pedidos_material_minhas_pendencias()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM pedidos_material p
  WHERE p.status = 'em_aprovacao' AND public._pm_e_aprovador(p.nivel_atual, p.uf, p.posto_id)
$$;

-- =========================================================
-- Compra (nota) — do pedido aprovado ou avulsa (só para registrar preço)
-- _itens = [{material_id, quantidade, valor_unitario,
--            codigo_fornecedor?, descricao_nf?, unidade_nf?, fator?}]
-- quantidade e valor_unitario já na unidade do material.
-- =========================================================
-- Assinatura de uma versão anterior desta migration (sem CNPJ/chave).
DROP FUNCTION IF EXISTS public.material_compra_registrar(uuid, uuid, text, text, date, jsonb, text);
CREATE OR REPLACE FUNCTION public.material_compra_registrar(
  _pedido_id uuid, _fornecedor_id uuid, _fornecedor_nome text, _numero_nf text,
  _data_compra date, _itens jsonb, _observacao text DEFAULT NULL,
  _fornecedor_cnpj text DEFAULT NULL, _chave_acesso text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := public.current_profile_id();
  _p public.pedidos_material;
  _f public.fornecedores;
  _id uuid;
  _e jsonb;
  _cnpj text := nullif(regexp_replace(coalesce(_fornecedor_cnpj, ''), '\D', '', 'g'), '');
  _chave text := nullif(regexp_replace(coalesce(_chave_acesso, ''), '\D', '', 'g'), '');
BEGIN
  IF _pedido_id IS NOT NULL THEN
    SELECT * INTO _p FROM pedidos_material WHERE id = _pedido_id FOR UPDATE;
    IF _p.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
    IF NOT (public._pm_e_aprovador('compras', _p.uf, _p.posto_id)
            OR (public.has_permission(_uid, 'pedidos_material', 'create') AND public.pode_acessar_uf(_p.uf))) THEN
      RAISE EXCEPTION 'Sem permissão para registrar compra deste posto.';
    END IF;
    IF _p.status NOT IN ('aprovado', 'comprado') THEN
      RAISE EXCEPTION 'Só dá para registrar compra de pedido aprovado.';
    END IF;
  ELSIF NOT public.has_permission(_uid, 'pedidos_material', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para registrar compras.';
  END IF;

  IF _data_compra IS NULL OR _data_compra > public._pm_hoje() + 1 THEN
    RAISE EXCEPTION 'Data da compra inválida.';
  END IF;
  IF _cnpj IS NOT NULL AND _cnpj !~ '^\d{14}$' THEN RAISE EXCEPTION 'CNPJ do fornecedor inválido.'; END IF;
  IF _chave IS NOT NULL AND _chave !~ '^\d{44}$' THEN RAISE EXCEPTION 'Chave da NF-e inválida.'; END IF;
  IF _fornecedor_id IS NOT NULL THEN
    SELECT * INTO _f FROM fornecedores WHERE id = _fornecedor_id;
    IF _f.id IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado.'; END IF;
  ELSIF _cnpj IS NOT NULL THEN
    -- Fornecedor já cadastrado com esse CNPJ: usa o cadastro.
    SELECT * INTO _f FROM fornecedores WHERE cnpj = _cnpj;
  END IF;
  IF _f.id IS NULL AND nullif(trim(coalesce(_fornecedor_nome, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o fornecedor.';
  END IF;
  IF _chave IS NOT NULL AND EXISTS (SELECT 1 FROM material_compras WHERE chave_acesso = _chave
       AND pedido_id IS NOT DISTINCT FROM _pedido_id) THEN
    RAISE EXCEPTION 'Esta nota já foi registrada %.', CASE WHEN _pedido_id IS NULL THEN 'como compra avulsa' ELSE 'neste pedido' END;
  END IF;
  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' OR jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Informe os itens da nota.';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    IF NOT EXISTS (SELECT 1 FROM materiais WHERE id::text = _e ->> 'material_id') THEN
      RAISE EXCEPTION 'Material não encontrado.';
    END IF;
    IF coalesce((_e ->> 'quantidade')::numeric, 0) <= 0 OR (_e ->> 'valor_unitario')::numeric IS NULL
       OR (_e ->> 'valor_unitario')::numeric < 0 THEN
      RAISE EXCEPTION 'Quantidade e valor unitário de todos os itens são obrigatórios.';
    END IF;
    IF coalesce((_e ->> 'fator')::numeric, 1) <= 0 THEN
      RAISE EXCEPTION 'Fator da embalagem inválido.';
    END IF;
  END LOOP;

  _cnpj := coalesce(_f.cnpj, _cnpj);
  INSERT INTO material_compras (pedido_id, fornecedor_id, fornecedor_nome, fornecedor_cnpj, numero_nf, chave_acesso,
    data_compra, observacao, criado_por)
  VALUES (_pedido_id, _f.id, coalesce(_f.nome, trim(_fornecedor_nome)), _cnpj,
          nullif(trim(coalesce(_numero_nf, '')), ''), _chave, _data_compra, nullif(trim(coalesce(_observacao, '')), ''), _uid)
  RETURNING id INTO _id;
  INSERT INTO material_compras_itens (compra_id, material_id, quantidade, valor_unitario,
    codigo_fornecedor, descricao_nf, unidade_nf, fator)
  SELECT _id, (e ->> 'material_id')::uuid, (e ->> 'quantidade')::numeric, (e ->> 'valor_unitario')::numeric,
    nullif(trim(coalesce(e ->> 'codigo_fornecedor', '')), ''), nullif(left(trim(coalesce(e ->> 'descricao_nf', '')), 300), ''),
    nullif(trim(coalesce(e ->> 'unidade_nf', '')), ''), coalesce((e ->> 'fator')::numeric, 1)
  FROM jsonb_array_elements(_itens) e;

  -- Aprende código do fornecedor -> material (e a embalagem) para a próxima nota.
  IF _cnpj IS NOT NULL THEN
    INSERT INTO material_codigos_fornecedor (fornecedor_cnpj, codigo_fornecedor, material_id, fator)
    SELECT DISTINCT ON (trim(e ->> 'codigo_fornecedor')) _cnpj, trim(e ->> 'codigo_fornecedor'),
      (e ->> 'material_id')::uuid, coalesce((e ->> 'fator')::numeric, 1)
    FROM jsonb_array_elements(_itens) e
    WHERE nullif(trim(coalesce(e ->> 'codigo_fornecedor', '')), '') IS NOT NULL
    ON CONFLICT (fornecedor_cnpj, codigo_fornecedor)
      DO UPDATE SET material_id = EXCLUDED.material_id, fator = EXCLUDED.fator, updated_at = now();
  END IF;

  IF _pedido_id IS NOT NULL THEN
    UPDATE pedidos_material SET status = 'comprado',
      valor_real = (SELECT round(sum(ci.quantidade * ci.valor_unitario), 2)
                    FROM material_compras c JOIN material_compras_itens ci ON ci.compra_id = c.id
                    WHERE c.pedido_id = _pedido_id)
    WHERE id = _pedido_id;
  END IF;
  RETURN _id;
END $$;

-- =========================================================
-- Variação de preço: cada item comprado x a compra anterior do mesmo
-- material no mesmo fornecedor (CNPJ, senão o nome).
-- =========================================================
CREATE OR REPLACE VIEW public.vw_material_precos WITH (security_invoker = true) AS
SELECT ci.id, c.id AS compra_id, c.pedido_id, c.data_compra, c.numero_nf,
  c.fornecedor_id, c.fornecedor_nome, c.fornecedor_cnpj,
  ci.material_id, m.nome AS material_nome, m.unidade, m.categoria,
  ci.quantidade, ci.valor_unitario,
  lag(ci.valor_unitario) OVER w AS valor_anterior,
  lag(c.data_compra) OVER w AS data_anterior,
  lag(c.numero_nf) OVER w AS nf_anterior
FROM material_compras_itens ci
JOIN material_compras c ON c.id = ci.compra_id
JOIN materiais m ON m.id = ci.material_id
WINDOW w AS (PARTITION BY ci.material_id, coalesce(c.fornecedor_cnpj, upper(trim(c.fornecedor_nome)))
             ORDER BY c.data_compra, c.created_at, ci.id);

-- =========================================================
-- Permissões das funções
-- =========================================================
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._pm_criar_pedido(public.postos, jsonb, text, date, uuid, uuid, text, text, text, text)',
    'public._pm_validar_itens(jsonb)', 'public._pm_posto_do_colaborador(public.colaboradores_senior)',
    'public._pm_pedidos_do_solicitante(uuid)', 'public._pm_identificar(integer, text)',
    'public._pm_enviar(integer, text, text, uuid, jsonb, text, text)',
    'public._pm_cancelar(integer, text, uuid, uuid)', 'public._pm_preco(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pedido_material_identificar(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_enviar(integer, text, text, uuid, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_cancelar(integer, text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_pedidos_recorrentes() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.pedido_material_decidir(uuid, boolean, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_material_decidir(uuid, boolean, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.material_compra_registrar(uuid, uuid, text, text, date, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.material_compra_registrar(uuid, uuid, text, text, date, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedidos_material_minhas_pendencias() TO authenticated;
-- Teto e gasto saem por posto sem conferir acesso: só para uso interno.
REVOKE ALL ON FUNCTION public.teto_do_posto(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gasto_do_posto(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_material_precos TO authenticated;

-- Admin passa direto em has_permission; os demais recebem o módulo pela tela de usuários.
NOTIFY pgrst, 'reload schema';
