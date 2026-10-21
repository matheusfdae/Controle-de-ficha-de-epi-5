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
estoque, vencimentos, integração de admitidos e crachás. Os colaboradores vêm da
Senior (sistema de RH), atualizados automaticamente 3 vezes por dia.

MENU LATERAL (cada pessoa só vê o que a permissão dela libera):

OPERACIONAL
- Dashboard: resumo das fichas (status, vencimentos, EPIs mais entregues). Os
  cartões são clicáveis: "Pendentes" abre Consultar Fichas só com as pendentes,
  "Assinadas" só com as assinadas, "Total de Fichas" todas, e "Colaboradores"
  abre Colaboradores Senior.
- Assinar (Tablet): fichas aguardando assinatura. O colaborador assina no tablet:
  primeiro a rubrica na tela; depois é tirada uma selfie de comprovação.
- Vencimentos: EPIs e uniformes vencidos ou a vencer, com abas EPIs e Uniformes.
  Na parte de uniformes há a "Convocação para troca de uniforme": lista por posto,
  que pode ser baixada em Excel, impressa ou enviada por e-mail (botão de e-mail,
  com destinatários e cópia). A lista não mostra CPF.
- Fichas por Posto: ranking de fichas por posto de trabalho.
- Colaboradores Senior: lista de colaboradores vindos da Senior, com filtros
  (empresa, posto, situação) e comparação com as fichas (quem tem/não tem ficha).
  Botão "Atualizar da Senior" (leva uns 2 minutos) para quem tem permissão; a
  atualização também roda sozinha às 6h, 12h e 18h.

EPI
- Nova Ficha EPI: busque o colaborador pela matrícula ou CPF (os dados vêm da
  Senior: nome, cargo, posto), escolha o modelo do documento, adicione os itens
  (EPI, tamanho, quantidade) e salve. Depois a ficha pode ser assinada no tablet
  ou por link (enviado por WhatsApp). Ao salvar, os itens saem do estoque.
- Termo Coletivo EPI: termo de entrega de EPI para várias pessoas de uma vez
  (uma linha por material); cada pessoa assina pelo link público.
- Consultar Fichas EPI: busca por nome, matrícula, CPF, posto ou número, com
  filtros de estado, status (assinada/pendente), motivo e período, e "Limpar
  filtros". Ícones para visualizar, baixar PDF, enviar link de assinatura por
  WhatsApp e excluir.

ASSINATURA
- Toda assinatura (tablet, link ou presencial) é a rubrica + uma selfie do
  colaborador tirada logo depois (o celular pede para usar a câmera: tocar em
  "Permitir"). A selfie não aparece na ficha nem no PDF; só admin/RH a veem no
  quadro "Comprovação da assinatura" da ficha, com comprovante em PDF.
- Link de assinatura (WhatsApp): vale 72 horas e funciona dentro e fora da rede
  da empresa. Se não abrir, a tela diz o motivo: "Ficha já assinada", "Link
  vencido" (gere outro), "Não foi possível carregar" (internet do celular;
  "Tentar de novo") ou "Link inválido" (link cortado ao copiar).
- Reenviar para Assinatura: qualquer ficha, mesmo já assinada, pode ser enviada
  de novo (botão na ficha ou ícone do WhatsApp em Consultar Fichas). Na ficha
  assinada é preciso informar o motivo; a assinatura atual NÃO é apagada: fica
  em "Assinaturas anteriores" na própria ficha, e a ficha volta a Pendente até o
  colaborador assinar o link novo. Use quando os itens de uma ficha assinada
  precisarem ser corrigidos, pois a assinatura antiga não vale para o conteúdo
  alterado.

UNIFORME
- Nova Ficha Uniforme e Consultar Fichas Uniforme: iguais às de EPI, para uniformes.

CRACHÁS
- Painel de Crachás: indicadores (colaboradores, fotos, crachás emitidos, vencimentos).
- Colaboradores: lista dos crachás. Espelha a Senior automaticamente (admissões,
  mudança de cargo e desligamentos chegam sozinhos); quem ainda não está na
  Senior pode ser incluído pelo botão "Adicionar". Aqui se cadastra a foto e os
  dados do crachá (validade, RG, tipo sanguíneo, CNV etc.), e há "Validar Fotos".
