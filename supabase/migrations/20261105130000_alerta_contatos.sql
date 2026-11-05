-- Contatos do alerta de pedido por WhatsApp (depende de 20261105120000_alerta_pedido_whatsapp.sql).
-- Quem recebe o alerta de um posto = quem pediu por ele pelo link nos últimos 90 dias
-- (celular da Senior primeiro; sem celular lá, o que a pessoa digitou), mais os
-- ajustes feitos na tela, guardados aqui:
--   * corrigir: troca o número de uma pessoa da lista (chave = id da Senior ou o número);
--   * remover: a pessoa da lista não recebe mais;
--   * adicionar: contato a mais, cadastrado à mão (sem chave).
-- Re-executável.

CREATE TABLE IF NOT EXISTS public.pedido_alerta_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('corrigir', 'remover', 'adicionar')),
  chave text,
  nome text,
  numero text CHECK (numero IS NULL OR numero ~ '^55\d{11}$'),
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_alerta_contatos_dados CHECK (
    (acao = 'remover' AND chave IS NOT NULL)
    OR (acao = 'corrigir' AND chave IS NOT NULL AND numero IS NOT NULL)
    OR (acao = 'adicionar' AND chave IS NULL AND numero IS NOT NULL AND nullif(trim(coalesce(nome, '')), '') IS NOT NULL))
);
-- Uma correção ou remoção por pessoa; um contato adicionado por número.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_alerta_contatos_chave ON public.pedido_alerta_contatos (posto_id, chave) WHERE chave IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_alerta_contatos_numero ON public.pedido_alerta_contatos (posto_id, numero) WHERE acao = 'adicionar';

ALTER TABLE public.pedido_alerta_contatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedido_alerta_contatos ver" ON public.pedido_alerta_contatos;
CREATE POLICY "pedido_alerta_contatos ver" ON public.pedido_alerta_contatos FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'pedidos_material', 'view') OR public._pm_aprovador_algum());
REVOKE ALL ON public.pedido_alerta_contatos FROM anon;
GRANT SELECT ON public.pedido_alerta_contatos TO authenticated;

-- Base da lista do posto para a tela: pedidos pelo link dos últimos 90 dias com o
-- celular da Senior de quem pediu (a tela não lê colaboradores_senior direto).
CREATE OR REPLACE FUNCTION public.pedidos_alerta_base(_posto_id uuid)
RETURNS TABLE (solicitante_nome text, solicitante_telefone text, data_pedido date, solicitante_senior_id uuid, senior_telefone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.solicitante_nome, p.solicitante_telefone, p.data_pedido, p.solicitante_senior_id, c.telefone
  FROM pedidos_material p
  LEFT JOIN colaboradores_senior c ON c.id = p.solicitante_senior_id
  WHERE p.posto_id = _posto_id
    AND p.data_pedido >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90
    AND (coalesce(public._pm_gestor(), false) OR coalesce(public.has_permission(public.current_profile_id(), 'pedidos_material', 'view'), false))
  ORDER BY p.data_pedido DESC
  LIMIT 2000
$$;
REVOKE ALL ON FUNCTION public.pedidos_alerta_base(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_alerta_base(uuid) TO authenticated;

-- Grava um ajuste (corrigir/remover/adicionar). Corrigir ou remover a mesma pessoa
-- de novo substitui o ajuste anterior.
CREATE OR REPLACE FUNCTION public.pedidos_alerta_ajustar(_posto_id uuid, _acao text, _chave text, _nome text, _numero text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public._pm_gestor(), false) THEN RAISE EXCEPTION 'Sem permissão para mudar os contatos do alerta.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM postos WHERE id = _posto_id AND public.pode_acessar_uf(uf)) THEN RAISE EXCEPTION 'Posto não encontrado.'; END IF;
  IF _numero IS NOT NULL AND _numero !~ '^55\d{11}$' THEN RAISE EXCEPTION 'Celular inválido (DDD + 9 dígitos).'; END IF;
  IF _acao IN ('corrigir', 'remover') THEN
    DELETE FROM pedido_alerta_contatos WHERE posto_id = _posto_id AND chave = _chave;
  ELSIF _acao = 'adicionar' THEN
    DELETE FROM pedido_alerta_contatos WHERE posto_id = _posto_id AND acao = 'adicionar' AND numero = _numero;
  ELSE
    RAISE EXCEPTION 'Ação inválida.';
  END IF;
  INSERT INTO pedido_alerta_contatos (posto_id, acao, chave, nome, numero, criado_por)
  VALUES (_posto_id, _acao, CASE WHEN _acao = 'adicionar' THEN NULL ELSE _chave END,
    nullif(left(trim(coalesce(_nome, '')), 120), ''), CASE WHEN _acao = 'remover' THEN NULL ELSE _numero END, public.current_profile_id());
END $$;
REVOKE ALL ON FUNCTION public.pedidos_alerta_ajustar(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_alerta_ajustar(uuid, text, text, text, text) TO authenticated;

-- Desfaz um ajuste (a pessoa volta ao número de origem, ou o contato adicionado sai).
CREATE OR REPLACE FUNCTION public.pedidos_alerta_desfazer(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public._pm_gestor(), false) THEN RAISE EXCEPTION 'Sem permissão para mudar os contatos do alerta.'; END IF;
  DELETE FROM pedido_alerta_contatos a USING postos p WHERE a.id = _id AND p.id = a.posto_id AND public.pode_acessar_uf(p.uf);
END $$;
REVOKE ALL ON FUNCTION public.pedidos_alerta_desfazer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedidos_alerta_desfazer(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
