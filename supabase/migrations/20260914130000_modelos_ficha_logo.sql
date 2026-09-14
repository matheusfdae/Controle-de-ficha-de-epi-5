-- =========================================================
-- Cada modelo de ficha pode ter a própria logo (empresa diferente da
-- configuração global) em vez de sempre usar app_config.logo_data_url.
-- NULL = continua usando a logo global (comportamento atual, é o caso do
-- modelo "Padrão").
-- =========================================================
ALTER TABLE public.modelos_ficha ADD COLUMN logo_data_url TEXT;
