-- Reenviar para assinatura qualquer ficha, inclusive as já assinadas.
-- A assinatura atual nunca é apagada: vai para fichas_assinaturas_anteriores
-- (rubrica, data, IP e uma cópia dos dados e itens daquele momento), a ficha
-- volta a "pendente" e um link novo é gerado. Estoque não muda (a baixa é só
-- quando um item entra ou sai da ficha). Re-executável.

CREATE TABLE IF NOT EXISTS public.fichas_assinaturas_anteriores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_epi(id) ON DELETE CASCADE,
  assinatura_colaborador_url text,
  data_assinatura_colaborador timestamptz,
  ip_assinatura text,
  assinatura_supervisor_url text,
  dados jsonb NOT NULL,          -- nome, função, CPF, matrícula, posto, data de entrega...
  itens jsonb NOT NULL,          -- itens como estavam quando foi assinada
  motivo text NOT NULL,
  reaberta_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reaberta_por_nome text,
  reaberta_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fichas_assinaturas_anteriores_ficha
  ON public.fichas_assinaturas_anteriores (ficha_id, reaberta_em DESC);

ALTER TABLE public.fichas_assinaturas_anteriores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinaturas anteriores ver" ON public.fichas_assinaturas_anteriores;
CREATE POLICY "assinaturas anteriores ver" ON public.fichas_assinaturas_anteriores
  FOR SELECT TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'fichas_epi', 'view')
      OR public.has_permission(public.current_profile_id(), 'fichas_uniforme', 'view'));
-- Sem INSERT/UPDATE/DELETE para usuários: só a função abaixo grava, e nada apaga.

CREATE OR REPLACE FUNCTION public.reabrir_ficha_para_assinatura(_ficha_id uuid, _motivo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.current_profile_id();
  v_nome text;
  f public.fichas_epi%ROWTYPE;
  v_token text;
BEGIN
  IF v_user IS NULL OR NOT (public.has_permission(v_user, 'fichas_epi', 'edit')
                            OR public.has_permission(v_user, 'fichas_uniforme', 'edit')) THEN
    RAISE EXCEPTION 'Sem permissão para reenviar fichas para assinatura';
  END IF;
  IF length(trim(coalesce(_motivo, ''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo do reenvio';
  END IF;

  SELECT * INTO f FROM public.fichas_epi WHERE id = _ficha_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha não encontrada'; END IF;

  -- Guarda o que foi assinado antes de reabrir.
  IF f.status = 'assinada' OR coalesce(f.assinatura_colaborador_url, '') <> '' THEN
    SELECT nome_completo INTO v_nome FROM public.profiles WHERE id = v_user;
    INSERT INTO public.fichas_assinaturas_anteriores
      (ficha_id, assinatura_colaborador_url, data_assinatura_colaborador, ip_assinatura,
       assinatura_supervisor_url, dados, itens, motivo, reaberta_por, reaberta_por_nome)
    VALUES (
      f.id, f.assinatura_colaborador_url, f.data_assinatura_colaborador, f.ip_assinatura,
      f.assinatura_supervisor_url,
      jsonb_build_object('numero', f.numero, 'nome_funcionario', f.nome_funcionario, 'funcao', f.funcao,
        'cpf_snapshot', f.cpf_snapshot, 'matricula_snapshot', f.matricula_snapshot,
        'posto_snapshot', f.posto_snapshot, 'empresa', f.empresa, 'data_entrega', f.data_entrega,
        'status', f.status),
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'descricao', i.descricao, 'quantidade', i.quantidade,
                  'tamanho', i.tamanho, 'ca', i.ca, 'recebido', i.recebido) ORDER BY i.created_at)
                FROM public.fichas_epi_itens i WHERE i.ficha_id = f.id), '[]'::jsonb),
      trim(_motivo), v_user, v_nome);
  END IF;

  UPDATE public.fichas_epi
     SET status = 'pendente_assinatura',
         assinatura_colaborador_url = NULL,
         data_assinatura_colaborador = NULL,
         ip_assinatura = NULL
   WHERE id = f.id;
  UPDATE public.fichas_epi_itens SET recebido = false WHERE ficha_id = f.id;

  -- Links antigos ainda não usados deixam de valer.
  UPDATE public.assinatura_tokens SET expira_em = now()
   WHERE ficha_id = f.id AND NOT usado AND expira_em > now();

  INSERT INTO public.assinatura_tokens (ficha_id, tipo_ficha) VALUES (f.id, 'epi')
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reabrir_ficha_para_assinatura(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_ficha_para_assinatura(uuid, text) TO authenticated;