- Solicitações: fila dos pedidos de crachá (1ª ou 2ª via) feitos no link
  público (copiar link ou baixar o QR Code no topo da tela). Qualquer
  colaborador ativo pode pedir: entra com a própria matrícula e CPF, informa a
  matrícula ou o CPF de quem vai receber o crachá (os dados vêm da Senior) e
  manda foto e motivo. O RH vê quem pediu, compara a foto atual com a enviada
  e aprova ou recusa (com motivo); aprovada, a foto nova vira a do crachá e ele
  vai para Gerar Crachás.
- Gerar Crachás: escolha o modelo e os colaboradores, gere PDF/PNG para imprimir.
  A troca do fundo da foto por branco é feita no próprio navegador.
- Modelos de Crachá: editor visual (arrastar campos, foto, logo, QR code, frente e verso).
- Histórico: lotes de crachás gerados, com confirmação de impressão.
- Relatórios e Config. de Crachás (impressão, validade padrão, notificações).

ADMINISTRAÇÃO
- Integração: admitidos recentes da Senior. Selecione e clique em "Gerar fichas"
  para criar de uma vez as fichas de EPI e de uniforme da admissão (prontas para
  assinar no tablet ou pelo link). Quem ainda não está na Senior entra em
  "Cadastro manual". Também envia por e-mail a lista dos participantes da
  integração (com planilha Excel).
- Estoque: abas EPIs, Uniformes, Fornecedores e Relatório. "Entrada" registra
  entrada pela nota fiscal (importando PDF/XML da nota ou digitando) ou entrada
  manual item a item com motivo. As fichas dão baixa automática.
- Funções: cargos/tipos de uniforme e os EPIs padrão de cada um, POR ESTADO:
  escolha o estado no topo da tela; cada estado tem as suas funções e editar a
  de um estado não muda a dos outros. "Copiar de outro estado" cria cópias
  independentes (com os EPIs padrão) para começar um estado novo. Na Nova Ficha
  e na Integração só aparecem as funções do estado da ficha/colaborador.
- Postos: cadastro dos postos com localização no mapa.
- Modelos de Ficha: layout do PDF das fichas (título, textos, colunas, logos).
- Configurações: dados e lista das empresas, logo, carimbo, assinatura padrão,
  alertas de vencimento e E-mail (conta do Microsoft 365 que envia os e-mails).
- Usuários (só admin/RH): cadastrar usuários, convites, senhas e a matriz de
  permissões por tela (ver, criar, editar, excluir).

DÚVIDAS COMUNS
- Não vejo uma tela no menu: falta permissão; peça ao administrador/RH em Usuários.
- Colaborador não aparece: confira se está ativo na Senior; a lista atualiza 3x
  ao dia (ou "Atualizar da Senior"). Admitido muito recente pode levar algumas horas.
- Só vejo colaboradores de alguns estados: o acesso é limitado por estado (UF)
  no cadastro do usuário.
- Assinatura pelo link não abriu: reenvie o link pela tela da ficha (WhatsApp).
- Login: o acesso é pela conta do sistema; para trocar a senha é pedida a
  confirmação de identidade.
`.trim();

const INSTRUCOES = `Você é o assistente de ajuda do EPI Manager. Responda em português do Brasil,
de forma curta e prática (passo a passo quando for o caso), só sobre como usar o
sistema, com base no manual abaixo. Se a resposta não estiver no manual, diga que
não sabe e sugira falar com o administrador do sistema ou com o RH — não invente
telas, botões ou regras. Não peça nem trate dados pessoais (CPF, nomes,
matrículas). Não responda sobre assuntos fora do sistema.

O sistema tem um robô que leva o usuário até o lugar certo. Quando a resposta
envolver ir a uma tela ou clicar num dos pontos da lista DESTINOS, termine a
resposta com uma linha contendo só [[guia:ID]], com o ID do destino FINAL (um
só; o robô cuida do caminho, passando pelo menu sozinho). Se a resposta termina
num botão ou aba que está na lista (ids btn-... e aba-...), use esse id, e não
o do menu. Ex.: entrada de nota fiscal → btn-estoque-entrada-nota. Se nenhum
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
