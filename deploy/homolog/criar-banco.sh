#!/usr/bin/env bash
# Popula o banco da homologação (hml-db) a partir da PRODUÇÃO (supabase-db):
#   - estrutura do schema public (tabelas, funções, policies, grants)
#   - dados só das tabelas de referência (nada de fichas nem pessoas)
#   - migrations do repositório que a produção ainda não tem
#   - tabelas na publicação do Realtime, iguais às da produção
# Na produção só LÊ (pg_dump). Tudo que escreve vai para hml-db.
set -euo pipefail
REPO="$HOME/epi-homolog"
REF_TABLES="app_config funcoes epis epi_tamanhos uniformes funcao_epis"

prod() { docker exec supabase-db "$@"; }
hml_sql() { docker exec -i hml-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
hml_q() { docker exec hml-db psql -U supabase_admin -d postgres -tAc "$1"; }

if [ "$(hml_q "select to_regclass('public.profiles') is not null")" = "t" ]; then
  echo "hml-db já tem o schema public populado — nada feito."; exit 1
fi

echo "== estrutura do schema public"
# O schema public já existe no banco novo: tira o CREATE SCHEMA do dump.
prod pg_dump -U postgres --schema-only --schema=public \
  | grep -v '^CREATE SCHEMA public;$' | hml_sql

echo "== dados de referência: $REF_TABLES"
args=(); for t in $REF_TABLES; do args+=(-t "public.$t"); done
prod pg_dump -U postgres --data-only --disable-triggers "${args[@]}" | hml_sql

echo "== migrations que faltam na produção"
aplica() { echo "   $1"; hml_sql < "$REPO/supabase/migrations/$1"; }
if [ "$(hml_q "select to_regclass('public.modelos_ficha') is null")" = "t" ]; then
  aplica 20260914120000_modelos_ficha.sql
  aplica 20260914130000_modelos_ficha_logo.sql
fi
if [ "$(hml_q "select to_regclass('public.colaboradores_senior') is null")" = "t" ]; then
  aplica 20260929120000_colaboradores_senior.sql
fi

echo "== publicação do Realtime"
for t in $(prod psql -U postgres -tAc "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'"); do
  hml_q "alter publication supabase_realtime add table public.$t" >/dev/null && echo "   $t"
done

docker restart hml-rest >/dev/null   # recarrega o cache de schema do PostgREST
echo "OK. Tabelas em public: $(hml_q "select count(*) from pg_tables where schemaname='public'")"
