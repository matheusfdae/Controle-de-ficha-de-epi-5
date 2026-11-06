#!/usr/bin/env bash
# Liga o robô da SEFAZ na VM (notas de compra -> preço dos materiais). Rodar na pasta
# ~/Controle-de-ficha-de-epi-5, depois do deploy que aplicou 20261108120000_notas_sefaz.sql:
#
#   bash deploy/producao/sefaz/configurar-sefaz.sh            # prepara e agenda (de hora em hora)
#   bash deploy/producao/sefaz/configurar-sefaz.sh --agora    # roda uma vez agora e mostra o resultado
#
# Certificados e senhas ficam SÓ na VM, em ~/sefaz (pasta fechada, só o seu usuário lê):
#   ~/sefaz/empresas.json   uma linha por CNPJ (a filial pode usar o .pfx da matriz)
#   ~/sefaz/*.pfx           certificado A1 de cada empresa
#   ~/sefaz/icp-brasil.pem  cadeia ICP-Brasil (baixada do ITI por este script)
#   ~/sefaz/.env            chave do banco (copiada do ~/supabase-project/.env)
#   ~/sefaz/robo.log        o que o robô fez em cada rodada
set -euo pipefail
cd "$(dirname "$0")"
DIR="$HOME/sefaz"
mkdir -p "$DIR"
chmod 700 "$DIR"

# 1. Chave do banco (service_role) para o robô gravar as notas.
CHAVE="$(grep -E '^SERVICE_ROLE_KEY=' "$HOME/supabase-project/.env" | tail -1 | cut -d= -f2- | tr -d "\"' ")"
[ -n "$CHAVE" ] || { echo "Não achei SERVICE_ROLE_KEY em ~/supabase-project/.env"; exit 1; }
printf 'SUPABASE_URL=http://localhost:8000\nSERVICE_KEY=%s\n' "$CHAVE" > "$DIR/.env"
chmod 600 "$DIR/.env"

# 2. Lista de empresas (modelo na primeira vez).
if [ ! -f "$DIR/empresas.json" ]; then
  cat > "$DIR/empresas.json" <<'JSON'
[
  { "cnpj": "00.000.000/0001-00", "nome": "5 ESTRELAS SISTEMA DE SEGURANCA", "uf": "DF", "pfx": "5estrelas.pfx", "senha": "SENHA-DO-CERTIFICADO" }
]
JSON
  chmod 600 "$DIR/empresas.json"
  echo ">>> Criei $DIR/empresas.json de modelo. Coloque os .pfx em $DIR, preencha o arquivo"
  echo "    (uma linha por CNPJ: cnpj, nome, uf, pfx, senha) e rode este script de novo."
  exit 0
fi
chmod 600 "$DIR"/empresas.json "$DIR"/*.pfx 2>/dev/null || true

# 3. Cadeia ICP-Brasil (o robô confere com ela o certificado dos servidores da SEFAZ).
if [ ! -s "$DIR/icp-brasil.pem" ]; then
  echo ">>> Baixando a cadeia ICP-Brasil do ITI..."
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/ac.zip" https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip
  (cd "$TMP" && unzip -q ac.zip)
  : > "$DIR/icp-brasil.pem"
  find "$TMP" -type f \( -iname '*.crt' -o -iname '*.cer' -o -iname '*.pem' \) | while read -r f; do
    openssl x509 -in "$f" -outform PEM 2>/dev/null >> "$DIR/icp-brasil.pem" \
      || openssl x509 -inform DER -in "$f" -outform PEM 2>/dev/null >> "$DIR/icp-brasil.pem" || true
  done
  rm -rf "$TMP"
  echo "    ok ($(grep -c 'BEGIN CERTIFICATE' "$DIR/icp-brasil.pem") certificados)"
fi

# 4. Imagem do robô.
echo ">>> Gerando a imagem do robô..."
docker build -q -t sefaz-robo . >/dev/null
echo "    ok"

RODAR="docker run --rm --network host --user $(id -u):$(id -g) --env-file $DIR/.env -v $DIR:/config:ro sefaz-robo"
if [ "${1:-}" = "--agora" ]; then
  $RODAR
  exit
fi

# 5. Cron: de hora em hora (a SEFAZ pede 1 h entre consultas sem nota nova).
LINHA="17 * * * * $RODAR >> $DIR/robo.log 2>&1 # sefaz-robo"
( crontab -l 2>/dev/null | grep -v '# sefaz-robo' || true; echo "$LINHA" ) | crontab -
echo ">>> Agendado de hora em hora. Teste agora com: bash $0 --agora"
