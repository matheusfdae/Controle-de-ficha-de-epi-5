#!/usr/bin/env bash
# Backup diário da produção (banco + arquivos do Storage + configuração).
# Rodado pelo agendador da VM às 3h de Brasília; pode rodar à mão:
#
#   bash deploy/producao/backup-diario.sh             # faz um backup agora
#   bash deploy/producao/backup-diario.sh --instalar  # (re)instala o agendamento
#   bash deploy/producao/backup-diario.sh --testar    # restaura o último backup num banco
#                                                     #   de teste e confere (não toca na produção)
#   bash deploy/producao/backup-diario.sh --listar    # mostra os backups guardados
#
# Cada backup é uma pasta em ~/backups/diario/ com:
#   banco.dump      pg_dump -Fc do banco inteiro (public, auth, storage...)
#   storage.tar.gz  arquivos do Storage (fotos, assinaturas, logos, carimbos)
#   config.tar.gz   .env do app e do Supabase, Caddyfile, segredos dos agendadores, crontab
#   resumo.txt      tamanhos, contagens e SHA-256 de cada arquivo
# Guarda 14 diários + 8 semanais (o de domingo). Por enquanto só na VM:
# DESTINO_EXTERNO (abaixo) liga a cópia para fora quando houver lugar.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$DIR/../.." && pwd)"
SUPA="$HOME/supabase-project"
RAIZ="$HOME/backups/diario"
LOG="$HOME/backups/backup-diario.log"
DB=supabase-db
STORAGE=supabase-storage
MANTER_DIARIOS=14
MANTER_SEMANAIS=8
MANTER_DEPLOY=10          # ~/backups/antes-deploy-*.dump
DESTINO_EXTERNO=""        # ex.: /mnt/backup-epi (pasta de rede montada). Vazio = só na VM.

