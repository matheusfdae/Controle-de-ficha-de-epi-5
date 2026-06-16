
-- 1) Coluna tipo
DO $$ BEGIN
  CREATE TYPE public.item_tipo AS ENUM ('epi','uniforme');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.epis
  ADD COLUMN IF NOT EXISTS tipo public.item_tipo NOT NULL DEFAULT 'epi';

-- 2) Classificar uniformes existentes
UPDATE public.epis SET tipo = 'uniforme'
WHERE nome ~* '^(Blazer|Calça|Camisa|Gandola|Meia|Meião|Coturno|Gravata|Caderneta|Caneta|Capa de Chuva|Cinto em (Couro|Nylon)|Galocha|Garrafa|Prancheta|Rede com Laço|Sapatilha|Sapato Social|Boné com Logo|Boné com Logo 5 Estrelas|Sapato Antiderrapante Spider Pro|Colete Refletivo)';
