
-- Permitir criar fichas mesmo sem estoque suficiente (apenas avisa, não bloqueia)
DROP TRIGGER IF EXISTS trg_validar_estoque_item ON public.fichas_epi_itens;

-- Sincronizar estoque_atual do EPI com a soma dos tamanhos
CREATE OR REPLACE FUNCTION public.sync_epi_estoque_atual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _epi_id uuid;
BEGIN
  _epi_id := COALESCE(NEW.epi_id, OLD.epi_id);
  UPDATE public.epis
     SET estoque_atual = COALESCE((SELECT SUM(estoque) FROM public.epi_tamanhos WHERE epi_id = _epi_id), 0)
   WHERE id = _epi_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_epi_estoque_atual ON public.epi_tamanhos;
CREATE TRIGGER trg_sync_epi_estoque_atual
AFTER INSERT OR UPDATE OR DELETE ON public.epi_tamanhos
FOR EACH ROW EXECUTE FUNCTION public.sync_epi_estoque_atual();

-- Recalcular estoque atual baseado nos tamanhos existentes
UPDATE public.epis e
   SET estoque_atual = COALESCE((SELECT SUM(estoque) FROM public.epi_tamanhos t WHERE t.epi_id = e.id), 0);
