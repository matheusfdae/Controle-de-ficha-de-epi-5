# Checklist de implantação — hospedagem interna

Lista de tudo que precisa ser feito, em ordem, para o sistema rodar 100%
internamente (frontend + Supabase self-hosted + Clerk para autenticação).
Referências completas em [SELF_HOSTING.md](../SELF_HOSTING.md) e
[hospedagem-interna.md](hospedagem-interna.md).

## 0. Clerk (autenticação)

- [ ] App criado em dashboard.clerk.com
- [ ] Sign-up público desligado (User & Authentication → Restrictions) —
      cadastro é só por convite de admin/RH
- [ ] Integração nativa "Supabase" habilitada (Integrations)
- [ ] Webhook criado (`user.created`/`user.updated`/`user.deleted`) apontando
      para `.../functions/v1/clerk-webhook`, `Signing Secret` anotado
- [ ] `Publishable Key` (`pk_...`) e `Secret Key` (`sk_...`) anotadas

## 1. Infraestrutura (VM)

- [X ] Abrir chamado de infra com a especificação de [hospedagem-interna.md](hospedagem-interna.md)
- [ ] VM criada: Ubuntu Server 22.04/24.04 LTS, mín. 2 vCPU/4GB (recomendado 4 vCPU/8GB), 20-50GB disco
- [ ] IP fixo atribuído à VM
- [ ] Acesso root/sudo confirmado
- [ ] Portas liberadas na rede interna: `3000` (app) e `8000` (API/Studio Supabase)
- [ ] Porta `5432` (Postgres) confirmada como **não exposta** fora da VM
- [ ] (Opcional) Registros DNS internos criados: `epi.interno...` e `api-epi.interno...`

## 2. Preparar a VM

- [ ] Instalar Docker Engine
- [ ] Instalar Docker Compose v2 (`docker compose version`)
- [ ] Instalar `git`
- [ ] Testar acesso de saída à internet (baixar imagens Docker)

## 3. Subir o Supabase self-hosted

- [ ] `git clone --depth 1 https://github.com/supabase/supabase`
- [ ] Copiar `supabase/docker/*` para pasta `supabase-project`
- [ ] Gerar chaves: `sh utils/generate-keys.sh` e `sh utils/add-new-auth-keys.sh`
- [ ] Editar `.env` da `supabase-project`:
  - [ ] `POSTGRES_PASSWORD` (senha forte, nunca a de exemplo)
  - [ ] `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` (login do Studio)
  - [ ] `SUPABASE_PUBLIC_URL`
  - [ ] `API_EXTERNAL_URL`
  - [ ] `SITE_URL` (URL pública do frontend)
  - [ ] `FUNCTIONS_VERIFY_JWT=false` (Bearer agora é JWT do Clerk, não do Supabase)
