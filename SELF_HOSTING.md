# Self-hosting completo (frontend + Supabase)

Este guia cobre a hospedagem 100% própria da ferramenta: banco de dados,
storage e edge functions rodando no seu servidor (via Supabase self-hosted,
Docker), além do frontend React/Vite. **Autenticação é feita pelo Clerk**
(não pelo GoTrue/Supabase Auth) — o Supabase valida o JWT do Clerk via
"Third-Party Auth" e serve só como banco de dados.

Pré-requisito: um servidor Linux (VPS ou on-premise) com Docker e Docker
Compose v2 instalados, pelo menos 2 vCPU / 4 GB RAM, uma conta no
[Clerk](https://clerk.com) e (recomendado) um domínio apontando para o
servidor para configurar HTTPS.

---

## 0. Configurar o app no Clerk

1. Crie uma aplicação em [dashboard.clerk.com](https://dashboard.clerk.com).
2. Em **User & Authentication → Restrictions**, desligue o sign-up público
   — o cadastro deste sistema é só por convite de admin/RH
   (`admin-create-user`).
3. Em **Integrations**, habilite a integração nativa **Supabase** — isso
   configura o JWT do Clerk no formato que o Supabase Third-Party Auth
   espera, automaticamente.
4. Em **Webhooks**, crie um endpoint apontando para
   `https://api.seudominio.com.br/functions/v1/clerk-webhook` (ajuste para
   a URL da sua API Supabase self-hosted), com os eventos `user.created`,
   `user.updated`, `user.deleted`. Guarde o **Signing Secret** (`whsec_...`).
5. Em **API Keys**, anote a `Publishable Key` (`pk_...`, pública) e a
   `Secret Key` (`sk_...`, nunca vai para o frontend nem para o git).

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
| `FUNCTIONS_VERIFY_JWT` | `false` — o Authorization Bearer que chega nas edge functions agora é um JWT do **Clerk**, não do Supabase; o gate global de verify_jwt do self-hosted rejeitaria esse token antes mesmo de chamar a função. Cada uma das 5 funções `admin-*` e o `clerk-webhook` já validam a identidade/assinatura por conta própria (ver passo 3) |

Suba a stack:

```bash
sh run.sh start
```

### Habilitar o Third-Party Auth (Clerk) no GoTrue

O self-hosted precisa aceitar o JWT do Clerk para popular `auth.uid()`/
`auth.jwt()` no Postgres (usado pelas RLS policies via
`public.current_profile_id()`, ver migration
`supabase/migrations/20260717120000_clerk_auth_migration.sql`). A forma
exata de configurar isso no serviço `auth` (GoTrue) do self-hosted muda
com a versão da stack — consulte a documentação atual de
["Third-Party Auth" da Supabase](https://supabase.com/docs/guides/auth/third-party/clerk)
para a variável de ambiente/config correta do seu `docker-compose.yml` do
GoTrue (tipicamente aponta para o domínio JWKS do seu app Clerk). Reinicie
o serviço `auth` depois de aplicar.

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

> **Primeiro usuário admin**: como o cadastro é só por convite (self-signup
> desligado no Clerk, passo 0) e `admin-create-user` exige um admin/RH
> já existente, o bootstrap do primeiro usuário é manual:
> 1. Crie o usuário direto no **dashboard do Clerk** (Users → Create user),
>    com e-mail e senha.
> 2. O webhook `user.created` (passo 3) provisiona `profiles`/`user_roles`
>    automaticamente como `colaborador` assim que ele existir no Clerk — ou,
>    se o webhook ainda não estiver no ar, insira manualmente:
>    ```sql
>    insert into profiles (clerk_user_id, email, nome_completo, ativo)
>      values ('<user_xxx do Clerk>', '<email>', '<nome>', true)
>      returning id;
>    insert into user_roles (user_id, role) values ('<id retornado acima>', 'colaborador');
>    ```
> 3. Promova a admin via SQL:
>    ```sql
>    update user_roles set role = 'admin' where user_id = '<id de profiles.id, não o do Clerk>';
>    ```

---

## 3. Deploy das edge functions

O runtime de functions do self-hosted lê os arquivos de
`supabase-project/volumes/functions/<nome-da-function>/index.ts`. Copie as
5 functions `admin-*`, o `clerk-webhook` **e** a pasta `_shared` (usada por
todas elas) para lá:

```bash
for fn in admin-create-user admin-delete-user admin-resend-invite admin-set-password admin-update-email clerk-webhook; do
  mkdir -p supabase-project/volumes/functions/$fn
  cp supabase/functions/$fn/index.ts supabase-project/volumes/functions/$fn/index.ts
done
mkdir -p supabase-project/volumes/functions/_shared
cp supabase/functions/_shared/clerk.ts supabase-project/volumes/functions/_shared/clerk.ts
```

Adicione ao `.env` da `supabase-project` (usado como secrets pelas
functions):

```env
CLERK_SECRET_KEY="sk_..."          # passo 0, item 5
CLERK_WEBHOOK_SECRET="whsec_..."   # passo 0, item 4
```

Reinicie o serviço de functions para carregar o código novo:

```bash
cd supabase-project && sh run.sh restart functions
```

Como já orientado no passo 1, `FUNCTIONS_VERIFY_JWT` deve ficar `false` —
o Bearer que chega agora é do Clerk, e cada função (`admin-*` via
`verifyCaller()`, `clerk-webhook` via assinatura Svix) já valida a
identidade/origem por conta própria em `supabase/functions/_shared/clerk.ts`.

---

## 4. Configurar e publicar o frontend

Edite (ou crie a partir de `.env.example`) o `.env` **deste** repositório
apontando para o Supabase que você acabou de subir:

```env
VITE_SUPABASE_URL="https://api.seudominio.com.br"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY gerada no passo 1>"
VITE_CLERK_PUBLISHABLE_KEY="<Publishable Key do passo 0, item 5>"
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
`VITE_SUPABASE_URL` (passo 4) reflitam as URLs `https://` finais, e que a
URL do webhook do Clerk (passo 0, item 4) aponte para a URL final da API.

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

Usuários não migram junto com o `pg_dump` (senhas não são exportáveis e,
de qualquer forma, a identidade agora é gerenciada pelo Clerk, não pelo
Postgres): importe-os em lote no Clerk (endpoint de bulk import da API do
Clerk) e depois rode um script pontual que preenche
`profiles.clerk_user_id` casando por e-mail — só então cada usuário
consegue logar de novo.

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
