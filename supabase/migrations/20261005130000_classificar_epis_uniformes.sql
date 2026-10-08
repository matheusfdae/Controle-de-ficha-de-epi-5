-- =========================================================
-- Lista oficial de EPIs (Matheus, 05/10/2026), por função:
--   Vigilante armado:   capa de colete, coldre, baleiro, porta tonfa,
--                       cinto NA, boné, fiel e apito, japona, protetor solar
--   Vigilante desarmado: boné, fiel e apito, japona, protetor solar
--   Brigadista:         capacete, respirador facial, óculos de proteção,
--                       protetor auricular tipo concha, luvas de raspa,
--                       luvas cirúrgicas, joelheira, japona
--   Aux. serv. gerais:  boné, luvas PVC, protetor solar, perneira,
--                       óculos de proteção, boné árabe, protetor auricular,
--                       manguito
-- Só esses são EPI; todo o resto do catálogo é uniforme. Exceção confirmada
-- por ele: capacete e luvas de motociclista também são EPI.
-- =========================================================
UPDATE public.epis SET tipo = CASE
  WHEN trim(nome) ~* ('^(capa (de |do )?colete|coldre|baleiro|porta[ -]?tonfa'
                     || '|cinto na\M'
                     -- "Boné com Logo 5 Estrelas" é uniforme; só o boné simples e o árabe são EPI.
                     || '|bon[eé]($| [aá]rabe)|fiel|japona|protetor solar|filtro solar'
                     || '|capacete|respirador|m[aá]scara|[oó]culos'
                     || '|protetor auricular|abafador'
                     || '|luva|joelheira|perneira|manguito)')
    THEN 'epi'::public.item_tipo
  ELSE 'uniforme'::public.item_tipo
END;

-- Conferência: como ficou cada item.
SELECT tipo, nome, ca_numero, estoque_atual
FROM public.epis
ORDER BY tipo, nome;
