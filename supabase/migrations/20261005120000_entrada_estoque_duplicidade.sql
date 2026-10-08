-- =========================================================
-- Nota duplicada SEM chave de acesso (digitada à mão ou PDF escaneado):
-- a chave_acesso UNIQUE não pega esse caso. Bloqueia pelo emitente +
-- número + série (uma NF é única por esse trio). Lançamento antigo sem
-- série também bloqueia, mesmo critério da tela (buscarNotaLancada).
-- =========================================================
CREATE OR REPLACE FUNCTION public.bloquear_entrada_nf_duplicada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _num text := ltrim(NEW.numero_nf, '0');
  _serie text := NULLIF(ltrim(NEW.serie, '0'), '');
BEGIN
  IF NEW.fornecedor_cnpj IS NULL OR NULLIF(_num, '') IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM entradas_estoque e
    WHERE e.fornecedor_cnpj = NEW.fornecedor_cnpj
      AND ltrim(e.numero_nf, '0') = _num
      AND (_serie IS NULL OR e.serie IS NULL OR NULLIF(ltrim(e.serie, '0'), '') IS NOT DISTINCT FROM _serie)
  ) THEN
    RAISE EXCEPTION 'Nota duplicada: a NF % deste fornecedor já foi lançada no estoque', NEW.numero_nf;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entrada_nf_duplicada BEFORE INSERT ON public.entradas_estoque
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_entrada_nf_duplicada();

CREATE INDEX idx_entradas_estoque_cnpj_nf ON public.entradas_estoque (fornecedor_cnpj, numero_nf);
