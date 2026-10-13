-- Local e centro de custo do colaborador na Senior, gravados na ficha
-- (o "posto" continua sendo o nome limpo, ligado ao cadastro de postos).
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS local_senior text;
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS centro_custo_codigo text;
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS centro_custo text;
CREATE INDEX IF NOT EXISTS idx_fichas_epi_centro_custo ON public.fichas_epi (centro_custo_codigo);

-- Posto de trabalho e escala do colaborador na Senior.
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS posto_trabalho_codigo text;
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS posto_trabalho text;
ALTER TABLE public.fichas_epi ADD COLUMN IF NOT EXISTS escala text;
