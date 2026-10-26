#!/usr/bin/env bash
# Liga o sistema de fichas ao WA-AKG (convocação de uniforme por WhatsApp).
# Rodar na VM, dentro de ~/Controle-de-ficha-de-epi-5, DEPOIS de
# instalar-whatsapp.sh e de conectar o celular no painel do WA-AKG:
#
#   bash deploy/producao/configurar-whatsapp.sh
#
# Grava endereço, sessão e chave de API em public.config_segredos — tabela que
# só o servidor lê. Pode rodar de novo para trocar a chave ou a sessão.
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
URL_PADRAO="http://$(hostname -I | awk '{print $1}'):3100"

read -r -p "Endereço do WA-AKG [$URL_PADRAO]: " URL; URL="${URL:-$URL_PADRAO}"; URL="${URL%/}"
read -r -p "Código da sessão (embaixo do nome dela no painel, ex.: e00z6m): " SESSAO
read -r -s -p "Chave de API (Webhooks & API > API Key; não aparece na tela): " CHAVE; echo
for v in URL SESSAO CHAVE; do [ -n "${!v}" ] || { echo "$v vazio."; exit 1; }; done

echo ">>> Testando a chave e a sessão..."
RESP="$(curl -s -m 30 -H "x-api-key: $CHAVE" "$URL/api/sessions/$SESSAO")" \
  || { echo "Não consegui falar com o WA-AKG em $URL."; exit 1; }
case "$RESP" in
  *'"status":false'*|'') echo "O WA-AKG recusou: $RESP"; exit 1 ;;
esac
grep -q '"status":"CONNECTED"' <<<"$RESP" \
  || echo "    Atenção: a sessão $SESSAO não está CONECTADA. Escaneie o QR code no painel antes de enviar."

# As Edge Functions rodam em container: confere se de lá também chegam no WA-AKG.
REDE="$(docker inspect supabase-edge-functions -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
if ! docker run --rm --network "$REDE" curlimages/curl:8.10.1 -s -o /dev/null -m 15 -w '%{http_code}' "$URL/auth/login" | grep -q 200; then
  echo "As Edge Functions (rede $REDE) não chegam em $URL. Confira o firewall da VM para a porta do WA-AKG."; exit 1
fi
echo "    ok (a VM e as Edge Functions chegam no WA-AKG)"

{
  printf "\\set url '%s'\n" "${URL//\'/\'\'}"
  printf "\\set sessao '%s'\n" "${SESSAO//\'/\'\'}"
  printf "\\set chave '%s'\n" "${CHAVE//\'/\'\'}"
  cat <<'SQL'
INSERT INTO public.config_segredos (chave, valor) VALUES
  ('waakg_url', :'url'), ('waakg_sessao', :'sessao'), ('waakg_api_key', :'chave')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();
SQL
} | "${PSQL[@]}"
unset CHAVE RESP
echo ">>> Pronto. No sistema: Vencimentos > Uniformes > \"Enviar por WhatsApp\"; acompanhe em \"Envios WhatsApp\"."
