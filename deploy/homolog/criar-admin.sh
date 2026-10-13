#!/usr/bin/env bash
# Cria (ou reaproveita) o perfil de admin na homologação para um usuário que
# já existe na instância DEVELOPMENT do Clerk. Uso: ./criar-admin.sh email@...
# Lê a CLERK_SECRET_KEY do .env da homologação sem exibi-la.
set -euo pipefail
EMAIL="${1:?Uso: $0 email@dominio}"
ENV_FILE="$HOME/supabase-homolog/.env"

SK=$(grep '^CLERK_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2-)
USER_JSON=$(curl -fsS -G "https://api.clerk.com/v1/users" \
  --data-urlencode "email_address=$EMAIL" -H "Authorization: Bearer $SK")
unset SK

CLERK_ID=$(printf '%s' "$USER_JSON" | jq -r '.[0].id // empty')
NOME=$(printf '%s' "$USER_JSON" | jq -r '.[0] | [.first_name, .last_name] | map(select(. != null and . != "")) | join(" ")')
if [ -z "$CLERK_ID" ]; then
  echo "Nenhum usuário com $EMAIL na instância Development do Clerk."
  echo "Crie-o no painel do Clerk (Development > Users) e rode de novo."
  exit 1
fi

docker exec -i hml-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -v email="$EMAIL" -v clerk="$CLERK_ID" -v nome="${NOME:-$EMAIL}" <<'SQL'
INSERT INTO public.profiles (id, email, nome_completo, clerk_user_id, must_change_password)
SELECT gen_random_uuid(), :'email', :'nome', :'clerk', false
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE clerk_user_id = :'clerk');

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE clerk_user_id = :'clerk'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
SELECT p.id, m.module, true, true, true, true
FROM public.profiles p
CROSS JOIN (VALUES ('dashboard'), ('assinar_tablet'), ('fichas_epi'), ('fichas_uniforme'),
  ('termos_coletivos'), ('estoque'), ('vencimentos'), ('rank'), ('integracao'),
  ('funcoes'), ('configuracoes')) AS m(module)
WHERE p.clerk_user_id = :'clerk'
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view = true, can_create = true, can_edit = true, can_delete = true;
SQL
echo "OK: $EMAIL é admin na homologação."
