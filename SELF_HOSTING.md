# Self-hosting completo (frontend + Supabase)

Este guia cobre a hospedagem 100% própria da ferramenta: banco de dados,
autenticação, storage e edge functions rodando no seu servidor (via
Supabase self-hosted, Docker), além do frontend React/Vite.

Pré-requisito: um servidor Linux (VPS ou on-premise) com Docker e Docker
Compose v2 instalados, pelo menos 2 vCPU / 4 GB RAM, e (recomendado) um
domínio apontando para o servidor para configurar HTTPS.

---

## 1. Subir o Supabase self-hosted

O `docker-compose.yml` completo do Supabase (Postgres, Auth, PostgREST,
Realtime, Storage, Kong, Studio) é mantido oficialmente pela Supabase —
não faz sentido copiá-lo à mão aqui, pois muda de versão para versão.
Puxe direto do repositório oficial:

```bash
git clone --depth 1 https://github.com/supabase/supabase
mkdir supabase-project
cp -rf supabase/docker/* supabase-project
cp supabase/docker/.env.example supabase-project/.env
cd supabase-project
docker compose pull
```

Gere as chaves e segredos (nunca use os valores de exemplo do `.env.example`
em produção):

```bash
sh utils/generate-keys.sh
sh utils/add-new-auth-keys.sh
```

Edite o `.env` gerado e ajuste pelo menos:

| Variável | O que colocar |
|---|---|
| `POSTGRES_PASSWORD` | senha forte, só o banco usa |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | credenciais do Studio (painel admin do Supabase) |
| `SUPABASE_PUBLIC_URL` | URL pública da API, ex.: `https://api.seudominio.com.br` |
| `API_EXTERNAL_URL` | mesma URL + `/auth/v1` |
| `SITE_URL` | URL pública do **frontend** (a ferramenta em si), ex.: `https://epi.seudominio.com.br` |
| `FUNCTIONS_VERIFY_JWT` | `true` (as 5 edge functions deste projeto exigem token válido) |

Suba a stack:

```bash
sh run.sh start
```

O Studio fica em `http://SEU_SERVIDOR:8000` (usuário/senha do `.env`). Anote,
do `.env` gerado, os valores de **`ANON_KEY`** e **`SERVICE_ROLE_KEY`** —
serão usados nos próximos passos.

---

## 2. Aplicar o schema do projeto (migrations)

Todas as tabelas, RLS policies e funções deste projeto estão em
`supabase/migrations/*.sql`, em ordem cronológica. Rode contra o Postgres
que acabou de subir:

```bash
DATABASE_URL="postgresql://postgres:SENHA_DO_POSTGRES@SEU_SERVIDOR:5432/postgres" \
  ./scripts/apply-migrations.sh
```

Isso recria as tabelas (`fichas_epi`, `profiles`, `user_roles` etc.), todas
as policies de RLS, as funções `SECURITY DEFINER` e o bucket de storage
`epi-assets` (criado automaticamente por uma das migrations).

> Self-hosted não tem tela de "criar primeiro usuário admin". Cadastre-se
> uma vez pelo app (fica como `colaborador`) e depois promova via SQL:
> ```sql
> update user_roles set role = 'admin' where user_id = '<uuid-do-seu-usuario>';
> ```
> (o `uuid` aparece em `auth.users` ou na aba Authentication do Studio).

---

## 3. Deploy das edge functions

O runtime de functions do self-hosted lê os arquivos de
`supabase-project/volumes/functions/<nome-da-function>/index.ts`. Copie as
5 functions deste projeto para lá:

```bash
for fn in admin-create-user admin-delete-user admin-resend-invite admin-set-password admin-update-email; do
  mkdir -p supabase-project/volumes/functions/$fn
  cp supabase/functions/$fn/index.ts supabase-project/volumes/functions/$fn/index.ts
done
```

Reinicie o serviço de functions para carregar o código novo:

```bash
cd supabase-project && sh run.sh restart functions
```

