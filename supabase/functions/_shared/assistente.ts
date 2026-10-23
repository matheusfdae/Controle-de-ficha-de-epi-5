// Assistente de ajuda (chat "Tirar dúvidas"): responde sobre o uso do sistema
// com base no manual abaixo, pelo Gemini (plano gratuito do Google AI Studio).
// Só vão para o Google a pergunta, o histórico da conversa e a tela aberta —
// nenhum dado de colaborador, ficha ou estoque. Sem imports: usado pela Edge
// Function (Deno) e pelo `npm run dev` (Node).

// Em ordem: se um modelo estiver sobrecarregado (503), no limite (429) ou for
// aposentado pelo Google (404), tenta o próximo. O "lite" basta para responder
// pelo manual e tem a cota gratuita maior.
export const MODELOS_GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-lite-latest'];
export const MAX_MENSAGENS = 20;
export const MAX_CARACTERES = 1500;

export interface MensagemChat {
  papel: 'usuario' | 'assistente';
  texto: string;
  /** Destino que o robô sabe mostrar (só na tela; não vai para a IA). */
  guia?: string | null;
}

/**
 * Pontos do sistema que o robô sabe mostrar (atributo data-guia na tela).
 * Itens do menu valem em qualquer tela; botões só na tela `rota` — para chegar
 * lá, o robô primeiro aponta o item `menu`.
 */
export interface AlvoGuia { id: string; rotulo: string; rota?: string; menu?: string }
export const ALVOS_GUIA: AlvoGuia[] = [
  { id: 'menu-dashboard', rotulo: 'Dashboard' },
  { id: 'menu-assinar', rotulo: 'Assinar (Tablet)' },
  { id: 'menu-vencimentos', rotulo: 'Vencimentos' },
  { id: 'menu-rank', rotulo: 'Fichas por Posto' },
  { id: 'menu-colaboradores-senior', rotulo: 'Colaboradores Senior' },
  { id: 'menu-nova-ficha-epi', rotulo: 'Nova Ficha EPI' },
  { id: 'menu-termo-coletivo', rotulo: 'Termo Coletivo EPI' },
  { id: 'menu-consultar-epi', rotulo: 'Consultar Fichas EPI' },
  { id: 'menu-nova-ficha-uniforme', rotulo: 'Nova Ficha Uniforme' },
  { id: 'menu-consultar-uniforme', rotulo: 'Consultar Fichas Uniforme' },
  { id: 'menu-crachas', rotulo: 'Painel de Crachás' },
  { id: 'menu-crachas-colaboradores', rotulo: 'Crachás › Colaboradores' },
  { id: 'menu-crachas-solicitar', rotulo: 'Solicitações' },
  { id: 'menu-crachas-gerar', rotulo: 'Gerar Crachás' },
  { id: 'menu-crachas-modelos', rotulo: 'Modelos de Crachá' },
  { id: 'menu-crachas-historico', rotulo: 'Histórico de Crachás' },
  { id: 'menu-crachas-relatorios', rotulo: 'Relatórios de Crachás' },
  { id: 'menu-crachas-config', rotulo: 'Config. de Crachás' },
  { id: 'menu-integracao', rotulo: 'Integração' },
  { id: 'menu-estoque', rotulo: 'Estoque' },
  { id: 'menu-funcoes', rotulo: 'Funções' },
  { id: 'menu-postos', rotulo: 'Postos' },
  { id: 'menu-modelos-ficha', rotulo: 'Modelos de Ficha' },
  { id: 'menu-configuracoes', rotulo: 'Configurações' },
  { id: 'menu-usuarios', rotulo: 'Usuários' },
  { id: 'btn-atualizar-senior', rotulo: 'botão "Atualizar da Senior"', rota: '/colaboradores', menu: 'menu-colaboradores-senior' },
  { id: 'btn-nova-ficha-buscar', rotulo: 'botão "Buscar" (busca o colaborador na Senior)', rota: '/nova-ficha', menu: 'menu-nova-ficha-epi' },
  { id: 'btn-nova-ficha-finalizar', rotulo: 'botão "Finalizar Ficha"', rota: '/nova-ficha', menu: 'menu-nova-ficha-epi' },
  { id: 'btn-estoque-entrada-nota', rotulo: 'botão "Entrada por nota"', rota: '/estoque', menu: 'menu-estoque' },
  { id: 'btn-estoque-entrada-manual', rotulo: 'botão "Entrada manual"', rota: '/estoque', menu: 'menu-estoque' },
  { id: 'btn-vencimentos-email', rotulo: 'botão "Enviar por e-mail" da convocação de uniforme', rota: '/vencimentos', menu: 'menu-vencimentos' },
  { id: 'btn-integracao-gerar', rotulo: 'botão "Gerar fichas" da Integração', rota: '/integracao', menu: 'menu-integracao' },
  { id: 'btn-integracao-email', rotulo: 'botão "Enviar por e-mail" da Integração', rota: '/integracao', menu: 'menu-integracao' },
  { id: 'aba-config-email', rotulo: 'aba "E-mail" das Configurações', rota: '/configuracoes', menu: 'menu-configuracoes' },
  { id: 'btn-novo-usuario', rotulo: 'botão "Novo Usuário"', rota: '/usuarios', menu: 'menu-usuarios' },
  { id: 'btn-crachas-atualizar-senior', rotulo: 'botão "Atualizar da Senior" dos crachás', rota: '/crachas/colaboradores', menu: 'menu-crachas-colaboradores' },
  { id: 'btn-crachas-adicionar', rotulo: 'botão "Adicionar" colaborador no crachá', rota: '/crachas/colaboradores', menu: 'menu-crachas-colaboradores' },
  { id: 'btn-crachas-validar-fotos', rotulo: 'botão "Validar Fotos" dos crachás', rota: '/crachas/colaboradores', menu: 'menu-crachas-colaboradores' },
  { id: 'btn-crachas-copiar-link', rotulo: 'botão "Copiar" o link público de solicitação de crachá', rota: '/crachas/solicitar', menu: 'menu-crachas-solicitar' },
  { id: 'btn-crachas-qrcode', rotulo: 'botão "Baixar QR Code" da solicitação de crachá', rota: '/crachas/solicitar', menu: 'menu-crachas-solicitar' },
  { id: 'btn-crachas-novo-modelo', rotulo: 'botão "Novo Modelo" de crachá', rota: '/crachas/modelos', menu: 'menu-crachas-modelos' },
];

