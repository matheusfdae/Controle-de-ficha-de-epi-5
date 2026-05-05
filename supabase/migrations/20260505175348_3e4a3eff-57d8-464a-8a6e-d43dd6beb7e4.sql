
-- 1) Vínculo entre integração e profile criado
ALTER TABLE public.colaboradores_integracao
  ADD COLUMN IF NOT EXISTS profile_id uuid;

CREATE INDEX IF NOT EXISTS idx_ci_profile ON public.colaboradores_integracao(profile_id);

-- 2) Função: marca como integrado quando ambas as fichas (EPI + Uniforme) estão assinadas
CREATE OR REPLACE FUNCTION public.check_integracao_completa(_colaborador uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_epi boolean;
  has_uni boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.fichas_epi
    WHERE colaborador_id = _colaborador AND status = 'assinada'
  ) INTO has_epi;

  SELECT EXISTS(
    SELECT 1 FROM public.fichas_uniforme
    WHERE colaborador_id = _colaborador AND status = 'assinada'
  ) INTO has_uni;

  IF has_epi AND has_uni THEN
    UPDATE public.colaboradores_integracao
       SET status = 'integrado', updated_at = now()
     WHERE profile_id = _colaborador AND status = 'pendente';
  END IF;
END;
$$;

-- 3) Gatilhos
CREATE OR REPLACE FUNCTION public.trg_integracao_epi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'assinada' AND (OLD.status IS DISTINCT FROM 'assinada') AND NEW.colaborador_id IS NOT NULL THEN
    PERFORM public.check_integracao_completa(NEW.colaborador_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_integracao_uni()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'assinada' AND (OLD.status IS DISTINCT FROM 'assinada') AND NEW.colaborador_id IS NOT NULL THEN
    PERFORM public.check_integracao_completa(NEW.colaborador_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_integracao_after_epi ON public.fichas_epi;
CREATE TRIGGER trg_integracao_after_epi
AFTER UPDATE ON public.fichas_epi
FOR EACH ROW EXECUTE FUNCTION public.trg_integracao_epi();

DROP TRIGGER IF EXISTS trg_integracao_after_uni ON public.fichas_uniforme;
CREATE TRIGGER trg_integracao_after_uni
AFTER UPDATE ON public.fichas_uniforme
FOR EACH ROW EXECUTE FUNCTION public.trg_integracao_uni();
