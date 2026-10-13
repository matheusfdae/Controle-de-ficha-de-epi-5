#!/usr/bin/env bash
# Atualiza a lista de colaboradores da Senior na produção, parte por parte
# (cada chamada cabe no limite de 60 s das Edge Functions). Rodado pelo
# agendador da VM às 6h, 12h e 18h de Brasília; pode rodar à mão:
#
#   bash deploy/producao/senior-atualizar.sh             # atualiza agora
#   bash deploy/producao/senior-atualizar.sh --instalar  # (re)instala o agendamento
#
# O segredo do agendador fica em ~/.senior-cron-secret (gravado pelo
# configurar-senior.sh). Os desligados só são marcados se TODAS as partes
# de colaboradores da empresa deram certo.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
FUNCAO_URL="http://localhost:8000/functions/v1/senior-sincronizar-colaboradores"
SEGREDO_ARQ="$HOME/.senior-cron-secret"
EMPRESAS=(1 3)

if [ "${1:-}" = "--instalar" ]; then
  # Versão antiga guardava o segredo dentro de ~/.senior-atualizar.sh: aproveita.
  if [ ! -s "$SEGREDO_ARQ" ] && [ -f "$HOME/.senior-atualizar.sh" ]; then
    grep -o 'x-cron-secret: [0-9a-f]*' "$HOME/.senior-atualizar.sh" | head -1 | cut -d' ' -f2 > "$SEGREDO_ARQ"
  fi
  [ -s "$SEGREDO_ARQ" ] || { echo "Sem segredo do agendador. Rode antes: bash deploy/producao/configurar-senior.sh"; exit 1; }
  chmod 600 "$SEGREDO_ARQ"
  rm -f "$HOME/.senior-atualizar.sh"
  OFF="$(date +%z)"
  OFF_H=$(( 10#${OFF:1:2} )); [ "${OFF:0:1}" = "-" ] && OFF_H=$(( -OFF_H ))
  HORAS=""
  for h in 6 12 18; do HORAS="${HORAS:+$HORAS,}$(( (h + 3 + OFF_H + 24) % 24 ))"; done
  LINHA="0 $HORAS * * * bash $DIR/senior-atualizar.sh >> \$HOME/senior-colaboradores.log 2>&1 # senior-colaboradores"
  ( crontab -l 2>/dev/null | grep -v '# senior-colaboradores' || true; echo "$LINHA" ) | crontab -
  echo ">>> Agendado: às ${HORAS}h desta VM (= 6h, 12h e 18h de Brasília). Log em ~/senior-colaboradores.log"
  exit 0
fi

[ -s "$SEGREDO_ARQ" ] || { echo "Sem $SEGREDO_ARQ. Rode: bash $DIR/senior-atualizar.sh --instalar"; exit 1; }
SEGREDO="$(cat "$SEGREDO_ARQ")"

chamar() { # $1 = corpo JSON; imprime e devolve a resposta
  local r
  r="$(curl -s -m 75 -X POST "$FUNCAO_URL" -H "x-cron-secret: $SEGREDO" -H 'Content-Type: application/json' -d "$1")"
  echo "$(date '+%F %T') $1 -> ${r:-(sem resposta)}" >&2
  printf '%s' "$r"
}
num() { grep -o "\"$1\":[0-9]*" <<<"$2" | head -1 | cut -d: -f2; }

echo "===== $(date '+%F %T') atualização da Senior =====" >&2
DESDE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. Colaboradores, por empresa e período de admissão; depois, os desligados.
for emp in "${EMPRESAS[@]}"; do
  tudo_ok=1
  for periodo in 0 1 2; do
    r="$(chamar "{\"etapa\":\"colaboradores\",\"empresa\":$emp,\"periodo\":$periodo}")"
    grep -q '"ok":true' <<<"$r" || tudo_ok=0
  done
  if [ $tudo_ok = 1 ]; then
    chamar "{\"etapa\":\"finalizar\",\"empresa\":$emp,\"desde\":\"$DESDE\"}" >/dev/null
  else
    echo "$(date '+%F %T') empresa $emp: alguma parte falhou, ninguém foi marcado como desligado" >&2
  fi
done

# 2. Posto e escala, em lotes de matrículas.
for emp in "${EMPRESAS[@]}"; do
  parte=0; total=""
  while [ $parte -lt 40 ]; do
    r="$(chamar "{\"etapa\":\"postos\",\"empresa\":$emp,\"parte\":$parte}")"
    # Lote que falhou não interrompe os seguintes (o total vem de qualquer resposta boa).
    total="$(num partes "$r")"; total="${total:-${ultimo_total:-}}"; ultimo_total="$total"
    parte=$((parte + 1))
    [ -n "$total" ] && [ "$parte" -lt "$total" ] || break
  done
  ultimo_total=""
done

# 3. Nomes dos postos e escalas que faltam (repete enquanto houver progresso).
for _ in 1 2 3 4 5; do
  r="$(chamar '{"etapa":"descricoes"}')"
  faltam="$(num faltam "$r")"
  [ -n "$faltam" ] && [ "$faltam" -gt 0 ] || break
done
echo "===== $(date '+%F %T') fim =====" >&2
