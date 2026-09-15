-- =========================================================
-- Acesso total por padrão para contas legadas.
--
-- ce328b5 (14/09) fez todo usuário criado por /usuarios ou sincronizado
-- do Clerk (clerk-webhook) nascer com user_permissions de acesso total
-- em vez do preset mínimo de "colaborador". Mas isso só vale pra frente:
-- contas criadas antes disso (ex.: via backfill da migration
-- 20260902120000_wire_module_permissions.sql) ficaram travadas no preset
-- restrito do cargo — um colaborador comum via só "Assinar (Tablet)" e
-- ficava em modo somente-leitura.
--
-- Esta migration alinha as contas existentes com a mesma regra: acesso
-- total (ver/criar/editar/excluir) em todos os módulos de negócio para
-- todo profile, independente do cargo. "Usuários" (gestão de contas)
-- continua fora da matriz — gating por role admin/rh de verdade em
-- AuthContext#isAdmin, não muda aqui.
-- =========================================================

INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
SELECT p.id, m.module, true, true, true, true
FROM public.profiles p
CROSS JOIN (VALUES
  ('dashboard'), ('assinar_tablet'), ('fichas_epi'), ('fichas_uniforme'),
  ('termos_coletivos'), ('estoque'), ('vencimentos'), ('rank'),
  ('integracao'), ('funcoes'), ('configuracoes')
) AS m(module)
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view = true, can_create = true, can_edit = true, can_delete = true, updated_at = now();
