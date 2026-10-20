#!/usr/bin/env bash
# Liga o chat "Tirar dúvidas" (assistente pelo Gemini) na produção.
# Rodar na VM, dentro de ~/Controle-de-ficha-de-epi-5, depois do deploy:
#
#   bash deploy/producao/configurar-assistente.sh
#
# Pede a chave do Google AI Studio (https://aistudio.google.com/apikey) e grava
# em public.config_segredos — tabela que só o servidor lê. A chave não aparece
# na tela nem fica em arquivo. Pode rodar de novo para trocar a chave.
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)

read -r -s -p "Chave do Gemini (não aparece na tela): " CHAVE; echo
[ -n "$CHAVE" ] || { echo "Chave vazia."; exit 1; }

echo ">>> Testando a chave..."
STATUS="$(curl -s -m 30 -o /dev/null -w '%{http_code}' -H "x-goog-api-key: $CHAVE" \
  https://generativelanguage.googleapis.com/v1beta/models)" || STATUS=000
case "$STATUS" in
  200) echo "    chave OK" ;;
  000) echo "A VM não conseguiu falar com o Google (generativelanguage.googleapis.com)."; exit 1 ;;
  *)   echo "O Google recusou a chave (HTTP $STATUS)."; exit 1 ;;
esac

{
  printf "\set chave '%s'\n" "${CHAVE//\'/\'\'}"
  cat <<'SQL'
INSERT INTO public.config_segredos (chave, valor) VALUES ('gemini_api_key', :'chave')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();
SQL
} | "${PSQL[@]}"
unset CHAVE
echo ">>> Chave gravada. O chat já funciona (botão \"Dúvidas?\" no canto da tela)."
