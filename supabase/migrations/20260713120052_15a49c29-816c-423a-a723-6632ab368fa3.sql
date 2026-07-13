DELETE FROM public.fichas_uniforme_itens WHERE ficha_id IN (SELECT id FROM public.fichas_uniforme WHERE colaborador_id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00');
DELETE FROM public.fichas_epi_itens WHERE ficha_id IN (SELECT id FROM public.fichas_epi WHERE colaborador_id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00');
DELETE FROM public.fichas_uniforme WHERE colaborador_id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00';
DELETE FROM public.fichas_epi WHERE colaborador_id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00';
DELETE FROM public.colaboradores_integracao WHERE profile_id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00';
DELETE FROM public.profiles WHERE id = 'ebab996e-f828-4474-bcaa-6ccdc248ab00';