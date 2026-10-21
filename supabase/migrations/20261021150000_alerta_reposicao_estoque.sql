-- Pedido de reposição por e-mail: cada item tem um estoque mínimo POR ESTADO
-- (tela Estoque). Quando o saldo do item no estado cai até o mínimo, o banco
-- registra um alerta em alertas_estoque; o agendador da VM (a cada 15 min)
-- chama enviar-relatorio-estoque { modo: 'reposicao' }, que manda um e-mail
-- pedindo a reposição para os destinatários do relatório de estoque.
-- Re-executável.

-- ---------- Mínimo por item e estado ----------
CREATE TABLE IF NOT EXISTS public.estoque_minimos (
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  uf text NOT NULL REFERENCES public.estados(uf),
  minimo integer NOT NULL CHECK (minimo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (epi_id, uf)
);
DROP TRIGGER IF EXISTS trg_estoque_minimos_updated ON public.estoque_minimos;
CREATE TRIGGER trg_estoque_minimos_updated BEFORE UPDATE ON public.estoque_minimos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estoque_minimos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.estoque_minimos FROM anon;
DROP POLICY IF EXISTS "estoque_minimos select" ON public.estoque_minimos;
CREATE POLICY "estoque_minimos select" ON public.estoque_minimos FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view') AND public.pode_acessar_uf(uf));
DROP POLICY IF EXISTS "estoque_minimos modify" ON public.estoque_minimos;
CREATE POLICY "estoque_minimos modify" ON public.estoque_minimos FOR ALL TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'estoque', 'edit') AND public.pode_acessar_uf(uf));

-- Mínimo do item no estado; sem valor definido no estado, vale o mínimo geral do item.
CREATE OR REPLACE FUNCTION public.minimo_estoque(_epi_id uuid, _uf text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT minimo FROM estoque_minimos WHERE epi_id = _epi_id AND uf = _uf),
    (SELECT estoque_minimo FROM epis WHERE id = _epi_id),
    0);
$$;

-- ---------- Alertas (fila do e-mail) ----------
CREATE TABLE IF NOT EXISTS public.alertas_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  uf text NOT NULL REFERENCES public.estados(uf),
  saldo integer NOT NULL,
  minimo integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz
);
-- Um alerta pendente por item e estado: não repete enquanto não for enviado.
CREATE UNIQUE INDEX IF NOT EXISTS alertas_estoque_pendente ON public.alertas_estoque (epi_id, uf) WHERE enviado_em IS NULL;

ALTER TABLE public.alertas_estoque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alertas_estoque FROM anon;
DROP POLICY IF EXISTS "alertas_estoque select" ON public.alertas_estoque;
CREATE POLICY "alertas_estoque select" ON public.alertas_estoque FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'estoque', 'view') AND public.pode_acessar_uf(uf));

-- Alerta só quando o saldo CRUZA o mínimo (estava acima e chegou nele ou abaixo).
-- Depois de enviado, só volta a alertar se o estoque for reposto e cair de novo.
CREATE OR REPLACE FUNCTION public.registrar_alerta_estoque(_epi_id uuid, _uf text, _antes integer, _depois integer, _minimo integer, _minimo_antes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _minimo <= 0 OR _depois > _minimo OR _antes <= _minimo_antes THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM epis WHERE id = _epi_id AND ativo) THEN RETURN; END IF;
  -- Desligado no cartão: não acumula alertas para mandar tudo de uma vez quando ligar.
  IF NOT COALESCE((SELECT alerta_reposicao FROM email_estoque_config WHERE id = 1), false) THEN RETURN; END IF;
  INSERT INTO alertas_estoque (epi_id, uf, saldo, minimo) VALUES (_epi_id, _uf, _depois, _minimo)
  ON CONFLICT (epi_id, uf) WHERE enviado_em IS NULL DO UPDATE SET saldo = EXCLUDED.saldo, minimo = EXCLUDED.minimo;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_alerta_estoque(uuid, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- Toda baixa/ajuste de estoque passa por epi_tamanhos (fichas, ajustes, transferências, reset).
CREATE OR REPLACE FUNCTION public.alerta_estoque_tamanho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _epi uuid := COALESCE(NEW.epi_id, OLD.epi_id);
  _uf text := COALESCE(NEW.uf, OLD.uf);
  _depois integer;
  _antes integer;
  _min integer;
BEGIN
  IF _uf IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(estoque), 0) INTO _depois FROM epi_tamanhos WHERE epi_id = _epi AND uf = _uf;
  _antes := _depois
    - (CASE WHEN TG_OP <> 'DELETE' AND NEW.epi_id = _epi AND NEW.uf = _uf THEN NEW.estoque ELSE 0 END)
    + (CASE WHEN TG_OP <> 'INSERT' AND OLD.epi_id = _epi AND OLD.uf = _uf THEN OLD.estoque ELSE 0 END);
  _min := public.minimo_estoque(_epi, _uf);
  PERFORM public.registrar_alerta_estoque(_epi, _uf, _antes, _depois, _min, _min);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_alerta_estoque_tamanho ON public.epi_tamanhos;
CREATE TRIGGER trg_alerta_estoque_tamanho AFTER INSERT OR DELETE OR UPDATE OF estoque ON public.epi_tamanhos
  FOR EACH ROW EXECUTE FUNCTION public.alerta_estoque_tamanho();

-- Subir o mínimo acima do saldo atual também pede reposição.
CREATE OR REPLACE FUNCTION public.alerta_estoque_minimo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _saldo integer;
  _min_antes integer;
BEGIN
  SELECT COALESCE(SUM(estoque), 0) INTO _saldo FROM epi_tamanhos WHERE epi_id = NEW.epi_id AND uf = NEW.uf;
  _min_antes := CASE WHEN TG_OP = 'UPDATE' THEN OLD.minimo
    ELSE COALESCE((SELECT estoque_minimo FROM epis WHERE id = NEW.epi_id), 0) END;
  PERFORM public.registrar_alerta_estoque(NEW.epi_id, NEW.uf, _saldo, _saldo, NEW.minimo, _min_antes);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_alerta_estoque_minimo ON public.estoque_minimos;
CREATE TRIGGER trg_alerta_estoque_minimo AFTER INSERT OR UPDATE OF minimo ON public.estoque_minimos
  FOR EACH ROW EXECUTE FUNCTION public.alerta_estoque_minimo();

-- No localhost quem envia é o próprio PC: depois do envio, a tela marca os alertas.
CREATE OR REPLACE FUNCTION public.marcar_alertas_estoque_enviados(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  IF NOT public.has_permission(public.current_profile_id(), 'estoque', 'view') THEN
    RAISE EXCEPTION 'Sem permissão para ver o estoque';
  END IF;
  UPDATE alertas_estoque SET enviado_em = now()
  WHERE id = ANY(_ids) AND enviado_em IS NULL AND public.pode_acessar_uf(uf);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_alertas_estoque_enviados(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_alertas_estoque_enviados(uuid[]) TO authenticated;

-- ---------- Liga/desliga no cartão do relatório de estoque ----------
ALTER TABLE public.email_estoque_config ADD COLUMN IF NOT EXISTS alerta_reposicao boolean NOT NULL DEFAULT false;
