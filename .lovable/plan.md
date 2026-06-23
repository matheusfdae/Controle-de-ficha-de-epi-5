# Plano de Implementação

Vou dividir em 5 frentes, todas mantendo o padrão visual atual e usando migrações Supabase para mudanças de banco.

## 1. Autocomplete progressivo na Nova Ficha

- Manter um cache em memória (estado do componente `NovaFicha`/`TermoColetivoNovo`) com os últimos valores digitados na sessão (colaborador → posto, empresa, função, turno).
- Ao montar a tela, carregar do Supabase os últimos N registros de `fichas_epi` (ordenados por `created_at desc`) para servir como histórico.
- Ao digitar/selecionar **Colaborador**, buscar:
  1. Primeiro no cache de sessão.
  2. Depois no histórico do Supabase (último uso).
  E preencher Posto, Empresa, Função, Turno automaticamente.
- Usar componente `<Input>` comum (editável) com sugestão via `<datalist>` ou `Command` do shadcn — campo nunca trava.

## 2. Renomear "Setor" → "Posto"

- **Migração SQL:** renomear coluna `setor_snapshot` em `fichas_epi` para `posto_snapshot`; renomear `setor` em `profiles` para `posto` (se existir). Atualizar funções/trigger que referenciem.
- **Front:** substituir todas as labels "Setor" por "Posto" em `NovaFicha`, `ConsultarFichas`, `VisualizarFicha`, `FichaOficialView`, `Dashboard`, filtros, PDF (`pdfService`).
- Atualizar `EPIFicha.setor` → `EPIFicha.posto` em `types/epi.ts` e service `fichaService`.

## 3. Gestão de usuários (admin)

Na tela `Usuarios.tsx`:
- **Redefinir senha:** criar Edge Function `admin-reset-password` que usa Service Role para `auth.admin.updateUserById({password})` + setar `must_change_password = true`. Botão chama a função.
- **Excluir usuário:** Edge Function `admin-delete-user` com `auth.admin.deleteUser(id)` + modal `AlertDialog` de confirmação.
- **Definir papel:** seletor (`Select` shadcn) com opções `admin`, `rh`, `supervisor`, `colaborador`. Persistir em `user_roles` (upsert/delete).

Todas as ações protegidas: a Edge Function valida que quem chama tem role `admin`.

## 4. Assinatura via WhatsApp (Ficha + Termo vinculado)

- **Migração:**
  - Adicionar `ficha_epi_id` (FK obrigatório) em `termos_entrega_epi`.
  - Tabela `assinaturas` (ficha_epi_id, tipo `'ficha'|'termo'`, item_id, assinante, data_hora, ip).
  - View ou função `progresso_assinatura(ficha_id)` retornando `assinados / total`.
  - RPC `assinar_combo_publico(_token, _assinatura, ...)` que assina o item da ficha **e** o item correspondente do termo na mesma transação.
- **Front:**
  - Em `VisualizarFicha`, botão **"Compartilhar no WhatsApp"** que copia link `wa.me/?text=<link público>`.
  - Página pública unificada `/assinar/:token` mostrando Ficha + Termo lado a lado, com fluxo sequencial (próximo item até zerar).
  - Indicador de progresso "Líder – 3 de 5 itens assinados".
  - Link invalida automaticamente quando `assinados == total` (RPC retorna erro `link_encerrado`).

## 5. Botão "Voltar"

- Criar componente `<BackButton />` (ícone `ArrowLeft` + texto) usando `navigate(-1)`.
- Adicionar no topo de telas internas: `NovaFicha`, `VisualizarFicha`, `ConsultarFichas`, `TermoColetivoNovo`, `TermoColetivoView`, `TermosColetivos`, `Estoque`, `Funcoes`, `Usuarios`, `Vencimentos`, `Configuracoes`, `Integracao`, `AssinaturasPendentes`.

---

## Detalhes técnicos

**Migrações:**
1. `rename_setor_para_posto.sql` — RENAME COLUMN em `fichas_epi` e `profiles`; recriar funções afetadas.
2. `assinatura_whatsapp.sql` — FK em `termos_entrega_epi`, nova tabela `assinaturas` + RLS + GRANTs, RPC `assinar_combo_publico`, RPC `get_combo_publico(_token)`.

**Edge Functions** (`verify_jwt = true`, validam role `admin` em código):
- `admin-reset-password`
- `admin-delete-user`
- `admin-set-role`

**Frontend novo/alterado:**
- `src/components/BackButton.tsx` (novo)
- `src/components/AutocompleteInput.tsx` (novo, baseado em `Command` shadcn)
- `src/pages/AssinarCombo.tsx` (novo, página pública combinada)
- `src/pages/Usuarios.tsx` (reset/delete/role)
- `src/pages/NovaFicha.tsx`, `TermoColetivoNovo.tsx` (autocomplete + Posto)
- `src/pages/VisualizarFicha.tsx` (botão WhatsApp + progresso)
- `src/types/epi.ts`, `src/services/fichaService.ts`, `src/services/pdfService.ts` (Posto)
- `src/App.tsx` (rota `/assinar/:token`)
- Outras telas internas: adicionar `<BackButton />`.

## Pontos para confirmar

1. **Roles:** mantemos os atuais (`admin`, `rh`, `supervisor`, `colaborador`) ou criar exatamente `admin`, `gestor`, `comum` como você citou? Sugiro mapear `gestor → rh` e `comum → colaborador` para não quebrar dados existentes.
2. **Termo de Recebimento de Material:** já usamos `termos_entrega_epi` (individual) e `termos_epi_coletivos` (coletivo). O vínculo obrigatório com a Ficha de EPI vale para **os dois** ou apenas o individual?
3. **Autocomplete:** o histórico do Supabase deve considerar **todas as fichas** ou apenas as criadas pelo usuário logado?

Posso seguir com esses defaults (manter roles atuais com mapeamento, vincular ambos os termos à ficha, histórico global) se preferir não responder agora.
