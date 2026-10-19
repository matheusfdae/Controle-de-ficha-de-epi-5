-- Link de assinatura (WhatsApp): diz por que o link não abre, para a tela
-- mostrar a mensagem certa ("já assinada", "vencido") em vez de um
-- "Link inválido" genérico. Não devolve dados do colaborador nem da ficha,
-- só a situação do token. Re-executável.

CREATE OR REPLACE FUNCTION public.situacao_link_assinatura(_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'situacao', CASE
          WHEN t.usado THEN 'usado'
          WHEN t.expira_em <= now() THEN 'vencido'
          ELSE 'valido'
        END,
        'usado_em', t.usado_em,
        'expira_em', t.expira_em)
     FROM public.assinatura_tokens t
     WHERE t.token = _token AND t.tipo_ficha = 'epi'),
    jsonb_build_object('situacao', 'inexistente'));
$$;

GRANT EXECUTE ON FUNCTION public.situacao_link_assinatura(TEXT) TO anon, authenticated;
