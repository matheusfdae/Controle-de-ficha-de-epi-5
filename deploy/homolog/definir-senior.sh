#!/usr/bin/env bash
# Grava (ou troca) as credenciais do web service da Senior no .env da
# homologação, sem exibir a senha, e recria o container de functions.
set -euo pipefail
ENV_FILE="$HOME/supabase-homolog/.env"
[ -f "$ENV_FILE" ] || { echo "Rode antes o gerar-env.sh"; exit 1; }

read -r -p "URL base da Senior (ex.: http://servidor:8080/g5-senior-services): " URL
read -r -p "Usuário da integração Senior: " USER_WS
read -r -s -p "Senha (não aparece): " PASS_WS; echo
# O .env do docker compose não tem escape dentro de aspas simples.
case "$PASS_WS" in *\'*) echo "Senha com aspas simples (') não é suportada no .env."; exit 1;; esac

tmp=$(mktemp)
grep -vE '^SENIOR_WS_(URL|USER|PASSWORD)=' "$ENV_FILE" > "$tmp" || true
{
  printf 'SENIOR_WS_URL=%s\n' "$URL"
  printf 'SENIOR_WS_USER=%s\n' "$USER_WS"
  # Aspas simples: senha com $ ou espaço não é interpretada pelo docker compose.
  printf "SENIOR_WS_PASSWORD='%s'\n" "$PASS_WS"
} >> "$tmp"
install -m 600 "$tmp" "$ENV_FILE" && rm -f "$tmp"

cd "$HOME/supabase-homolog" && docker compose up -d functions >/dev/null
echo "OK: credenciais da Senior gravadas e functions recriado."
