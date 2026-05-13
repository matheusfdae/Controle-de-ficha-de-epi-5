-- =====================================================
-- Estoque automático no salvar de itens de ficha
-- =====================================================

-- 1. Função: validar estoque antes de inserir item
CREATE OR REPLACE FUNCTION public.validar_estoque_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  estoque_disp integer;
  nome_epi text;
BEGIN
  IF NEW.epi_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se tem tamanho, valida estoque do tamanho
  IF NEW.tamanho IS NOT NULL AND NEW.tamanho <> '' THEN
    SELECT estoque INTO estoque_disp
      FROM public.epi_tamanhos
     WHERE epi_id = NEW.epi_id AND tamanho = NEW.tamanho;

    IF estoque_disp IS NULL THEN
      -- sem registro de tamanho, valida no geral
      SELECT estoque_atual, nome INTO estoque_disp, nome_epi
        FROM public.epis WHERE id = NEW.epi_id;
    END IF;
  ELSE
    SELECT estoque_atual, nome INTO estoque_disp, nome_epi
      FROM public.epis WHERE id = NEW.epi_id;
  END IF;

  IF nome_epi IS NULL THEN
    SELECT nome INTO nome_epi FROM public.epis WHERE id = NEW.epi_id;
  END IF;

  IF COALESCE(estoque_disp, 0) < COALESCE(NEW.quantidade, 1) THEN
    RAISE EXCEPTION 'Estoque insuficiente para "%" (disponível: %, solicitado: %)',
      COALESCE(nome_epi, NEW.descricao, 'item'),
      COALESCE(estoque_disp, 0),
      NEW.quantidade;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Função: aplicar baixa de estoque após insert
CREATE OR REPLACE FUNCTION public.aplicar_baixa_estoque_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.epi_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Desconta estoque por tamanho (se houver registro)
  IF NEW.tamanho IS NOT NULL AND NEW.tamanho <> '' THEN
    UPDATE public.epi_tamanhos
       SET estoque = GREATEST(estoque - COALESCE(NEW.quantidade, 1), 0)
     WHERE epi_id = NEW.epi_id AND tamanho = NEW.tamanho;
  END IF;

  -- Desconta estoque geral
  UPDATE public.epis
     SET estoque_atual = GREATEST(estoque_atual - COALESCE(NEW.quantidade, 1), 0)
   WHERE id = NEW.epi_id;

  -- Registra movimentação
  INSERT INTO public.movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo)
  VALUES ('epi', NEW.epi_id, 'saida', COALESCE(NEW.quantidade, 1), 'Entrega via ficha');

  RETURN NEW;
END;
$$;

-- 3. Função: devolver estoque ao deletar item
CREATE OR REPLACE FUNCTION public.devolver_estoque_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.epi_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF OLD.tamanho IS NOT NULL AND OLD.tamanho <> '' THEN
    UPDATE public.epi_tamanhos
       SET estoque = estoque + COALESCE(OLD.quantidade, 1)
     WHERE epi_id = OLD.epi_id AND tamanho = OLD.tamanho;
  END IF;

  UPDATE public.epis
     SET estoque_atual = estoque_atual + COALESCE(OLD.quantidade, 1)
   WHERE id = OLD.epi_id;

  INSERT INTO public.movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo)
  VALUES ('epi', OLD.epi_id, 'entrada', COALESCE(OLD.quantidade, 1), 'Estorno - item removido da ficha');

  RETURN OLD;
END;
$$;

-- 4. Drop triggers antigos (se existirem) e cria novos
DROP TRIGGER IF EXISTS trg_validar_estoque_item ON public.fichas_epi_itens;
DROP TRIGGER IF EXISTS trg_baixa_estoque_item ON public.fichas_epi_itens;
DROP TRIGGER IF EXISTS trg_devolver_estoque_item ON public.fichas_epi_itens;
DROP TRIGGER IF EXISTS trg_descontar_estoque_ficha ON public.fichas_epi;

CREATE TRIGGER trg_validar_estoque_item
  BEFORE INSERT ON public.fichas_epi_itens
  FOR EACH ROW EXECUTE FUNCTION public.validar_estoque_item();

CREATE TRIGGER trg_baixa_estoque_item
  AFTER INSERT ON public.fichas_epi_itens
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_baixa_estoque_item();

CREATE TRIGGER trg_devolver_estoque_item
  AFTER DELETE ON public.fichas_epi_itens
  FOR EACH ROW EXECUTE FUNCTION public.devolver_estoque_item();

-- 5. Habilitar realtime para movimentações
ALTER TABLE public.movimentacoes_estoque REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'movimentacoes_estoque'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.movimentacoes_estoque;
  END IF;
END $$;