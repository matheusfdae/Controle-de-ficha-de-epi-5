-- Prazo de troca de uniforme por posto (contrato), pedido do Dionei em 22/10/2026:
--  * obrigatória: o contrato exige a troca no prazo (ex.: 6 meses), sob risco no faturamento;
--  * flexível: o contrato prevê, mas na prática a troca é feita pelo uso (ex.: 12 meses).
-- Sem prazo (NULL) = posto ainda não analisado: a convocação usa 12 meses.
-- Re-executável.

ALTER TABLE public.postos ADD COLUMN IF NOT EXISTS troca_uniforme_meses smallint
  CHECK (troca_uniforme_meses BETWEEN 1 AND 60);
ALTER TABLE public.postos ADD COLUMN IF NOT EXISTS troca_uniforme_obrigatoria boolean NOT NULL DEFAULT false;
