#!/usr/bin/env bash
# Gera os .env da homologação SEM exibir nenhum segredo na tela.
#   ~/supabase-homolog/.env          -> backend (chaves novas, só da homologação)
#   <repo>/deploy/homolog/.env       -> build do frontend (URL + anon key + pk do Clerk)
# Pede a publishable key e a secret key da instância DEVELOPMENT do Clerk
# (a Production só aceita o domínio oficial). A secret é digitada escondida.
# Rodar de novo só é necessário para trocar as chaves do Clerk; isso gera
# chaves novas e exige recriar o banco da homologação.
set -euo pipefail

HML_DIR="$HOME/supabase-homolog"
APP_ENV="$(cd "$(dirname "$0")" && pwd)/.env"
PUBLIC_URL="http://192.168.254.65:8100"

if [ -f "$HML_DIR/.env" ]; then
  echo "Já existe $HML_DIR/.env — nada foi alterado."
  echo "Para regenerar, apague esse arquivo e o banco (volumes/db/data) antes."
  exit 1
fi

read -r -p "Clerk DEVELOPMENT - publishable key (pk_test_...): " CLERK_PK
case "$CLERK_PK" in pk_test_*) ;; *) echo "Esperava pk_test_ (instância Development)."; exit 1;; esac
read -r -s -p "Clerk DEVELOPMENT - secret key (sk_test_..., não aparece): " CLERK_SK; echo
case "$CLERK_SK" in sk_test_*) ;; *) echo "Esperava sk_test_ (instância Development)."; exit 1;; esac

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
sign_jwt() { # $1=payload json
  local h p s
  h=$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '%s' "$1" | b64url)
  s=$(printf '%s' "$h.$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}

JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRET_KEY_BASE=$(openssl rand -hex 32)
REALTIME_DB_ENC_KEY=$(openssl rand -hex 8)   # 16 caracteres, exigido pelo Realtime
IAT=$(date +%s); EXP=$((IAT + 5*365*24*3600))
ANON_KEY=$(sign_jwt "{\"role\":\"anon\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}")
SERVICE_ROLE_KEY=$(sign_jwt "{\"role\":\"service_role\",\"iss\":\"supabase\",\"iat\":$IAT,\"exp\":$EXP}")

# Chave pública RSA do Clerk Dev (o token de sessão do Clerk é validado por ela).
CLERK_DOMAIN=$(printf '%s' "${CLERK_PK#pk_test_}" | base64 -d 2>/dev/null | tr -d '$')
CLERK_JWKS=$(curl -fsS "https://$CLERK_DOMAIN/.well-known/jwks.json")
OCT_K=$(printf '%s' "$JWT_SECRET" | b64url)
JWT_JWKS=$(jq -cn --arg k "$OCT_K" --argjson clerk "$CLERK_JWKS" \
  '{keys: ([{kty:"oct", k:$k, alg:"HS256"}] + $clerk.keys)}')

mkdir -p "$HML_DIR"
umask 077
cat > "$HML_DIR/.env" <<EOF
KONG_HTTP_PORT=8100
SUPABASE_PUBLIC_URL=$PUBLIC_URL
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SECRET_KEY_BASE=$SECRET_KEY_BASE
REALTIME_DB_ENC_KEY=$REALTIME_DB_ENC_KEY
JWT_JWKS='$JWT_JWKS'
CLERK_SECRET_KEY=$CLERK_SK
SENIOR_WS_MODULE=rubi
EOF

cat > "$APP_ENV" <<EOF
VITE_SUPABASE_URL=$PUBLIC_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PK
EOF

echo "OK: $HML_DIR/.env e $APP_ENV criados (permissão 600)."
echo "Chaves do Clerk Dev encontradas no JWKS: $(printf '%s' "$CLERK_JWKS" | jq '.keys | length')"
