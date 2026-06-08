# EPI Sign Link

Sistema web para gestão de fichas de entrega de EPIs (Equipamentos de Proteção Individual) e uniformes, com assinatura digital via link público e geração de PDF.

---

## Funcionalidades

- **Fichas de EPI** — criação, edição, visualização e exclusão de fichas de entrega
- **Assinatura digital** — colaborador assina via link público (sem login), com captura de IP e data/hora
- **Geração de PDF** — exporta a ficha assinada em A4 paisagem com logo, termos legais e tabela de itens
- **Controle de estoque** — cadastro e movimentação de EPIs e uniformes com datas de validade
- **Alertas de vencimento** — painel dedicado para itens próximos do vencimento
- **Dashboard** — gráficos de fichas por mês, top EPIs e resumo de status
- **Importação em lote** — importa fichas a partir de planilha Excel (.xlsx)
- **Controle de acesso por role** — 5 níveis: `admin`, `rh`, `supervisor`, `colaborador`, `operador`
- **PWA** — instalável como app em dispositivos móveis

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript |
| Build | Vite 5 + SWC |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Roteamento | React Router DOM 6 |
| Cache / fetch | TanStack React Query 5 |
| Formulários | React Hook Form + Zod |
| PDF | jsPDF |
| Assinatura | signature_pad |
| Excel | XLSX |
| Gráficos | Recharts |
| Package manager | Bun (com fallback npm) |

---

## Estrutura de pastas

```
src/
├── pages/           # Páginas de rota (Dashboard, NovaFicha, ConsultarFichas…)
├── components/      # Componentes de UI e layout (AppLayout, SignaturePad…)
├── services/        # Lógica de negócio desacoplada da UI
│   ├── fichaService.ts    # CRUD de fichas e itens
│   ├── pdfService.ts      # Geração do PDF em seções independentes
│   ├── estoqueService.ts  # CRUD de estoque de EPIs e uniformes
│   └── configService.ts   # Configurações da empresa (localStorage)
├── contexts/        # AuthContext — autenticação e controle de roles
├── hooks/           # Custom hooks React
├── integrations/    # Supabase client + tipos gerados automaticamente
└── types/           # Tipos do domínio (EPIFicha, EPIItem, MotivoEntrega…)
```

---

## Configuração

### Pré-requisitos

- Node.js 18+ ou [Bun](https://bun.sh)
- Projeto no [Supabase](https://supabase.com) configurado

### Variáveis de ambiente

Crie um arquivo `.env` na raiz com as credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

### Instalação e desenvolvimento

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento
npm run dev

# Build de produção
npm run build
```

---

## Roles e permissões

| Role | Acesso |
|---|---|
| `admin` | Acesso total — configurações, usuários, estoque, funções, integração |
| `rh` | Mesmo acesso que admin (isAdmin = true) |
| `supervisor` | Consulta de fichas, assinaturas pendentes, vencimentos |
| `colaborador` | Consulta de fichas próprias |
| `operador` | Acesso básico |

A hierarquia é resolvida pela ordem: `admin → rh → supervisor → colaborador`.

---

## Geração de PDF

O PDF é gerado inteiramente no cliente via jsPDF em formato A4 paisagem. A função `generatePDF` orquestra seções independentes:

1. **Header** — logo da empresa + título do documento
2. **Dados do funcionário** — nome, motivo, turno, função, fone
3. **Termo de Responsabilidade** — texto legal + Base Legal NR1/NR6
4. **Declaro** — declaração complementar do colaborador
5. **Assinaturas** — assinatura do colaborador e da empresa
6. **Tabela de itens** — EPIs/uniformes entregues com coluna de devolução
7. **Rodapé** — observações, status da ficha e data de geração

---

## Assinatura via link público

Fichas podem ser assinadas sem login através do link `/assinar/:id`. O fluxo:

1. Colaborador acessa o link compartilhado (WhatsApp/e-mail)
2. Revisa os itens e assina no campo de assinatura
3. O sistema chama a RPC `assinar_ficha_publica` (SECURITY DEFINER) no Supabase
4. IP, data e assinatura são registrados; ficha muda para status `assinada`

---

## Decisões técnicas relevantes

- **Upsert + delete de órfãos** — ao salvar itens de uma ficha, primeiro faz upsert (preservando dados) e depois remove apenas os itens que foram excluídos. Evita perda de dados que ocorreria com a abordagem delete-all + insert.
- **Lazy loading de páginas** — todas as 16 páginas são carregadas sob demanda (`React.lazy`), reduzindo o bundle inicial.
- **React Query com staleTime** — configurado com `staleTime: 60s` para evitar refetches desnecessários ao navegar entre páginas.
- **Tipos Supabase gerados** — `fichaService` usa `Database['public']['Tables']` diretamente, eliminando tipos `any` nos mappers de DB.
- **setTimeout(0) no AuthContext** — padrão obrigatório do Supabase: chamar métodos do Supabase dentro do listener `onAuthStateChange` de forma síncrona causa deadlock; o defer resolve isso.
