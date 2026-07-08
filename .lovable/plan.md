
## Objetivo

Transformar a tela **Usuários** em uma central de gestão real de acessos: cadastro por e-mail corporativo (com link para definir a senha), papéis com hierarquia clara e permissões marcáveis por módulo (Ver / Criar / Editar / Excluir).

---

## 1. Convite por e-mail corporativo

- Novo cadastro passa a pedir apenas **Nome + E-mail corporativo + Papel + Permissões**. O campo de senha é opcional (usado só se o admin quiser definir manualmente).
- Ao salvar, o backend cria o usuário e envia um e-mail com **link seguro para definir a senha** no primeiro acesso (usando o sistema de e-mails autenticação do Lovable Cloud, com o domínio corporativo).
- Botão "Reenviar convite" em cada card, para casos em que o e-mail não chegou ou o link expirou.
- Marcamos `must_change_password = true` até o usuário concluir.
- (O código OTP de 6 dígitos que você também marcou fica como plano B — implementamos o link primeiro por ser o padrão mais seguro/estável. Se quiser, adiciono OTP depois.)

## 2. Novo papel Almoxarife + hierarquia

Enum de papéis passa a ser:

```text
admin > rh > supervisor > almoxarife > colaborador
```

Presets padrão de acesso:

| Papel        | Acesso padrão                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| admin        | Tudo                                                                          |
| rh           | Usuários, Integração, Fichas (EPI/Uniforme), Vencimentos, Rank, Dashboard     |
| supervisor   | Fichas do próprio time, Vencimentos, Rank, Dashboard                          |
| almoxarife   | Estoque, Nova Ficha, Consultar Fichas, Vencimentos, Dashboard (sem Usuários)  |
| colaborador  | Só o que é dele (assinar fichas)                                              |

O menu lateral e as rotas passam a respeitar essas permissões (não só `isAdmin`).

## 3. Permissões marcáveis por módulo

No cadastro/edição do usuário, aparece uma matriz de checkboxes:

```text
Módulo             | Ver | Criar | Editar | Excluir
-------------------+-----+-------+--------+--------
Dashboard          | [x] |  —    |   —    |   —
Fichas EPI         | [x] | [x]   | [x]    | [ ]
Fichas Uniforme    | [x] | [x]   | [x]    | [ ]
Estoque            | [x] | [ ]   | [ ]    | [ ]
Vencimentos        | [x] |  —    |   —    |   —
Integração         | [ ] | [ ]   | [ ]    | [ ]
Funções            | [ ] | [ ]   | [ ]    | [ ]
Usuários           | [ ] | [ ]   | [ ]    | [ ]
Configurações      | [ ] |  —    | [ ]    |   —
Rank por Posto     | [x] |  —    |   —    |   —
Termos Coletivos   | [x] | [ ]   | [ ]    | [ ]
```

Ao escolher um papel, os checkboxes já vêm marcados com o preset — o admin pode ajustar caso a caso.

## 4. Melhorias na tela Usuários

- Cards mais compactos com badge do papel (cor por papel).
- Ações por card: **Editar**, **Reenviar convite**, **Trocar senha manualmente**, **Excluir**.
- Modal único de "Editar usuário" com abas: **Dados** e **Permissões**.
- Confirmação clara antes de excluir (com aviso de dependências).

---

## Detalhes técnicos

- Migration SQL:
  - `ALTER TYPE app_role ADD VALUE 'almoxarife'`.
  - Tabela `user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)` com RLS: leitura para o próprio usuário e admin/RH; escrita só admin/RH. GRANTs para `authenticated` e `service_role`.
  - Função `has_permission(_user_id, _module, _action)` `SECURITY DEFINER`.
- Edge Function `admin-create-user` passa a:
  - Aceitar `permissions[]` no body.
  - Se `password` vier vazio → chamar `auth.admin.inviteUserByEmail` (usa o template de e-mail do Lovable Cloud).
  - Persistir permissões em `user_permissions`.
- Nova edge function `admin-resend-invite` para o botão de reenvio.
- Front:
  - `src/pages/Usuarios.tsx` refeita com a nova UX (lista + modal com abas).
  - Novo componente `PermissionsMatrix.tsx`.
  - `AuthContext` expõe `permissions` e helper `can(module, action)`.
  - `AppSidebar` e rotas passam a usar `can('modulo', 'view')` em vez de só `isAdmin`.
- E-mail: usar o sistema de e-mails do Lovable Cloud com o seu domínio (`compras@grupo5estrelas.com.br` ou outro que você indicar). Se ainda não houver domínio configurado, abro o setup do domínio de e-mail antes.

---

## Fora do escopo desta etapa
- OTP de 6 dígitos (fica pronto para adicionar depois).
- Log de auditoria de ações administrativas.
- Filtros/busca na listagem (você disse que não precisa).

Confirma que posso seguir com essa implementação? Se sim, também preciso saber **qual domínio de e-mail você quer usar para enviar os convites** (ex.: `grupo5estrelas.com.br`).