/** Tira a marca [[guia:id]] da resposta e devolve o destino (só se existir no catálogo). */
export function separarGuia(texto: string): { texto: string; guia: string | null } {
  const m = /\[\[guia:\s*([a-z0-9-]+)\s*\]\]/i.exec(texto);
  const guia = m && ALVOS_GUIA.some(a => a.id === m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  return { texto: texto.replace(/\[\[guia:[^\]]*\]\]/gi, '').trim(), guia };
}

export class ErroAssistente extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export const MANUAL_SISTEMA = `
SISTEMA: EPI Manager do Grupo 5 Estrelas — controle de fichas de EPI e de uniforme,
termos coletivos, estoque, vencimentos e troca de uniforme, integração de
admitidos e crachás. Endereço: controle-de-uniforme-epi.grupo5estrelas.com.br.
Funciona no computador, no tablet e no celular (dá para instalar como app pelo
botão "Baixar app"; no iPhone/iPad: Compartilhar > Adicionar à Tela de Início).
Os colaboradores vêm da Senior (sistema de RH), atualizados sozinhos às 6h, 12h
e 18h. Empresas na Senior: 1 = 5 ESTRELAS SISTEMA DE SEGURANÇA LTDA (matriz,
matrículas começando com 1) e 3 = 5 ESTRELAS SERVIÇOS DE APOIO (matrículas
começando com 3).

ACESSO, PERMISSÕES E ESTADOS
- Cada usuário entra com o e-mail corporativo e a senha dele. Cada pessoa só vê no
  menu as telas que a permissão dela libera (ver, criar, editar, excluir por tela).
- Cada usuário também tem os ESTADOS (UF: DF, GO, MT...) que pode acessar. Fichas,
  estoque, funções, postos e colaboradores de outros estados ficam invisíveis
  para ele (vale também para administrador).
- Quem cadastra usuários, permissões e estados é o administrador/RH, na tela Usuários.
- Trocar a senha: o sistema pede a confirmação de identidade; a senha precisa de
  pelo menos 6 caracteres. Usuário novo recebe e-mail com link para criar a senha.
- Tema claro/escuro: botão de tema no topo. "Sair" fica no fim do menu.

MENU LATERAL

OPERACIONAL
- Dashboard: cartões "Total de Fichas", "Assinadas", "Pendentes" e "Colaboradores"
  (clicáveis: abrem Consultar Fichas já filtrada; "Colaboradores" abre
  Colaboradores Senior), gráfico das fichas geradas nos últimos 6 meses, status
  das fichas, status de vencimento, Top 5 EPIs mais entregues e "Alertas de
  Vencimento" (EPIs vencidos ou vencendo em 30 dias).
- Assinar (Tablet): lista das fichas pendentes para assinar NESTE dispositivo.
  Busca por nome ou função e botão "Atualizar". Toque na ficha, o colaborador
  marca os itens recebidos, faz a rubrica e (opcional) tira a selfie.
- Vencimentos ("Controle de Vencimentos"), duas abas:
  * EPIs: itens de EPI vencidos, próximos (30 dias) e em dia. A validade do EPI é
    a data da assinatura da ficha + "Validade do EPI (em dias)" de Configurações >
    Alertas (padrão 180 dias); o item pode ter data de validade própria.
  * Uniformes: duas abas internas.
    - Convocação: quem precisa trocar o uniforme (vencidos + vencendo em até 30
      dias; "Ver todos" mostra também os em dia). A troca é contada da
      assinatura da última ficha de uniforme do colaborador + o prazo do
      contrato do POSTO onde ele trabalha HOJE na Senior (achado pelo CPF ou
      matrícula; desligados na Senior ficam de fora; quem não está na Senior
      usa o posto da ficha). Filtros: busca, estado e tipo de contrato ("Troca
      obrigatória", "Troca flexível", "Posto sem análise"). Botões "Baixar
      Excel", "Imprimir" (lista com coluna de assinatura) e "Enviar por e-mail"
      (destinatários e cópia; "Ver prévia" mostra o e-mail sem enviar). A lista
      não mostra CPF.
    - Prazos por posto: prazo de troca de cada posto conforme o contrato.
      "Obrigatória" = o contrato exige a troca no prazo (ex.: 6 meses; atraso pode
      comprometer o faturamento). "Flexível" = o contrato prevê, mas a troca é
      feita conforme o uso (ex.: 12 meses). "Sem análise" = ainda não definido,
      usa 12 meses. Clique no posto para definir, ou busque (ex.: "SESI"),
      marque vários e use "Definir prazo". "Só os sem análise" mostra o que
      falta. Os postos com mais colaboradores aparecem primeiro. Só quem pode
      editar Configurações altera os prazos. Colaborador em posto fora do
      cadastro de Postos usa 12 meses até o posto ser cadastrado.
- Fichas por Posto: ranking com quantas fichas cada posto tem (assinadas,
  pendentes, colaboradores). Clique no posto para ver as fichas dele.
- Colaboradores Senior: lista dos colaboradores da Senior com filtros (nome,
  matrícula, CPF, cargo, posto, local ou centro de custo; estado; empresa MATRIZ/
  APOIO; admitido de/até; fichas: sem nenhuma ficha, com ficha, com ficha
  pendente; "Mostrar quem saiu da Senior (desligados)"; "Limpar filtros").
  "Baixar Excel". "Atualizar da Senior" (leva uns 2 minutos; só com permissão).
  "Comparação: fichas × colaboradores da Senior" mostra as fichas que não batem
  com ninguém ativo (pelo CPF, matrícula ou nome); há a procura do CPF na Senior
  (acha também demitidos). Visão por posto de trabalho e escalas. Em cada
  colaborador há o atalho "Nova ficha EPI com os dados da Senior".

EPI
- Nova Ficha EPI:
  1. Escolha o "Estado" da ficha (o estoque sai deste estado; não muda depois
     de salvar) e o "Modelo do documento".
  2. "Buscar na Senior por" Cadastro (nº da empresa + matrícula) ou CPF e
     clique em "Buscar": vêm nome, CPF, telefone, matrícula, cargo/função,
     posto, local, centro de custo, escala, turno e a EMPRESA do colaborador na
     Senior. Se existir no estado uma função com o nome do cargo, os EPIs padrão
     dela já entram. Se o colaborador não estiver "Trabalhando" na Senior,
     aparece um aviso. Sem Senior, dá para digitar tudo; a matrícula começando
     com 1 ou 3 já escolhe a empresa.
  3. Confira Motivo (admissão, substituição etc.), Turno (diurno/noturno),
     Posto e "Data de Entrega".
  4. Itens: "Adicionar" — escolha o item do catálogo (ou "Digitar manualmente"),
     quantidade, tamanho/nº e posto de serviço (vem da Senior).
  5. "Salvar como Pendente" ou "Finalizar Ficha". Ao finalizar, escolha como
     colher a assinatura: "Tablet" (vai para Assinar (Tablet) no dispositivo
     logado), "Desktop" (assina agora neste computador, no quadro "Assinaturas":
     funcionário + responsável pela entrega; a assinatura padrão da empresa
     pode vir preenchida) ou "Link via WhatsApp" (precisa do telefone; abre o
     WhatsApp Web com o link).
  Ao salvar, os itens saem do estoque do estado da ficha.
- Termo Coletivo EPI: termo de entrega para várias pessoas de uma vez. "Novo
  Termo": cabeçalho (POSTO, MÊS de referência, LÍDER, empresa, observações) e
  linhas (1 material por linha: colaborador, CPF, EPI/material, tamanho,
  quantidade). Depois, no termo, cada pessoa assina ("Assinar" no próprio
  aparelho ou "Copiar link público" para ela assinar no celular). "Finalizar"
  encerra o termo.
- Consultar Fichas EPI: fichas dos estados que você acessa. Busca por nome, CPF,
  matrícula, posto ou função; filtros de status (pendente/assinada), motivo e
  período (criada a partir de / criada até); "Limpar filtros". Em cada ficha:
  Visualizar, Baixar PDF, enviar/reenviar link de assinatura e Excluir ficha
  (o estoque dos itens volta automaticamente). Também há "Modelo Excel" e a
  importação de fichas por planilha.
- Visualizar ficha (abrir uma ficha): mostra a ficha no layout oficial, "Baixar
  PDF", "Editar Ficha" (dados e itens), assinatura presencial ("Assinar e
  Finalizar") para fichas pendentes, "Reenviar para assinatura", as
  "Assinaturas anteriores" e, só para Admin/RH, a "Comprovação da assinatura"
  (selfie, data e "Baixar comprovante"). As datas da ficha saem como DD/MM/AA.

UNIFORME
- Nova Ficha Uniforme e Consultar Fichas Uniforme: iguais às de EPI, para
  uniformes (o "Tipo de uniforme" é a função cadastrada em Funções).

ASSINATURA
- Toda assinatura (tablet, link ou presencial) é a rubrica na tela; a selfie do
  colaborador logo depois é OPCIONAL (o celular pede a câmera: tocar em
  "Permitir"). A selfie não vai na ficha nem no PDF; só Admin/RH a veem.
- Tela de assinatura (tablet ou link): o colaborador confere a ficha, marca os
  itens recebidos, assina em "Assine aqui" ("Limpar" apaga) e toca em
  "Confirmar Recebimento e Assinar". Depois pode baixar o PDF.
- Link de assinatura: vale 72 horas e funciona dentro e fora da rede da empresa.
  Se não abrir, a tela diz o motivo: "Ficha já assinada", "Link vencido" (gere
  outro), "Não foi possível carregar" (internet do celular; "Tentar de novo") ou
  "Link inválido" (link cortado ao copiar).
- Reenviar para Assinatura: qualquer ficha, mesmo assinada, pode ir de novo
  (botão na ficha ou ícone em Consultar Fichas), por WhatsApp, e-mail ou link
  copiado. Na ficha assinada é preciso informar o motivo; a assinatura atual NÃO
  é apagada: fica em "Assinaturas anteriores", e a ficha volta a Pendente até o
  colaborador assinar o link novo (links antigos deixam de valer). Use quando os
  itens de uma ficha assinada forem corrigidos.

CRACHÁS
- Painel de Crachás: total de colaboradores, crachás emitidos, pendentes e
  vencimento próximo, com atalhos "Gerar Crachás", "Ver pendentes", "Ver lista".
- Colaboradores: lista dos crachás. Espelha a Senior sozinho (admissões, mudança
  de cargo e desligamentos chegam automaticamente; "Atualizar da Senior" força).
  "Adicionar" inclui quem ainda não está na Senior. Filtros com/sem foto, foto
  acessível/inacessível e status da solicitação (recebida, em análise, aprovada,
  rejeitada). Por colaborador: Visualizar Crachá, Editar (nome, matrícula, CNV,
  CPF, tipo sanguíneo, nível de acesso, validade, telefone, local, foto, QR
  Code), Marcar em análise, Aprovar, Rejeitar (com motivo), Excluir. "Validar
  Fotos" só confere se as fotos abrem. A foto nova chega pela solicitação.
- Solicitações: pedidos feitos pelo link público ("Link de solicitação": Abrir,
  copiar, "Baixar QR Code"). Quem pede entra com a própria matrícula ou CPF,
  informa a matrícula ou o CPF de quem vai receber o crachá (dados da Senior),
  manda a foto (de frente, rosto inteiro, fundo claro, sem boné ou óculos
  escuros), motivo, tipo sanguíneo e telefone (para vigilante, a CNV é
  obrigatória). O RH compara "Foto atual" e "Foto enviada" e aprova, marca "Em
  análise" ou "Recusar" com motivo. Aprovada, a foto vira a do crachá e ele vai
  para Gerar Crachás.
- Gerar Crachás: escolha o "Modelo de Crachá", filtre e selecione os
  colaboradores, veja a pré-visualização (frente/verso) e "Baixar PNG", "Baixar
  PDF" ou "Imprimir". Layout do PDF: automático (máximo por folha A4) ou 4 por
  folha. "Ajustar fotos" (zoom e posição). "Trocar fundo das fotos para branco"
  é feito no navegador (suave/forte); "IA avançada" usa créditos.
- Modelos de Crachá: "Novo Modelo" (nome, tamanho em mm, imagem base opcional) e
  editor visual (arrastar campos, foto, logo, QR code, frente e verso).
- Histórico: lotes gerados, com status, "Ver Detalhes", "Confirmar Emissão"
  (atesta que os crachás foram revisados e entregues) e "Excluir Registro".
- Relatórios: colaboradores, com foto, crachás emitidos, sincronizações, por
  empresa e por cargo, com exportação em PDF.
- Config. de Crachás: impressão (DPI, tamanho, frente e verso, marcas de corte,
  vários por página), validade padrão e alerta de vencimento, prazo da
  solicitação (SLA, em dias úteis; passou dele = "Fora do Prazo"), notificações.

ADMINISTRAÇÃO
- Integração: admitidos dos últimos dias na Senior, com a situação das fichas
  (sem ficha, aguardando assinatura, assinada). Filtros: período, estado, busca,
  "Só quem ainda não tem ficha". "Selecionar todos da lista", "Selecionar todos
  sem ficha", "Limpar seleção" e "Gerar fichas": cria de uma vez as fichas de
  EPI e de uniforme da admissão (com os EPIs padrão da função), pendentes de
  assinatura (aparecem em Assinar (Tablet) e em Consultar Fichas). "Cadastro
  manual" / "Novo colaborador" para quem ainda não está na Senior. "Enviar por
  e-mail" manda a lista dos participantes da integração (data, destinatários,
  cópia, observação; com planilha).
- Estoque: escolha o estado no topo; abas EPIs, Uniformes, Fornecedores e
  Relatório, e gráfico de movimentação (7, 30, 90 dias ou 12 meses).
  * Lista: item, código, C.A., estoque no estado, Mínimo e Status ("OK",
    "Crítico" = saldo igual ou abaixo do mínimo, "Sem estoque" = saldo 0).
  * "Cadastrar EPI/Uniforme": nome, código, nº do CA (o cadastro vale para todos
    os estados; o estoque é separado por estado).
  * Clique no item: saldo por tamanho (editar a quantidade registra a
    movimentação), "Adicionar tamanho" (vazio = ÚNICO), "Estoque mínimo em <UF>"
    (0 = não avisar), "Transferir" para outro estado, "Resetar" (zera o item no
    estado) e excluir o item.
  * "Entrada por nota": importe o PDF do DANFE ou o XML da NF-e (ou digite):
    número, série, data, fornecedor (pelo CNPJ), itens; avisa "NOTA DUPLICADA"
    se a nota já foi lançada. "Entrada manual": item a item, com o estado que
    recebe e o motivo. "Registrar entrada" soma no estoque; "Últimas entradas"
    lista o que foi lançado.
  * Fornecedores: razão social, CNPJ (é pelo CNPJ que a nota é ligada ao
    fornecedor), o que fornece, ativo/inativo.
  * Relatório: movimentações (entrada, saída, devolução, descarte) com filtros e
    "Exportar CSV".
  * As fichas dão baixa automática; excluir uma ficha devolve os itens.
- Funções: cargos/tipos de uniforme e os EPIs padrão de cada um, POR ESTADO
  (escolha o estado no topo). "Nova função"; clique na função para renomear
  ("Nome da função" > "Salvar nome"; só muda naquele estado; as fichas já feitas
  guardam o nome antigo; mantenha igual ao cargo da Senior para a ficha nova
  escolher os EPIs sozinha) e para adicionar/remover EPIs padrão (item, tamanho
  opcional, quantidade). "Copiar de outro estado" cria cópias independentes.
- Postos: cadastro dos postos com o mapa. "Novo posto" (nome, estado, colar
  coordenadas do Google Maps ou clicar no mapa, latitude/longitude, endereço,
  "Outros nomes nas fichas" separados por vírgula: fichas com esses nomes contam
  para o posto). "Importar das fichas" cria os postos que aparecem nas fichas;
  importação da planilha GEO; "Só os sem localização". Clique na estrela do mapa
  para ver as fichas do posto.
- Modelos de Ficha: layout do PDF das fichas — nome, logo própria (opcional,
  para outra empresa), título do documento, texto do termo de responsabilidade
  e da declaração, cabeçalho completo ou compacto (siglas A/S/D/P/C), coluna
  extra (C.A. ou Tamanho/Nº), logo dos dois lados, seção extra com 3 linhas de
  assinatura, Ativo e "Definir como padrão".
- Configurações: abas Empresa (dados que aparecem no cabeçalho e no PDF),
  Empresas (lista para escolher na ficha), Logo, Assinatura (assinatura padrão
  do responsável pela entrega), Carimbo ("Tirar o fundo"), Alertas ("Dias de
  antecedência para alerta" e "Validade do EPI (em dias)") e E-mail:
  * Conta do Microsoft 365 que envia os e-mails ("Conectar conta" por código;
    "Enviar como" caixa compartilhada, ex.: naoresponda@grupo5estrelas.com.br).
  * "E-mail da convocação de uniforme": destinatários, cópia, estados, envio
    automático semanal no dia escolhido às 7h.
  * "E-mail do relatório de estoque": destinatários, cópia, estados, envio
    automático semanal, "Enviar agora" (planilha completa por estado e tamanho e
    destaque dos itens sem estoque ou críticos) e "Pedido de reposição
    automático": quando o saldo do item no estado chega ao mínimo, os
    destinatários recebem em até 15 minutos um e-mail pedindo a reposição (um
    aviso por vez: só avisa de novo depois que o estoque for reposto e cair).
- Usuários (só administrador): "Novo Usuário" (nome, e-mail corporativo, papel,
  estados que pode acessar, link de definição de senha por e-mail ou senha
  temporária), editar, permissões por tela (matriz ver/criar/editar/excluir;
  trocar o papel reaplica as permissões padrão), reenviar convite, definir senha
  manualmente e excluir usuário.

SOBRE O SISTEMA
- Feito pela equipe de Modernização do Grupo 5 Estrelas; roda no servidor da
  própria empresa, com backup diário automático e cópia na nuvem.
- Os e-mails saem pelo Microsoft 365 da empresa. O assistente (este chat) usa o
  Gemini, do Google, e não recebe dados de colaboradores, fichas ou estoque.

DÚVIDAS COMUNS
- Não vejo uma tela no menu: falta permissão; peça ao administrador em Usuários.
- Não vejo fichas/estoque/colaboradores de um estado: o estado não está liberado
  no seu usuário (tela Usuários > estados).
- Colaborador não aparece: confira se está ativo na Senior; a lista atualiza 3x
  ao dia (ou "Atualizar da Senior"). Admitido muito recente pode levar horas.
- A ficha não escolheu os EPIs sozinha: a função do estado precisa ter o mesmo
  nome do cargo da Senior (tela Funções) e ter EPIs padrão.
- Item com status "Crítico": o saldo chegou ao mínimo do estado; dê entrada no
  estoque ou ajuste o mínimo.
- A data de troca de uniforme parece errada: confira o prazo do posto em
  Vencimentos > Uniformes > Prazos por posto e se o colaborador está no posto
  certo na Senior.
- Assinatura pelo link não abriu: reenvie o link pela ficha (WhatsApp).
- Erro ao abrir uma tela: "Recarregar página"; se continuar, mande o print ao
  administrador do sistema.
`.trim();

