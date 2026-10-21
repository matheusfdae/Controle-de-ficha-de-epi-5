#!/usr/bin/env bash
# Liga o ENVIO AUTOMÁTICO da convocação de troca de uniforme (Microsoft 365).
# Rodar na VM, dentro de ~/Controle-de-ficha-de-epi-5, depois do deploy:
#
#   bash deploy/producao/configurar-email.sh
#
# A conta que envia é conectada pela tela (Configurações > E-mail > "Conectar
# conta", login por código na Microsoft); este script só cria o agendamento
# diário das 7h de Brasília. A função só envia no dia da semana escolhido na tela.
set -euo pipefail
cd "$(dirname "$0")/../.."
PSQL=(docker exec -i supabase-db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1)
FUNCAO_URL="http://localhost:8000/functions/v1/enviar-convocacao-uniforme"
FUNCAO_ESTOQUE="http://localhost:8000/functions/v1/enviar-relatorio-estoque"

# Segredo do agendador: gerado aqui, guardado no banco e num arquivo só deste usuário.
CRON_SECRET="$(openssl rand -hex 32)"
printf "\\set cron '%s'\nINSERT INTO public.config_segredos (chave, valor) VALUES ('cron_secret', :'cron') ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();\n" "$CRON_SECRET" \
  | "${PSQL[@]}"
( umask 077; printf '%s' "$CRON_SECRET" > "$HOME/.email-cron-secret" )
unset CRON_SECRET

# 7h em Brasília no relógio desta VM (o cron usa o fuso do sistema).
OFF="$(date +%z)"
OFF_H=$(( 10#${OFF:1:2} )); [ "${OFF:0:1}" = "-" ] && OFF_H=$(( -OFF_H ))
HORA=$(( (7 + 3 + OFF_H + 24) % 24 ))
LINHA="0 $HORA * * * curl -s -m 120 -X POST $FUNCAO_URL -H 'Content-Type: application/json' -H \"x-cron-secret: \$(cat \$HOME/.email-cron-secret)\" -d '{\"modo\":\"automatico\"}' >> \$HOME/convocacao-uniforme.log 2>&1; echo >> \$HOME/convocacao-uniforme.log # convocacao-uniforme"
LINHA_ESTOQUE="0 $HORA * * * curl -s -m 120 -X POST $FUNCAO_ESTOQUE -H 'Content-Type: application/json' -H \"x-cron-secret: \$(cat \$HOME/.email-cron-secret)\" -d '{\"modo\":\"automatico\"}' >> \$HOME/relatorio-estoque.log 2>&1; echo >> \$HOME/relatorio-estoque.log # relatorio-estoque"
# Pedido de reposição: a cada 15 min (só envia se algum item chegou ao mínimo); o log só guarda envios e falhas.
LINHA_REPOSICAO="*/15 * * * * r=\$(curl -s -m 120 -X POST $FUNCAO_ESTOQUE -H 'Content-Type: application/json' -H \"x-cron-secret: \$(cat \$HOME/.email-cron-secret)\" -d '{\"modo\":\"reposicao\"}' 2>&1); case \"\$r\" in *'\"enviado\":false'*) ;; *) echo \"\$(date '+\%F \%T') \$r\" >> \$HOME/reposicao-estoque.log;; esac # reposicao-estoque"
( crontab -l 2>/dev/null | grep -v -e '# convocacao-uniforme' -e '# relatorio-estoque' -e '# reposicao-estoque' || true; echo "$LINHA"; echo "$LINHA_ESTOQUE"; echo "$LINHA_REPOSICAO" ) | crontab -
echo ">>> Agendamento: todo dia às ${HORA}h desta VM (= 7h de Brasília) + pedido de reposição a cada 15 min."
echo "    Logs em ~/convocacao-uniforme.log, ~/relatorio-estoque.log e ~/reposicao-estoque.log"
echo "    Na tela: Configurações > E-mail > conecte a conta e, em cada cartão (convocação e estoque), escolha o dia, os destinatários e ligue o envio automático."
