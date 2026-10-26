#!/usr/bin/env bash
# Instala (ou atualiza) o WA-AKG — o gateway de WhatsApp da convocação de
# uniforme — nesta VM, em ~/WA-AKG, com MySQL próprio em Docker.
# Rodar na VM, dentro de ~/Controle-de-ficha-de-epi-5:
#
#   bash deploy/producao/instalar-whatsapp.sh
#
# Painel: http://<IP da VM>:3100 (só na rede interna). O MySQL do WA-AKG só
# escuta na própria VM (127.0.0.1:3307). Na primeira vez, gera as senhas e
# mostra a do painel UMA vez; rodar de novo só atualiza o código.
# Depois: entrar no painel, criar a sessão, escanear o QR code com o celular
# da empresa e rodar deploy/producao/configurar-whatsapp.sh.
set -euo pipefail
DIR="$HOME/WA-AKG"
REPO_URL="https://github.com/matheusfdae/WA-AKG.git"
PORTA=3100
IP="$(hostname -I | awk '{print $1}')"

if [ -d "$DIR/.git" ]; then
  echo ">>> Atualizando o código em $DIR ..."
  git -C "$DIR" pull --ff-only
else
  if ss -ltn | grep -q ":$PORTA "; then echo "A porta $PORTA já está em uso nesta VM."; exit 1; fi
  echo ">>> Baixando o WA-AKG (repositório privado: use o mesmo login do GitHub do sistema de fichas)..."
  git clone "$REPO_URL" "$DIR"
fi
cd "$DIR"

if [ ! -f .env ]; then
  read -r -p "E-mail do administrador do painel do WA-AKG: " ADMIN_EMAIL
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo "E-mail inválido."; exit 1; }
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  ( umask 077; cat > .env <<EOF
# Gerado por instalar-whatsapp.sh em $(date +%F). Não vai para o git.
PORT="$PORTA"
BASE_URL="http://$IP:$PORTA"
NEXTAUTH_URL="http://$IP:$PORTA"
AUTH_TRUST_HOST="true"
AUTH_SECRET="$(openssl rand -base64 32)"
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
MYSQL_DATABASE="wa_akg"
# Banco só na própria VM:
MYSQL_PORT="127.0.0.1:3307"
ADMIN_EMAIL="$ADMIN_EMAIL"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
NEXT_PUBLIC_SWAGGER_ENABLED="false"
NEXT_PUBLIC_SWAGGER_PASSWORD="$(openssl rand -hex 16)"
ENABLE_AUTO_UPDATE_CHECK="false"
ENABLE_HEARTBEAT="false"
BAILEYS_LOG_LEVEL="error"
TZ="America/Sao_Paulo"
LOCALE="pt-BR"
EOF
  )
  NOVO=1
fi

echo ">>> Gerando a imagem e subindo (a primeira vez leva alguns minutos)..."
docker compose up -d --build

echo ">>> Esperando o painel responder..."
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORTA/auth/login")" = "200" ] && break
  sleep 5
done
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORTA/auth/login")" = "200" ] \
  || { echo "O painel não respondeu. Veja: docker logs wa-akg-app --tail 50"; exit 1; }

echo ">>> WA-AKG no ar: http://$IP:$PORTA"
if [ "${NOVO:-}" = "1" ]; then
  echo "    Login: $ADMIN_EMAIL"
  echo "    Senha: $ADMIN_PASSWORD   (anote agora; fica só em $DIR/.env)"
fi
cat <<EOF

Próximos passos:
  1. Abra http://$IP:$PORTA, entre e crie uma sessão (Sessions / QR).
  2. Escaneie o QR code com o WhatsApp do celular da EMPRESA
     (WhatsApp > Aparelhos conectados > Conectar aparelho).
  3. No painel, gere a chave de API (menu "Webhooks & API" > API Key) e anote o
     código da sessão (aparece embaixo do nome dela, ex.: e00z6m).
  4. Rode: bash deploy/producao/configurar-whatsapp.sh
EOF
