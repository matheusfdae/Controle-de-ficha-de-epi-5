-- APAGA os dados de demonstração colocados pelo subir.sql e devolve o estado original.
--
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < deploy/producao/demo-apresentacao/apagar.sql
--
-- Remove: pedidos 'DEMO-…' (com itens e histórico), lançamentos de estoque 'DEMONSTRAÇÃO',
-- o estoque dos itens de demonstração e os itens com categoria 'Demonstração' que nenhum
-- pedido real usa. Devolve: o teto original dos postos usados, os avisos por e-mail e a
-- numeração dos pedidos. Tudo numa transação.

\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF to_regclass('public._demo_apresentacao') IS NULL THEN
    RAISE EXCEPTION 'Não há demonstração para apagar (tabela _demo_apresentacao não existe).';
  END IF;
END $$;

DELETE FROM public.pedidos_material WHERE solicitante_matricula LIKE 'DEMO-%';
DELETE FROM public.estoque_plantoes WHERE observacao_inicio = 'DEMONSTRAÇÃO';
DELETE FROM public.estoque_posto WHERE material_id IN (SELECT id FROM public.materiais WHERE categoria = 'Demonstração');
DELETE FROM public.posto_materiais WHERE material_id IN (SELECT id FROM public.materiais WHERE categoria = 'Demonstração');
DELETE FROM public.materiais m WHERE m.categoria = 'Demonstração'
  AND NOT EXISTS (SELECT 1 FROM public.pedidos_material_itens i WHERE i.material_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.estoque_plantao_itens e WHERE e.material_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.materiais f WHERE f.item_pai_id = m.id);

-- Teto original dos postos usados (null = sem teto).
UPDATE public.postos p SET teto_material = (d.valor ->> p.id::text)::numeric
FROM public._demo_apresentacao d
WHERE d.chave = 'postos' AND d.valor ? p.id::text;

-- Avisos por e-mail como estavam.
UPDATE public.pedido_config SET avisar_email = (SELECT (valor)::text::boolean FROM public._demo_apresentacao WHERE chave = 'avisar_email')
WHERE id = 1 AND EXISTS (SELECT 1 FROM public._demo_apresentacao WHERE chave = 'avisar_email');

-- Numeração: continua do maior número que sobrou (ou do original, se não sobrou pedido no ano).
UPDATE public.pedido_numeracao n SET ultimo = coalesce(
  (SELECT max(numero) FROM public.pedidos_material WHERE ano = n.ano),
  (SELECT (valor ->> n.ano::text)::int FROM public._demo_apresentacao WHERE chave = 'numeracao'),
  0);

DROP TABLE public._demo_apresentacao;
COMMIT;

-- Conferência: tudo tem que dar 0 e os avisos voltam ao que eram.
SELECT 'pedidos de demonstração: ' || count(*) FROM public.pedidos_material WHERE solicitante_matricula LIKE 'DEMO-%';
SELECT 'lançamentos de estoque de demonstração: ' || count(*) FROM public.estoque_plantoes WHERE observacao_inicio = 'DEMONSTRAÇÃO';
SELECT 'itens de demonstração que ficaram: ' || count(*) FROM public.materiais WHERE categoria = 'Demonstração';
SELECT 'avisos por e-mail dos pedidos: ' || CASE WHEN avisar_email THEN 'ligados' ELSE 'desligados' END FROM public.pedido_config WHERE id = 1;
