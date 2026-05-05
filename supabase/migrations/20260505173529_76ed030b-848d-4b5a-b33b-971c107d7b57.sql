
-- Funções
CREATE TABLE public.funcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funcoes select auth" ON public.funcoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "funcoes modify admin/rh" ON public.funcoes FOR ALL TO authenticated
  USING (is_admin_or_rh(auth.uid())) WITH CHECK (is_admin_or_rh(auth.uid()));
CREATE TRIGGER funcoes_updated BEFORE UPDATE ON public.funcoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Estoque por tamanho
CREATE TABLE public.epi_tamanhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  tamanho text NOT NULL,
  estoque integer NOT NULL DEFAULT 0,
  estoque_minimo integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (epi_id, tamanho)
);
ALTER TABLE public.epi_tamanhos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "epi_tam select auth" ON public.epi_tamanhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "epi_tam modify admin/rh" ON public.epi_tamanhos FOR ALL TO authenticated
  USING (is_admin_or_rh(auth.uid())) WITH CHECK (is_admin_or_rh(auth.uid()));
CREATE TRIGGER epi_tam_updated BEFORE UPDATE ON public.epi_tamanhos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EPIs vinculados à função (item padrão)
CREATE TABLE public.funcao_epis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcao_id uuid NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  quantidade integer NOT NULL DEFAULT 1,
  tamanho text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funcao_epis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funcao_epis select auth" ON public.funcao_epis FOR SELECT TO authenticated USING (true);
CREATE POLICY "funcao_epis modify admin/rh" ON public.funcao_epis FOR ALL TO authenticated
  USING (is_admin_or_rh(auth.uid())) WITH CHECK (is_admin_or_rh(auth.uid()));

-- Função vinculada à ficha
ALTER TABLE public.fichas_epi ADD COLUMN funcao_id uuid REFERENCES public.funcoes(id);

-- Trigger: ao marcar ficha como assinada, descontar estoque por tamanho
CREATE OR REPLACE FUNCTION public.descontar_estoque_ficha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
BEGIN
  IF NEW.status = 'assinada' AND (OLD.status IS DISTINCT FROM 'assinada') THEN
    FOR it IN
      SELECT epi_id, tamanho, quantidade
      FROM public.fichas_epi_itens
      WHERE ficha_id = NEW.id AND recebido = true AND epi_id IS NOT NULL
    LOOP
      -- desconta no estoque por tamanho (se houver registro)
      UPDATE public.epi_tamanhos
        SET estoque = GREATEST(estoque - COALESCE(it.quantidade,1), 0)
        WHERE epi_id = it.epi_id AND tamanho = COALESCE(it.tamanho, '');

      -- desconta no estoque geral do EPI
      UPDATE public.epis
        SET estoque_atual = GREATEST(estoque_atual - COALESCE(it.quantidade,1), 0)
        WHERE id = it.epi_id;

      -- registra movimentação
      INSERT INTO public.movimentacoes_estoque (tipo_item, item_id, tipo_mov, quantidade, motivo)
      VALUES ('epi', it.epi_id, 'saida', COALESCE(it.quantidade,1), 'Entrega via ficha assinada');
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_desconta_estoque
AFTER UPDATE ON public.fichas_epi
FOR EACH ROW EXECUTE FUNCTION public.descontar_estoque_ficha();
