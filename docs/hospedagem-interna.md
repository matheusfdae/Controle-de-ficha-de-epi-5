# Hospedagem interna do sistema — plano e chamado de VM

Decisão: hospedar o sistema 100% internamente (frontend + Supabase self-hosted:
Postgres, Auth, Storage e Edge Functions), sem depender do Supabase Cloud.

O passo a passo completo de deploy já está em [SELF_HOSTING.md](../SELF_HOSTING.md)
(clonar o `docker-compose.yml` oficial da Supabase, gerar chaves, aplicar as
migrations deste repo, copiar as Edge Functions, buildar o frontend com o
`Dockerfile`/`docker-compose.yml` daqui, migrar dados do projeto cloud atual
`mtpvcdqerkhmmpinotbe`, configurar backup e HTTPS).

Este documento é a especificação para abrir o chamado de criação da VM.

---

## Especificação da VM — chamado de infra

### Sistema operacional
- Linux Ubuntu Server 24.04 LTS (ou 22.04 LTS), 64 bits
- Acesso root/sudo para quem for instalar

### Recursos de hardware

| Recurso | Mínimo | Recomendado |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 4 GB | 8 GB |
| Disco | 20 GB | 40-50 GB (SSD) |

Justificativa: a stack sobe vários serviços em containers simultaneamente —
Postgres, autenticação (GoTrue), API REST (PostgREST), Realtime, Storage,
gateway (Kong), painel admin (Studio) e as Edge Functions — além do próprio
frontend. O recomendado dá folga para crescimento de dados/uploads e picos de
uso sem risco de OOM.

### Software pré-instalado (ou permissão para instalar)
- Docker Engine (versão atual)
- Docker Compose v2 (plugin `docker compose`, não o `docker-compose` antigo)
- `git`
- Nenhum outro runtime é necessário — Node, Postgres etc. rodam dentro dos containers

### Rede / Firewall
- IP fixo (estático) na rede interna — obrigatório
- Portas a liberar somente na rede interna (nunca expor à internet diretamente):
  - `3000` — frontend da aplicação (ou `80`/`443` se houver proxy reverso)
  - `8000` — API/gateway da Supabase (Kong) e Studio (painel admin)
- Portas que não devem ser expostas fora da própria VM/rede interna:
  - `5432` (Postgres) — acesso só local ou por túnel
- Saída para internet (outbound) liberada, ao menos durante a instalação, para
  baixar imagens Docker (`docker.io`, `ghcr.io`) e pacotes do Ubuntu

### DNS (opcional, recomendado)
- Dois registros no DNS interno apontando para o IP da VM:
  - `epi.interno.suaempresa.com.br` → app
  - `api-epi.interno.suaempresa.com.br` → API da Supabase
- Facilita HTTPS depois e evita depender de IP fixo nas configurações do app

### Backup
- Incluir a VM na política de snapshot diário existente, se houver
- O backup crítico real é o dump do Postgres, agendado via cron dentro da
  própria VM (ver seção 7 do `SELF_HOSTING.md`)

### Observação para quem for provisionar
Esta VM vai hospedar o Supabase self-hosted (banco de dados, autenticação e
storage) e o frontend do sistema de EPI — não é um simples servidor web
estático, por isso os requisitos de RAM/CPU acima do "básico".

---

## Próximos passos após a VM ser criada
1. Instalar Docker + Docker Compose na VM
2. Seguir os passos 1-4 do `SELF_HOSTING.md` (subir Supabase self-hosted,
   aplicar migrations, deploy das Edge Functions, build/deploy do frontend)
3. Migrar dados do projeto cloud atual (passo 6 do `SELF_HOSTING.md`)
4. Configurar backup diário e HTTPS (passo 7 do `SELF_HOSTING.md`)