if [ "${1:-}" = "--instalar" ]; then
  mkdir -p "$RAIZ"; chmod 700 "$HOME/backups" "$RAIZ"
  OFF="$(date +%z)"
  OFF_H=$(( 10#${OFF:1:2} )); [ "${OFF:0:1}" = "-" ] && OFF_H=$(( -OFF_H ))
  HORA=$(( (3 + 3 + OFF_H + 24) % 24 ))   # 3h de Brasília (UTC-3) no fuso da VM
  LINHA="0 $HORA * * * bash $DIR/backup-diario.sh >> \$HOME/backups/backup-diario.log 2>&1 # backup-diario"
  ( crontab -l 2>/dev/null | grep -v '# backup-diario' || true; echo "$LINHA" ) | crontab -
  echo ">>> Agendado: todo dia às 3h de Brasília ($HORA:00 no relógio da VM)."
  crontab -l | grep '# backup-diario'
  exit 0
fi

if [ "${1:-}" = "--listar" ]; then
  ls -1d "$RAIZ"/*/ 2>/dev/null | while read -r d; do
    printf '%-45s %s\n' "$(basename "$d")" "$(du -sh "$d" | cut -f1)"
  done
  echo; df -h "$HOME" | tail -1 | awk '{print "Disco: "$4" livres de "$2" ("$5" usado)"}'
  exit 0
fi

if [ "${1:-}" = "--testar" ]; then
  ULT="$(ls -1d "$RAIZ"/*/ 2>/dev/null | sort | tail -1)"
  [ -n "$ULT" ] || { echo "Nenhum backup em $RAIZ."; exit 1; }
  echo ">>> Testando $(basename "$ULT") num banco separado (teste_restauracao)..."
  docker exec "$DB" psql -U postgres -d postgres -qc "DROP DATABASE IF EXISTS teste_restauracao" \
    && docker exec "$DB" psql -U postgres -d postgres -qc "CREATE DATABASE teste_restauracao" || exit 1
  # Só o schema public (as tabelas do sistema). Avisos de funções que dependem
  # de auth/extensões são esperados aqui; o que importa são os dados.
  docker exec -i "$DB" pg_restore -U postgres -d teste_restauracao -n public --no-owner --no-privileges \
    < "$ULT/banco.dump" > /dev/null 2>&1
  OK=1
  for t in fichas_epi fichas_epi_itens profiles colaboradores_senior movimentacoes_estoque; do
    P="$(docker exec "$DB" psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo '-')"
    B="$(docker exec "$DB" psql -U postgres -d teste_restauracao -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo '-')"
    printf '  %-22s produção agora: %-7s backup: %s\n' "$t" "$P" "$B"
    [ "$B" = "-" ] && OK=0
  done
  docker exec "$DB" psql -U postgres -d postgres -qc "DROP DATABASE IF EXISTS teste_restauracao"
  if tar -tzf "$ULT/storage.tar.gz" > /dev/null 2>&1; then
    echo "  arquivos do Storage:   $(tar -tzf "$ULT/storage.tar.gz" | grep -vc '/$') no backup"
  else
    echo "  arquivos do Storage:   !! storage.tar.gz ilegível"; OK=0
  fi
  ( cd "$ULT" && sha256sum -c --quiet SHA256SUMS ) && echo "  conferência SHA-256:   ok" || { echo "  !! SHA-256 não confere"; OK=0; }
  [ "$OK" = 1 ] && echo ">>> Backup restaurável. (O backup é da hora em que foi feito; diferença pequena para 'agora' é normal.)" \
                || { echo ">>> !! Problema no backup — veja acima."; exit 1; }
  exit 0
fi

# ---------- backup ----------
exec 9> "$HOME/backups/.backup-diario.lock"
flock -n 9 || { echo "$(date '+%F %T') Já há um backup rodando."; exit 1; }
mkdir -p "$RAIZ"; chmod 700 "$HOME/backups" "$RAIZ"
umask 077
TIPO=diario; [ "$(date +%u)" = 7 ] && TIPO=semanal
DEST="$RAIZ/$(date +%F_%H%M)_$TIPO"
mkdir -p "$DEST"
falhou() { echo "$(date '+%F %T') !! FALHOU: $1"; rm -rf "$DEST"; exit 1; }
echo "$(date '+%F %T') >>> Backup $TIPO em $DEST"

# Espaço: precisa de ao menos 2x o último backup (ou 2 GB) livres.
ULT_TAM=$(du -sk "$(ls -1d "$RAIZ"/*/ 2>/dev/null | grep -v "$DEST" | sort | tail -1)" 2>/dev/null | cut -f1)
LIVRE=$(df -Pk "$HOME" | tail -1 | awk '{print $4}')
PRECISA=$(( ${ULT_TAM:-0} * 2 )); [ "$PRECISA" -lt 2097152 ] && PRECISA=2097152
[ "$LIVRE" -gt "$PRECISA" ] || falhou "pouco espaço em disco ($(( LIVRE / 1024 )) MB livres)"

docker exec "$DB" pg_dump -U postgres -d postgres -Fc > "$DEST/banco.dump" || falhou "pg_dump"
[ -s "$DEST/banco.dump" ] || falhou "banco.dump vazio"

# Arquivos do Storage: lidos de dentro do container (no disco ficam com dono root).
docker exec "$STORAGE" tar -czf - -C /var/lib/storage . > "$DEST/storage.tar.gz" || falhou "tar do Storage"
tar -tzf "$DEST/storage.tar.gz" > /dev/null || falhou "storage.tar.gz ilegível"

# Configuração (tem senhas e chaves: pasta só do dono, chmod 700/600).
CFG="$(mktemp -d)"
cp -p "$APP/.env" "$CFG/app.env" 2>/dev/null
cp -p "$SUPA/.env" "$CFG/supabase.env" 2>/dev/null
cp -p "$SUPA/docker-compose.yml" "$CFG/supabase-docker-compose.yml" 2>/dev/null
cat /etc/caddy/Caddyfile > "$CFG/Caddyfile" 2>/dev/null || rm -f "$CFG/Caddyfile"
for s in .senior-cron-secret .email-cron-secret; do cp -p "$HOME/$s" "$CFG/${s#.}" 2>/dev/null; done
crontab -l > "$CFG/crontab.txt" 2>/dev/null
tar -czf "$DEST/config.tar.gz" -C "$CFG" . ; rm -rf "$CFG"

{
  echo "Backup $TIPO de $(date '+%F %T %Z') — $(hostname)"
  echo "App: $(git -C "$APP" log -1 --format='%h %s' 2>/dev/null)"
  docker exec "$DB" psql -U postgres -d postgres -tAc \
    "SELECT 'fichas_epi: '||count(*) FROM public.fichas_epi UNION ALL SELECT 'fichas_epi_itens: '||count(*) FROM public.fichas_epi_itens UNION ALL SELECT 'storage.objects: '||count(*) FROM storage.objects" 2>/dev/null
  ls -l "$DEST" | awk 'NR>1{print $5"\t"$9}'
} > "$DEST/resumo.txt"
( cd "$DEST" && sha256sum banco.dump storage.tar.gz config.tar.gz > SHA256SUMS )
echo "$(date '+%F %T') ok: $(du -sh "$DEST" | cut -f1) — banco $(du -h "$DEST/banco.dump" | cut -f1), storage $(du -h "$DEST/storage.tar.gz" | cut -f1)"

# Retenção: 14 diários + 8 semanais; dos "antes-deploy", os 10 mais novos.
ls -1d "$RAIZ"/*_diario/ 2>/dev/null | sort | head -n -"$MANTER_DIARIOS" | xargs -r rm -rf
ls -1d "$RAIZ"/*_semanal/ 2>/dev/null | sort | head -n -"$MANTER_SEMANAIS" | xargs -r rm -rf
ls -1 "$HOME"/backups/antes-deploy-*.dump 2>/dev/null | sort | head -n -"$MANTER_DEPLOY" | xargs -r rm -f

if [ -n "$DESTINO_EXTERNO" ]; then
  if [ -d "$DESTINO_EXTERNO" ] && [ -w "$DESTINO_EXTERNO" ]; then
    rsync -a --delete "$RAIZ/" "$DESTINO_EXTERNO/diario/" && echo "$(date '+%F %T') cópia externa ok: $DESTINO_EXTERNO" \
      || echo "$(date '+%F %T') !! cópia externa falhou: $DESTINO_EXTERNO"
  else
    echo "$(date '+%F %T') !! destino externo indisponível: $DESTINO_EXTERNO"
  fi
fi
