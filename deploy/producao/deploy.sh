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
#  5. Troca as duas cópias do app (uma de cada vez) e atualiza as Edge Functions.
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
  "20261008130000_email_convocacao.sql|SELECT to_regclass('public.email_convocacao_config') IS NOT NULL"
  "20260929120000_colaboradores_senior.sql|SELECT to_regclass('public.colaboradores_senior') IS NOT NULL"
  "20261009120000_colaboradores_senior_lista.sql|SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='senior_gravar_descricoes')"
  "20261013120000_entrada_manual.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='entradas_estoque' AND column_name='motivo')"
  "20261009130000_fichas_local_centro_custo.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fichas_epi' AND column_name='escala')"
  "20261013130000_senior_etapas.sql|SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='senior_inativar_ausentes')"
  "20261014130000_integracao_senior.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='colaboradores_integracao' AND column_name='uf')"
  "20261015120000_modulo_crachas.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cracha_employees' AND column_name='desligado_em')"
  "20261019120000_situacao_link_assinatura.sql|SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='situacao_link_assinatura')"
  "20261020120000_reenviar_assinatura.sql|SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='reabrir_ficha_para_assinatura')"
  "20261020150000_cracha_solicitacao_senior.sql|SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='cracha_solicitacao_enviar')"
  "20261021120000_selfie_assinatura.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fichas_selfies' AND column_name='id')"
  "20261021130000_funcoes_por_estado.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funcoes' AND column_name='uf')"
  "20261021140000_email_estoque.sql|SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_estoque_config')"
  "20261021150000_alerta_reposicao_estoque.sql|SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alertas_estoque')"
  "20261022120000_troca_uniforme_posto.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='postos' AND column_name='troca_uniforme_meses')"
  "20261022130000_selfie_opcional.sql|SELECT position('selfie_obrigatoria' in pg_get_functiondef('public.assinar_ficha_publica_por_token(text,text,uuid[],text,text)'::regprocedure)) = 0"
  "20261028120000_rg_colaboradores_senior.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='colaboradores_senior' AND column_name='rg')"
  "20261028130000_assinatura_por_usuario.sql|SELECT to_regclass('public.assinaturas_usuario') IS NOT NULL"
  "20261029120000_email_pendentes.sql|SELECT to_regclass('public.email_pendentes_estados') IS NOT NULL"
  # Marca = coluna da versão só-quantidade: um banco com a versão antiga (com preço) também é atualizado.
  "20261030120000_pedidos_material.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos_material' AND column_name='conferida_em')"
  "20261031120000_estoque_posto.sql|SELECT to_regclass('public.estoque_plantoes') IS NOT NULL"
  "20261031130000_importar_planilha_postos.sql|SELECT to_regprocedure('public.pedidos_importar_planilha(jsonb)') IS NOT NULL"
  "20261104120000_pedidos_teto_precos.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='postos' AND column_name='teto_material')"
  "20261104130000_estoque_lancar_dia.sql|SELECT to_regprocedure('public.estoque_lancar_dia(uuid,date,text,jsonb,text,boolean,text)') IS NOT NULL"
  "20261104140000_pedidos_preco_anterior.sql|SELECT to_regprocedure('public.pedido_precos_anteriores(uuid)') IS NOT NULL"
  "20261105120000_alerta_pedido_whatsapp.sql|SELECT to_regclass('public.pedido_alertas_whatsapp') IS NOT NULL"
  "20261105130000_alerta_contatos.sql|SELECT to_regclass('public.pedido_alerta_contatos') IS NOT NULL"
  "20261105140000_master.sql|SELECT to_regclass('public.master_lixeira_lotes') IS NOT NULL"
  "20261106120000_pedido_termo_epi.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'termos_epi_coletivos' AND column_name = 'pedido_id')"
  "20261107120000_termo_epi_lembrete.sql|SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pedidos_material' AND column_name = 'termo_whatsapp_lembretes')"
  "20261111120000_gasto_mensal.sql|SELECT to_regclass('public.gasto_mensal') IS NOT NULL"
  "20261112120000_pedido_ultimos_do_posto.sql|SELECT to_regprocedure('public.pedido_material_ultimos_do_posto(integer,text,uuid)') IS NOT NULL"
  "20261112130000_movimentacao_diaria.sql|SELECT to_regclass('public.movimentacoes_diarias') IS NOT NULL"
  "20261113120000_movimentacao_reserva_relatorio.sql|SELECT to_regprocedure('public.movimentacao_relatorio_dia(integer,text,date)') IS NOT NULL"
)
# A ordem acima é a ordem em que as pendentes são aplicadas: sempre da mais antiga para a mais nova.
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
# Duas cópias atrás do Caddy (deploy/producao/Caddyfile.app): troca uma, espera
# ela responder e só então troca a outra. Assim sempre há uma no ar.
porta() { local v; v="$(grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' ")"; echo "${v:-$2}"; }
esperar() {
  for _ in $(seq 1 30); do curl -sf -o /dev/null "http://localhost:$1/" && return 0; sleep 2; done
  echo "    ERRO: a cópia na porta $1 não respondeu em 60 s"; return 1
}
echo ">>> Subindo o app novo (uma cópia de cada vez)..."
docker compose up -d --no-deps app
esperar "$(porta APP_PORT 3000)"
docker compose up -d --no-deps app2
esperar "$(porta APP2_PORT 8081)"
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