const INSTRUCOES = `Você é o assistente de ajuda do EPI Manager. Responda em português do Brasil,
de forma curta e prática (passo a passo numerado quando for o caso). Responda
qualquer pergunta sobre o sistema: como usar cada tela, o que cada botão faz, as
regras (vencimento, troca de uniforme, estoque crítico, permissões, estados),
mensagens de erro e o que fazer. Use o manual abaixo como fonte; pode juntar
partes dele para responder. Perguntas sobre os assuntos do sistema (EPI, C.A.,
NR-6, ficha de entrega, uniforme, crachá) podem ter uma explicação geral curta,
dizendo que é orientação geral e que a regra da empresa é com o RH/SESMT. Se a
resposta não estiver no manual, diga que não sabe e sugira falar com o
administrador do sistema — não invente telas, botões ou regras. Não peça nem
trate dados pessoais (CPF, nomes, matrículas) e não consulte dados: você não vê
as fichas, o estoque nem os colaboradores. Assuntos fora do sistema: diga
gentilmente que só ajuda com o EPI Manager.

O sistema tem um robô que leva o usuário até o lugar certo. Quando a resposta
envolver ir a uma tela ou clicar num dos pontos da lista DESTINOS, termine a
resposta com uma linha contendo só [[guia:ID]], com o ID do destino FINAL (um
só; o robô cuida do caminho, passando pelo menu sozinho). Se a resposta termina
num botão ou aba que está na lista (ids btn-... e aba-...), use esse id, e não
o do menu. Ex.: entrada de nota fiscal → btn-estoque-entrada-nota; link ou QR
Code de solicitação de crachá → btn-crachas-copiar-link. Se nenhum
destino servir, não coloque a marca.
Nunca invente IDs.

DESTINOS:
${ALVOS_GUIA.map(a => `${a.id} = ${a.rotulo}${a.rota ? ` (na tela ${a.rota})` : ' (menu lateral)'}`).join('\n')}

MANUAL:
${MANUAL_SISTEMA}`;