- [ ] `docker compose pull`
- [ ] `sh run.sh start`
- [ ] Confirmar acesso ao Studio em `http://SEU_SERVIDOR:8000`
- [ ] Guardar em local seguro: `ANON_KEY` e `SERVICE_ROLE_KEY` gerados
- [ ] Habilitar Third-Party Auth (Clerk) no serviço `auth`/GoTrue (ver
      [SELF_HOSTING.md](../SELF_HOSTING.md#habilitar-o-third-party-auth-clerk-no-gotrue))

## 4. Aplicar o schema do projeto

- [ ] Rodar `./scripts/apply-migrations.sh` deste repositório contra o Postgres
      recém-criado (`DATABASE_URL=postgresql://postgres:SENHA@SEU_SERVIDOR:5432/postgres`)
- [ ] Confirmar no Studio que as tabelas existem (`fichas_epi`, `profiles`, `user_roles` etc.)
- [ ] Confirmar que o bucket de storage `epi-assets` foi criado

## 5. Deploy das Edge Functions

- [ ] Copiar `_shared/clerk.ts` e as 6 functions para
      `supabase-project/volumes/functions/<nome>/index.ts`:
  - [ ] `_shared/clerk.ts`
  - [ ] `admin-create-user`
  - [ ] `admin-delete-user`
  - [ ] `admin-resend-invite`
  - [ ] `admin-set-password`
  - [ ] `admin-update-email`
  - [ ] `clerk-webhook`
- [ ] Adicionar ao `.env` da `supabase-project`: `CLERK_SECRET_KEY` e
      `CLERK_WEBHOOK_SECRET` (passo 0)
- [ ] Reiniciar o serviço: `sh run.sh restart functions`

## 6. Deploy do frontend

- [ ] Criar `.env` deste repositório (a partir do `.env.example`) apontando para o
      Supabase self-hosted e o Clerk:
  - [ ] `VITE_SUPABASE_URL="https://api.seudominio..."`
  - [ ] `VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY do passo 3>"`
  - [ ] `VITE_CLERK_PUBLISHABLE_KEY="<Publishable Key do passo 0>"`
- [ ] `docker compose build`
- [ ] `docker compose up -d`
- [ ] Confirmar acesso em `http://SEU_SERVIDOR:3000`

## 7. Primeiro usuário admin

- [ ] Criar o usuário direto no dashboard do Clerk (Users → Create user)
- [ ] Confirmar que o webhook `user.created` provisionou `profiles`/`user_roles`
      (`colaborador`) — ou inserir manualmente via SQL Editor do Studio se o
      webhook ainda não estiver no ar (ver [SELF_HOSTING.md](../SELF_HOSTING.md))
- [ ] Rodar no SQL Editor do Studio, usando o `profiles.id` (não o id do
      Clerk):
      `update user_roles set role = 'admin' where user_id = '<profiles.id>';`
- [ ] Validar login como admin e acesso às telas administrativas

## 8. HTTPS e domínio (produção)

- [ ] Subir proxy com TLS para a API da Supabase (ex.: overlay `docker-compose.caddy.yml`)
- [ ] Configurar proxy reverso (Caddy/Nginx) para o frontend (`proxy_pass` → `localhost:3000`)
- [ ] Confirmar que `SITE_URL`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` (passo 3) e
      `VITE_SUPABASE_URL` (passo 6) usam as URLs `https://` finais
- [ ] Atualizar a URL do webhook do Clerk (passo 0) para a URL final da API
- [ ] Testar fluxo de login/senha esquecida (embutido no `<SignIn/>` do Clerk)

## 9. Migrar dados do projeto cloud atual (se aplicável)

- [ ] `pg_dump` só de dados do projeto cloud (`mtpvcdqerkhmmpinotbe`), excluindo `schema_migrations`
- [ ] Restaurar (`psql`) no Postgres self-hosted
- [ ] Importar usuários em lote no Clerk (bulk import da API do Clerk) e rodar
      script pontual preenchendo `profiles.clerk_user_id` por e-mail
- [ ] Baixar arquivos do bucket `epi-assets` (cloud) e reenviar ao Storage self-hosted

## 10. Backup e manutenção

- [ ] Configurar `pg_dump` agendado (cron) para fora do servidor (S3/outro host)
- [ ] Definir rotina de atualização: `docker compose pull && sh run.sh start`
- [ ] Confirmar firewall: só 80/443 (proxy) expostos publicamente, nunca 5432 ou 8000 direto

## 11. Validação final

- [ ] Criar uma ficha de EPI de teste ponta a ponta (criação → assinatura → consulta)
- [ ] Testar upload/visualização de assinatura (Storage)
- [ ] Testar convite de novo usuário (Edge Function `admin-create-user`)
- [ ] Testar geração de PDF/Excel de ficha
- [ ] Confirmar que o app carrega corretamente via HTTPS/domínio interno final

## 12. Convite por e-mail com publicMetadata.role (edit/view)

Gate separado do sistema de papéis do Postgres (`admin`/`rh`/`supervisor`/
`almoxarife`/`colaborador`), usado só pela Edge Function `admin-invite-user`
e pela tela `/convites`. São passos manuais no painel do Clerk, este
repositório não tem UI para eles:

- [ ] Copiar `admin-invite-user` para `supabase-project/volumes/functions/`
      (mesmo processo do passo 5) e reiniciar o serviço de functions
- [ ] Adicionar ao `.env` da `supabase-project`: `INVITE_ALLOWED_EMAIL_DOMAIN`
      (padrão `grupo5estrelas.com.br`) e `APP_PUBLIC_URL` (padrão
      `https://app.grupo5estrelas.com.br`) — só precisa setar se for diferente
      do padrão do código
- [ ] No dashboard do Clerk, habilitar **Restricted/Invitations only**
      (User & Authentication → Restrictions) — sem isso, o `<SignUp/>` da rota
      `/aceitar-convite` aceitaria cadastro mesmo sem um convite válido
- [ ] Para cada pessoa que pode enviar convites: dashboard do Clerk → Users →
      selecionar o usuário → Metadata → adicionar `{"role": "edit"}` em
      **Public metadata** (sem isso, `/convites` fica escondida e
      `admin-invite-user` responde 403 pra essa pessoa)
- [ ] Testar ponta a ponta: logar como um usuário com `role: "edit"`, acessar
      `/convites`, enviar convite para um e-mail `@grupo5estrelas.com.br` de
      teste, abrir o e-mail recebido, confirmar que o link cai em
      `/aceitar-convite?__clerk_ticket=...` e que dá pra definir senha e logar
      em seguida
- [ ] Confirmar que um e-mail fora do domínio é rejeitado pelo endpoint (400)
- [ ] Confirmar que um usuário sem `role: "edit"` recebe 403 ao chamar
      `admin-invite-user` diretamente (nem precisa da tela pra isso)
