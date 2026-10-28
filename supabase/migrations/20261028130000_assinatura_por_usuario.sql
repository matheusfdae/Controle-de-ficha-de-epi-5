-- Assinatura do responsável pela entrega por usuário: cada login guarda a sua
-- e ela é preenchida nas fichas que ele faz, no lugar da assinatura única da
-- empresa (app_config.assinaturaEmpresa, que fica só como reserva para
-- imprimir fichas antigas sem assinatura gravada).
-- Tabela à parte (e não uma coluna em profiles) para a imagem não pesar nas
-- listas de usuários. Cada um só vê e altera a própria. Re-executável.

CREATE TABLE IF NOT EXISTS public.assinaturas_usuario (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  assinatura text NOT NULL CHECK (assinatura LIKE 'data:image/%'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assinaturas_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assinatura propria ver" ON public.assinaturas_usuario;
CREATE POLICY "assinatura propria ver" ON public.assinaturas_usuario
  FOR SELECT TO authenticated USING (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "assinatura propria criar" ON public.assinaturas_usuario;
CREATE POLICY "assinatura propria criar" ON public.assinaturas_usuario
  FOR INSERT TO authenticated WITH CHECK (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "assinatura propria alterar" ON public.assinaturas_usuario;
CREATE POLICY "assinatura propria alterar" ON public.assinaturas_usuario
  FOR UPDATE TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

DROP POLICY IF EXISTS "assinatura propria apagar" ON public.assinaturas_usuario;
CREATE POLICY "assinatura propria apagar" ON public.assinaturas_usuario
  FOR DELETE TO authenticated USING (profile_id = public.current_profile_id());

DROP TRIGGER IF EXISTS trg_assinaturas_usuario_updated ON public.assinaturas_usuario;
CREATE TRIGGER trg_assinaturas_usuario_updated BEFORE UPDATE ON public.assinaturas_usuario
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON public.assinaturas_usuario FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas_usuario TO authenticated;
