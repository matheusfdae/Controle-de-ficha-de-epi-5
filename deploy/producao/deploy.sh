#!/usr/bin/env bash
# Deploy na produção (VM g5e-svm065). Rodar DENTRO de ~/Controle-de-ficha-de-epi-5
# (a pasta que o Caddy serve, porta 8080), DEPOIS de `git pull origin main`:
#
#   cd ~/Controle-de-ficha-de-epi-5 && git pull origin main && bash deploy/producao/deploy.sh
#
# O que faz:
#  1. Confere no banco quais migrations já estão aplicadas (cada uma tem uma
#     "marca" que só existe depois dela) e lista as que faltam.
#  2. Backup do schema public do banco em ~/backups.
#  3. Gera a imagem nova do app ENQUANTO a antiga continua no ar.
#  4. Aplica as migrations que faltam numa transação só (erro = nada gravado).
#  5. Troca o container do app e atualiza as Edge Functions.
#  6. Confere se o site público está servindo a build nova.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$PWD"
DB=(docker exec -i supabase-db psql -U postgres -d postgres -X -q -At -v ON_ERROR_STOP=1)
FUNCOES="$HOME/supabase-project/volumes/functions"
SITE="https://controle-de-uniforme-epi.grupo5estrelas.com.br/"

[ "$(basename "$REPO")" = "Controle-de-ficha-de-epi-5" ] || { echo "Rode na pasta ~/Controle-de-ficha-de-epi-5."; exit 1; }
echo ">>> Código: $(git log --oneline -1)"

# ---------- 1. Migrations: arquivo -> SQL que dá 't' se ela JÁ foi aplicada ----------
MIGRACOES=(
  "20260914120000_modelos_ficha.sql|SELECT to_regclass('public.modelos_ficha') IS NOT NULL"
  "20260914130000_modelos_ficha_logo.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='modelos_ficha' AND column_name='logo_data_url')"
  "20260915120000_backfill_full_access_permissions.sql|SELECT true"
  "20261002110000_fornecedores.sql|SELECT to_regclass('public.fornecedores') IS NOT NULL"
  "20261002120000_entradas_estoque.sql|SELECT to_regclass('public.entradas_estoque') IS NOT NULL"
  "20261005120000_entrada_estoque_duplicidade.sql|SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_entrada_nf_duplicada')"
  # Aplicadas junto com a de estados no deploy de 08/10/2026. NÃO rodar de novo:
  # reclassificaria o catálogo e devolveria os 4 estados a todos os usuários.
  "20261005130000_classificar_epis_uniformes.sql|SELECT to_regclass('public.estados') IS NOT NULL"
  "20261006100000_estados.sql|SELECT to_regclass('public.estados') IS NOT NULL"
  "20261008120000_postos.sql|SELECT to_regclass('public.postos') IS NOT NULL"
)
PENDENTES=()
echo ">>> Migrations:"
for m in "${MIGRACOES[@]}"; do
  arq="${m%%|*}"; marca="${m#*|}"
  [ -f "supabase/migrations/$arq" ] || { echo "Falta o arquivo supabase/migrations/$arq"; exit 1; }
  if [ "$(echo "$marca;" | "${DB[@]}")" = "t" ]; then
    echo "    já aplicada: $arq"
  else
    echo "    A APLICAR:   $arq"; PENDENTES+=("$arq")
  fi
done

read -r -p "Seguir com backup + build + migrations + troca do app? Digite SIM: " OK
[ "$OK" = "SIM" ] || { echo "Cancelado, nada foi feito."; exit 1; }

# ---------- 2. Backup ----------
mkdir -p ~/backups
BKP=~/backups/antes-deploy-$(date +%F-%H%M).dump
echo ">>> Backup em $BKP ..."
docker exec supabase-db pg_dump -U postgres -d postgres -Fc -n public > "$BKP"
echo "    ok ($(du -h "$BKP" | cut -f1))"

# ---------- 3. Build (o app antigo continua no ar) ----------
echo ">>> Gerando a imagem nova do app..."
docker compose build app

# ---------- 4. Migrations numa transação só ----------
if [ ${#PENDENTES[@]} -gt 0 ]; then
  echo ">>> Aplicando ${#PENDENTES[@]} migration(s) numa transação só..."
  { for arq in "${PENDENTES[@]}"; do echo "\\echo '    -> $arq'"; cat "supabase/migrations/$arq"; echo; done; } \
    | docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 --single-transaction
  echo "    ok"
fi

# ---------- 5. Troca do app + Edge Functions ----------
echo ">>> Subindo o app novo..."
docker compose up -d app
echo ">>> Atualizando as Edge Functions..."
for f in supabase/functions/*/; do
  nome="$(basename "$f")"
  mkdir -p "$FUNCOES/$nome"
  cp -r "$f." "$FUNCOES/$nome/"
done
docker restart supabase-edge-functions >/dev/null
echo "    ok"

# ---------- 6. Conferência ----------
sleep 5
echo ">>> Site público:"
curl -sI "$SITE" | grep -iE "^HTTP|last-modified" | sed 's/^/    /'
echo "    (Last-Modified tem que ser de AGORA; se for antigo, o build foi para a pasta errada)"
echo ">>> Banco:"
"${DB[@]}" <<'SQL' | sed 's/^/    /'
SELECT 'fichas por estado: ' || string_agg(uf || '=' || n, ', ' ORDER BY uf) FROM (SELECT uf, count(*) n FROM public.fichas_epi GROUP BY uf) x;
SELECT 'catálogo: ' || string_agg(tipo::text || '=' || n, ', ') FROM (SELECT tipo, count(*) n FROM public.epis GROUP BY tipo) x;
SELECT 'usuários com estado liberado: ' || count(DISTINCT user_id) FROM public.user_estados;
SELECT 'modelos de ficha: ' || count(*) FROM public.modelos_ficha;
SQL
echo ">>> Deploy concluído. Backup: $BKP"