Diferente do Supabase Cloud (que respeita `verify_jwt` por function no
`config.toml`), o self-hosted controla isso globalmente via
`FUNCTIONS_VERIFY_JWT` no `.env` — já orientado para `true` no passo 1, o
que é o comportamento correto aqui (as 5 functions exigem usuário
autenticado com papel `admin`/`rh`).

---

## 4. Configurar e publicar o frontend

Edite (ou crie a partir de `.env.example`) o `.env` **deste** repositório
apontando para o Supabase que você acabou de subir:

```env
VITE_SUPABASE_URL="https://api.seudominio.com.br"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY gerada no passo 1>"
```

Build e execução via Docker (já preparados no repo: `Dockerfile`,
`nginx/nginx.conf`, `docker-compose.yml`):

```bash
docker compose build
docker compose up -d
```

Isso builda o Vite com as variáveis do `.env` (elas são embutidas no bundle
em tempo de build — por isso vão como `--build-arg`, não como env de
runtime) e serve os arquivos estáticos via Nginx na porta definida em
`APP_PORT` (padrão `3000`).

Acesse `http://SEU_SERVIDOR:3000` para confirmar que subiu.

---

## 5. HTTPS e domínio (produção)

Coloque um proxy reverso na frente dos dois serviços (API do Supabase na
porta 8000 e o app na porta 3000), com Let's Encrypt. O próprio Supabase
self-hosted já traz overlays prontos de Caddy/Nginx:

```bash
# dentro de supabase-project, expõe a API com TLS automático
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Para o frontend, o caminho mais simples é um Caddy/Nginx próprio no host
(fora do Docker) fazendo proxy_pass para `localhost:3000`, ou adaptar o
`docker-compose.yml` deste repo para juntar-se ao mesmo Caddy da Supabase.
Garanta que `SITE_URL`/`API_EXTERNAL_URL`/`SUPABASE_PUBLIC_URL` (passo 1) e
`VITE_SUPABASE_URL` (passo 4) reflitam as URLs `https://` finais — Auth
usa essas URLs para montar links de convite/reset de senha.

---

## 6. Migrar dados do projeto atual na nuvem (opcional)

Se já existem fichas/usuários reais no projeto Supabase Cloud atual
(`mtpvcdqerkhmmpinotbe`), migre os dados **depois** de aplicar as migrations
no self-hosted (passo 2), para não haver conflito de schema:

```bash
# 1. Dump só dos dados (schema já foi recriado pelas migrations)
pg_dump "postgresql://postgres:[SENHA-CLOUD]@db.mtpvcdqerkhmmpinotbe.supabase.co:5432/postgres" \
  --data-only --schema=public \
  --exclude-table=schema_migrations \
  -f dados_producao.sql

# 2. Restaura no self-hosted
psql "postgresql://postgres:SENHA_DO_POSTGRES@SEU_SERVIDOR:5432/postgres" -f dados_producao.sql
```

Usuários de Auth (`auth.users`) não migram por `pg_dump` simples (Supabase
Cloud não expõe a senha com hash pelo dump padrão) — nesse caso, recrie os
usuários via `admin-create-user` (envia convite por e-mail) ou via
`auth.admin.createUser` apontando para o projeto self-hosted.

Arquivos do bucket `epi-assets` (assinaturas, catálogo de EPIs) precisam
ser baixados do Storage cloud e re-enviados ao Storage self-hosted — não
fazem parte do `pg_dump`.

---

## 7. Backups e manutenção

- **Backup diário do Postgres**: `pg_dump` agendado via cron para fora do
  servidor (S3/outro host). É o único dado realmente crítico — containers
  são descartáveis, o banco não.
- **Atualizações**: `docker compose pull && sh run.sh start` na pasta do
  Supabase, de tempos em tempos (acompanhe o changelog antes de atualizar
  em produção).
- **Firewall**: exponha publicamente só as portas 80/443 (proxy) — não
  exponha a porta 5432 do Postgres nem a 8000 do Kong diretamente à
  internet sem proxy/TLS na frente.
