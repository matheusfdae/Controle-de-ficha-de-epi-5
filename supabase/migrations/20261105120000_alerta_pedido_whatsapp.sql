-- Alerta de pedido por WhatsApp (depende de 20261030120000_pedidos_material.sql).
--   * postos.pedido_dia: dia do mês previsto para o posto fazer o pedido de material
--     (null = posto sem data prevista; mês mais curto usa o último dia).
--   * pedido_config.alerta_whatsapp: liga/desliga o envio automático.
--   * pedido_alertas_whatsapp: o que já foi enviado (um por posto, data prevista,
--     momento e número), para nunca mandar duas vezes.
-- Quem recebe: quem fez pedido daquele posto pelo link nos últimos 90 dias (o
-- telefone que digitou). O envio é da função alertar-pedidos-whatsapp, chamada
-- todo dia às 8h pelo agendador da VM (configurar-email.sh). Re-executável.

ALTER TABLE public.postos ADD COLUMN IF NOT EXISTS pedido_dia smallint CHECK (pedido_dia BETWEEN 1 AND 31);
ALTER TABLE public.pedido_config ADD COLUMN IF NOT EXISTS alerta_whatsapp boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.pedido_alertas_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  data_prevista date NOT NULL,
  momento text NOT NULL CHECK (momento IN ('antes', 'dia')),
  numero text NOT NULL,
  nome text,
  lote text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_alertas_whatsapp_unico UNIQUE (posto_id, data_prevista, momento, numero)
);
CREATE INDEX IF NOT EXISTS idx_pedido_alertas_whatsapp_data ON public.pedido_alertas_whatsapp (criado_em DESC);

ALTER TABLE public.pedido_alertas_whatsapp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedido_alertas_whatsapp ver" ON public.pedido_alertas_whatsapp;
CREATE POLICY "pedido_alertas_whatsapp ver" ON public.pedido_alertas_whatsapp FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') OR public._pm_aprovador_algum());
REVOKE ALL ON public.pedido_alertas_whatsapp FROM anon;
GRANT SELECT ON public.pedido_alertas_whatsapp TO authenticated;

-- Dia do pedido pela tela (Compras ou quem edita Pedidos de Material). NULL = sem data prevista.
CREATE OR REPLACE FUNCTION public.pedidos_definir_dia_pedido(_posto_id uuid, _dia integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public._pm_gestor(), false) THEN RAISE EXCEPTION 'Sem permissão para mudar o dia do pedido.'; END IF;
  IF _dia IS NOT NULL AND (_dia < 1 OR _dia > 31) THEN RAISE EXCEPTION 'Dia do pedido: de 1 a 31.'; END IF;
  UPDATE postos SET pedido_dia = _dia WHERE id = _posto_id AND public.pode_acessar_uf(uf);
  IF NOT FOUND THEN RAISE EXCEPTION 'Posto não encontrado.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.pedidos_definir_dia_pedido(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_definir_dia_pedido(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
