ALTER PUBLICATION supabase_realtime ADD TABLE public.epis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.epi_tamanhos;
ALTER TABLE public.epis REPLICA IDENTITY FULL;
ALTER TABLE public.epi_tamanhos REPLICA IDENTITY FULL;