/** Limpa o histórico recebido do navegador (tamanho, papéis, última = usuário). */
export function normalizarConversa(v: unknown): MensagemChat[] {
  const lista = (Array.isArray(v) ? v : [])
    .map((m: any) => ({
      papel: m?.papel === 'assistente' ? 'assistente' : 'usuario',
      texto: String(m?.texto ?? '').trim().slice(0, MAX_CARACTERES),
    }) as MensagemChat)
    .filter(m => m.texto)
    .slice(-MAX_MENSAGENS);
  while (lista.length && lista[0].papel !== 'usuario') lista.shift();
  return lista;
}

export async function perguntarAssistente(chave: string, conversa: MensagemChat[], pagina?: string): Promise<string> {
  if (!conversa.length || conversa[conversa.length - 1].papel !== 'usuario') {
    throw new ErroAssistente('Escreva uma pergunta', 400);
  }
  const tela = pagina ? `

O usuário está na tela: ${String(pagina).slice(0, 100)}` : '';
  const pedido = JSON.stringify({
    systemInstruction: { parts: [{ text: INSTRUCOES + tela }] },
    contents: conversa.map(m => ({ role: m.papel === 'usuario' ? 'user' : 'model', parts: [{ text: m.texto }] })),
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });
  let ultimo = 0;
  for (const modelo of MODELOS_GEMINI) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: pedido,
    });
    const corpo: any = await res.json().catch(() => ({}));
    ultimo = res.status;
    if ([404, 429, 500, 503].includes(res.status)) continue;
    if ((res.status === 400 || res.status === 403) && /API key|permission/i.test(corpo?.error?.message ?? '')) {
      throw new ErroAssistente('Chave do Gemini inválida. Avise o administrador.', 503);
    }
    if (!res.ok) throw new ErroAssistente(`O assistente não respondeu (${res.status}). Tente de novo.`);
    const texto = (corpo?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim();
    if (!texto) throw new ErroAssistente('O assistente não conseguiu responder. Reformule a pergunta.');
    return texto;
  }
  if (ultimo === 429) throw new ErroAssistente('Muitas perguntas agora (limite gratuito do Google). Tente de novo em 1 minuto.', 429);
  throw new ErroAssistente('O assistente está indisponível no momento (Google sobrecarregado). Tente de novo em alguns minutos.', 503);
}
