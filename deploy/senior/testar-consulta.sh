#!/usr/bin/env bash
# Testa o web service "AP - Consultar colaborador" (com.senior.g5.rh.fp.consultarColaborador)
# da Senior Cloud com o usuário de integração, sem gravar a senha em lugar nenhum.
# Rodar na VM ou no PC (Git Bash) — os dois IPs estão liberados na Senior:
#
#   bash deploy/senior/testar-consulta.sh
#
# Mostra só nome, cargo, local e situação do colaborador (nada de dados pessoais).
set -euo pipefail
URL="${SENIOR_WS_URL:-https://webp27.seniorcloud.com.br:30361/g5-senior-services}/rubi_Synccom_senior_g5_rh_fp_consultarColaborador"

read -r -p "Usuário de integração da Senior: " USUARIO
read -r -s -p "Senha (não aparece na tela): " SENHA; echo
read -r -p "Empresa (numEmp) [1]: " EMP; EMP="${EMP:-1}"
read -r -p "Matrícula (numCad): " CAD
read -r -p "Tipo de colaborador (1 = empregado) [1]: " TIP; TIP="${TIP:-1}"
for v in EMP CAD TIP; do [[ "${!v}" =~ ^[0-9]+$ ]] || { echo "$v precisa ser número."; exit 1; }; done

xml() { local s="$1"; s="${s//&/&amp;}"; s="${s//</&lt;}"; s="${s//>/&gt;}"; printf '%s' "$s"; }
CORPO="<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ser=\"http://services.senior.com.br\"><soapenv:Body><ser:ConsultarColaborador><user>$(xml "$USUARIO")</user><password>$(xml "$SENHA")</password><encryption>0</encryption><parameters><numEmp>$EMP</numEmp><tipCol>$TIP</tipCol><numCad>$CAD</numCad></parameters></ser:ConsultarColaborador></soapenv:Body></soapenv:Envelope>"
unset SENHA

echo ">>> Consultando a Senior (pode levar até 30 s)..."
RESP="$(curl -s -m 60 -X POST "$URL" -H 'Content-Type: text/xml; charset=utf-8' -H 'SOAPAction: ""' --data-binary @- <<<"$CORPO")" \
  || { echo "Sem resposta da Senior (rede/timeout)."; exit 1; }
unset CORPO

# Campo ausente = texto vazio (sem o "|| true", o set -e encerraria o script calado).
campo() { { grep -o "<$1>[^<]*</$1>" <<<"$RESP" || true; } | head -1 | sed -E "s#</?$1>##g"; }
ERRO="$(campo erroExecucao)"
if [ -n "$ERRO" ]; then echo "ERRO da Senior: $ERRO"; exit 1; fi
if [ -z "$(campo numCad)" ]; then echo "Nenhum colaborador com essa matrícula (empresa $EMP, tipo $TIP)."; exit 1; fi

echo "OK — a integração funciona:"
echo "  Nome:     $(campo nomFun)"
echo "  Empresa:  $(campo nomEmp)"
echo "  Cargo:    $(campo titCar)"
echo "  Local:    $(campo nomLoc)"
echo "  Situação: $(campo desSit)"
