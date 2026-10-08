#!/usr/bin/env bash
# Copia as fichas do Supabase Cloud antigo ("dev") para o banco da produção.
#   ./migrar-fichas.sh ensaio    -> mostra o que seria copiado e desfaz tudo
#   ./migrar-fichas.sh aplicar   -> backup da produção + cópia de verdade
#
# A VM não sai pela porta 5432 (firewall), então os dados vêm pela API REST
# do Cloud (HTTPS/443) com a chave secreta do projeto (Supabase -> Project
# Settings -> API Keys -> service_role / Secret key). A chave é pedida sem
# aparecer na tela e não fica salva. Os arquivos baixados (têm CPF/nome)
# são apagados no final, com sucesso ou erro.
set -euo pipefail
cd "$(dirname "$0")"

MODO="${1:-}"
case "$MODO" in
  ensaio) APLICAR=false ;;
  aplicar) APLICAR=true ;;
  *) echo "Uso: $0 ensaio|aplicar"; exit 1 ;;
esac

DB_CONTAINER="supabase-db"
CLOUD_URL="https://fzkohpyqaazsltxxgloy.supabase.co"
DADOS="$PWD/dados"
DADOS_CT="/tmp/migra-fichas"
PSQL=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -X -q)

limpar() {
  rm -rf "$DADOS"
  docker exec "$DB_CONTAINER" rm -rf "$DADOS_CT" >/dev/null 2>&1 || true
}
trap limpar EXIT

read -r -s -p "Cole a chave secreta (service_role) do projeto Cloud e aperte Enter (NÃO aparece na tela): " SB_KEY; echo
[ -n "$SB_KEY" ] || { echo "Chave vazia."; exit 1; }

echo ">>> Baixando do Cloud..."
mkdir -p "$DADOS"
SB_KEY="$SB_KEY" CLOUD_URL="$CLOUD_URL" DADOS="$DADOS" python3 - <<'PY'
import json, os, sys, urllib.request, urllib.error
key, base, dest = os.environ['SB_KEY'], os.environ['CLOUD_URL'] + '/rest/v1/', os.environ['DADOS']
headers = {'apikey': key}
if key.startswith('eyJ'):  # chave service_role antiga (JWT)
    headers['Authorization'] = 'Bearer ' + key
for tabela in ['profiles', 'fichas_epi', 'fichas_epi_itens', 'epis', 'funcoes']:
    linhas, offset = [], 0
    while True:
        url = f'{base}{tabela}?select=*&order=id&offset={offset}&limit=1000'
        try:
            pagina = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120))
        except urllib.error.HTTPError as e:
            sys.exit(f'Erro {e.code} ao ler {tabela}: {e.read().decode()[:300]}')
        linhas += pagina
        if len(pagina) < 1000:
            break
        offset += 1000
    with open(f'{dest}/{tabela}.ndjson', 'w', encoding='utf-8') as f:
        for linha in linhas:
            f.write(json.dumps(linha, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'    {tabela}: {len(linhas)} linhas')
PY
unset SB_KEY

docker exec "$DB_CONTAINER" mkdir -p "$DADOS_CT"
docker cp "$DADOS/." "$DB_CONTAINER:$DADOS_CT/"

if $APLICAR; then
  mkdir -p ~/backups
  BKP=~/backups/antes-migracao-fichas-$(date +%F-%H%M).dump
  echo ">>> Backup da produção em $BKP ..."
  docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc -n public > "$BKP"
  echo ">>> Backup ok ($(du -h "$BKP" | cut -f1))."
  read -r -p "Gravar a cópia na PRODUÇÃO agora? Digite SIM: " OK
  [ "$OK" = "SIM" ] || { echo "Cancelado."; exit 1; }
fi

{
  printf "\\set aplicar %s\n" "$APLICAR"
  printf "\\set dados '%s'\n" "$DADOS_CT"
  cat migrar-fichas.sql
} | "${PSQL[@]}"
