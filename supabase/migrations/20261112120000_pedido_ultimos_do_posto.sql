-- Link público do pedido de material: os 3 últimos pedidos do posto escolhido
-- (de qualquer encarregado, sem os cancelados), para o líder ter uma noção do
-- que costuma pedir. Só quantidades: sem valores em R$.
-- Quem chama precisa se identificar (matrícula ou CPF) e o posto tem que estar
-- entre os que ele pode escolher (mesma regra da lista de postos do link).

CREATE OR REPLACE FUNCTION public._pm_ultimos_do_posto(_matricula integer, _cpf text, _posto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.colaboradores_senior := public._cracha_solicitante(_matricula, _cpf);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM postos p WHERE p.id = _posto_id AND p.ativo AND (_s.uf IS NULL OR p.uf = _s.uf)) THEN
    RAISE EXCEPTION 'Posto não encontrado.';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x.criado_em DESC), '[]') FROM (
    SELECT p.id, p.codigo, p.status, p.data_pedido, p.created_at AS criado_em,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('material_id', i.material_id,
          'nome', public._pm_nome_material(i.material_id), 'unidade', m.unidade,
          'quantidade', i.quantidade, 'quantidade_pedida', coalesce(i.quantidade_pedida, i.quantidade),
          'quantidade_atendida', i.quantidade_atendida)
          ORDER BY public._pm_nome_material(i.material_id)), '[]')
       FROM pedidos_material_itens i JOIN materiais m ON m.id = i.material_id WHERE i.pedido_id = p.id) AS itens
    FROM pedidos_material p
    WHERE p.posto_id = _posto_id AND p.status <> 'cancelada'
    ORDER BY p.created_at DESC
    LIMIT 3) x);
END $$;

CREATE OR REPLACE FUNCTION public.pedido_material_ultimos_do_posto(_matricula integer, _cpf text, _posto_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('pedidos', public._pm_ultimos_do_posto(_matricula, _cpf, _posto_id));
EXCEPTION WHEN SQLSTATE 'P0401' OR raise_exception THEN
  RETURN public._cracha_erro(SQLSTATE, SQLERRM, public._cracha_chave(_matricula, _cpf));
END $$;

REVOKE ALL ON FUNCTION public._pm_ultimos_do_posto(integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_material_ultimos_do_posto(integer, text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
