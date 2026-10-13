#!/usr/bin/env bash
# Liga a integração com a Senior na produção e a atualização automática da
# lista de colaboradores (3x ao dia: 6h, 12h e 18h de Brasília).
# Rodar na VM, dentro de ~/Controle-de-ficha-de-epi-5, DEPOIS do deploy que
# cria a tabela config_segredos (migration 20261009120000):
#
#   bash deploy/producao/configurar-senior.sh
#
# Grava o usuário e a senha da integração em public.config_segredos — tabela
# que só o servidor lê. A senha não aparece na tela nem fica em arquivo.
# Pode rodar de novo para trocar a senha.
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
FUNCAO_URL="http://localhost:8000/functions/v1/senior-sincronizar-colaboradores"
URL_PADRAO="https://webp27.seniorcloud.com.br:30361/g5-senior-services"

echo "Usuário de integração da Senior (criado no SGU):"
read -r -p "  URL dos web services [$URL_PADRAO]: " URL; URL="${URL:-$URL_PADRAO}"
read -r -p "  Usuário: " USUARIO
read -r -s -p "  Senha (não aparece na tela): " SENHA; echo
for v in URL USUARIO SENHA; do [ -n "${!v}" ] || { echo "$v vazio."; exit 1; }; done
if [ "$SENHA" = "123456" ] || [ "${#SENHA}" -lt 10 ]; then
  echo "Senha fraca (menos de 10 caracteres ou 123456). Troque no SGU antes de usar na produção."; exit 1
fi

# Testa antes de gravar: consulta uma matrícula que não existe só para validar o login.
echo ">>> Testando o login na Senior..."
xml() { local s="$1"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }
RESP="$(curl -s -m 90 -X POST "$URL/rubi_Synccom_senior_g5_rh_fp_consultarColaborador" \
  -H 'Content-Type: text/xml; charset=utf-8' -H 'SOAPAction: ""' --data-binary @- <<XML
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br"><soapenv:Body><ser:ConsultarColaborador><user>$(xml "$USUARIO")</user><password>$(xml "$SENHA")</password><encryption>0</encryption><parameters><numEmp>1</numEmp><tipCol>1</tipCol><numCad>1</numCad></parameters></ser:ConsultarColaborador></soapenv:Body></soapenv:Envelope>
XML
)" || { echo "A VM não conseguiu falar com a Senior ($URL)."; exit 1; }
ERRO="$( { grep -o '<erroExecucao>[^<]*' <<<"$RESP" || true; } | sed 's/<erroExecucao>//')"
if [ -n "$ERRO" ]; then echo "A Senior recusou: $ERRO"; exit 1; fi
echo "    login OK"

CRON_SECRET="$(openssl rand -hex 32)"
{
  printf "\\set url '%s'\n" "${URL//\'/\'\'}"
  printf "\\set usuario '%s'\n" "${USUARIO//\'/\'\'}"
  printf "\\set senha '%s'\n" "${SENHA//\'/\'\'}"
  printf "\\set cron '%s'\n" "$CRON_SECRET"
  cat <<'SQL'
INSERT INTO public.config_segredos (chave, valor) VALUES
  ('senior_ws_url', :'url'), ('senior_ws_user', :'usuario'), ('senior_ws_password', :'senha'),
  ('senior_cron_secret', :'cron')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();
SQL
} | "${PSQL[@]}"
unset SENHA RESP
echo ">>> Credenciais gravadas."

# Script que roda as etapas em sequência (cada chamada cabe no limite de 60 s
# das Edge Functions). Fica fora do repositório porque leva o segredo.
EXEC="$HOME/.senior-atualizar.sh"
cat > "$EXEC" <<SH
#!/usr/bin/env bash
etapa() { echo "\$(date '+%F %T') \$1 \$2"; curl -s -m 120 -X POST "$FUNCAO_URL" -H 'x-cron-secret: $CRON_SECRET' -H 'Content-Type: application/json' -d "{\"etapa\":\"\$1\",\"empresa\":\${2:-0}}"; echo; }
etapa colaboradores
etapa postos 1
etapa postos 3
etapa descricoes
SH
chmod 700 "$EXEC"

# 6h, 12h e 18h em Brasília (UTC-3) no relógio desta VM.
OFF="$(date +%z)"
OFF_H=$(( 10#${OFF:1:2} )); [ "${OFF:0:1}" = "-" ] && OFF_H=$(( -OFF_H ))
HORAS=""
for h in 6 12 18; do HORAS="${HORAS:+$HORAS,}$(( (h + 3 + OFF_H + 24) % 24 ))"; done
LINHA="0 $HORAS * * * $EXEC >> \$HOME/senior-colaboradores.log 2>&1 # senior-colaboradores"
( crontab -l 2>/dev/null | grep -v '# senior-colaboradores' || true; echo "$LINHA" ) | crontab -
echo ">>> Agendado: às ${HORAS}h desta VM (= 6h, 12h e 18h de Brasília). Log em ~/senior-colaboradores.log"

echo ">>> Rodando a primeira atualização agora (leva ~2 minutos)..."
"$EXEC"
