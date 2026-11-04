-- Preço anterior de cada item do pedido (depende de 20261104120000_pedidos_teto_precos.sql).
-- Para a conferência: o preço do mesmo item na última compra, isto é, no último
-- pedido ATENDIDO feito antes deste (de qualquer posto), para comparar com o
-- preço deste pedido.
-- Re-executável.

CREATE INDEX IF NOT EXISTS idx_pedidos_material_itens_material ON public.pedidos_material_itens (material_id);

CREATE OR REPLACE FUNCTION public.pedido_precos_anteriores(_pedido_id uuid)
RETURNS TABLE (material_id uuid, preco_anterior numeric, data_anterior date, codigo_anterior text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.material_id, prev.preco_unit, prev.data_pedido, prev.codigo
  FROM pedidos_material p
  JOIN pedidos_material_itens i ON i.pedido_id = p.id
  LEFT JOIN LATERAL (
    SELECT i2.preco_unit, p2.data_pedido, p2.codigo
    FROM pedidos_material_itens i2 JOIN pedidos_material p2 ON p2.id = i2.pedido_id
    WHERE i2.material_id = i.material_id AND p2.id <> p.id AND p2.status = 'atendida' AND i2.preco_unit IS NOT NULL
      AND (p2.data_pedido, p2.created_at) < (p.data_pedido, p.created_at)
    ORDER BY p2.data_pedido DESC, p2.created_at DESC
    LIMIT 1
  ) prev ON true
  WHERE p.id = _pedido_id AND coalesce(public._pm_ve(p.uf, p.posto_id), false)
$$;
REVOKE ALL ON FUNCTION public.pedido_precos_anteriores(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_precos_anteriores(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
