#!/usr/bin/env bash
# Aplica, em ordem, todos os arquivos de supabase/migrations/*.sql contra o
# Postgres do Supabase self-hosted. Idempotente na medida em que as próprias
# migrations usam "IF NOT EXISTS" / "CREATE OR REPLACE" / "DROP ... IF EXISTS".
#
# Uso:
#   DATABASE_URL="postgresql://postgres:SENHA@SEU_SERVIDOR:5432/postgres" ./scripts/apply-migrations.sh
#
# Requer o cliente psql instalado na máquina que roda o script.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL antes de rodar este script. Exemplo:" >&2
  echo '  DATABASE_URL="postgresql://postgres:SENHA@SEU_SERVIDOR:5432/postgres" ./scripts/apply-migrations.sh' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../supabase/migrations"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "Nenhuma migration encontrada em $MIGRATIONS_DIR" >&2
  exit 1
fi

IFS=$'\n' files=($(sort <<<"${files[*]}")); unset IFS

for f in "${files[@]}"; do
  echo "==> Aplicando $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Todas as migrations foram aplicadas com sucesso."
