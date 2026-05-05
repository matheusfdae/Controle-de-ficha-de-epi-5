
ALTER TABLE public.fichas_uniforme_itens
  ALTER COLUMN uniforme_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS descricao text;
