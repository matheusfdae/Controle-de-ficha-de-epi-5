// Alerta de pedido de material por WhatsApp (função alertar-pedidos-whatsapp):
// cada posto tem um dia do mês previsto para pedir; 2 dias antes e no dia, quem
// fez pedido daquele posto pelo link nos últimos 90 dias recebe o lembrete com o
// link. Se o posto já pediu perto da data, não manda. Puro: testado no vitest.
import { numeroWhatsApp } from './whatsapp.ts';

export const DIAS_ANTES = 2;
/** Pedido feito a partir de (data prevista - JANELA) conta como o pedido do mês. */
export const JANELA_JA_PEDIU = 5;
/** Quem pediu pelo link nos últimos N dias recebe o alerta. */
export const DIAS_CONTATOS = 90;

export type Momento = 'antes' | 'dia';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => iso(new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10) + n)));
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Data prevista no mês de `ano-mes` (mês 1-12); mês mais curto usa o último dia. */
export function previstaNoMes(dia: number, ano: number, mes: number): string {
  const d = Math.min(dia, ultimoDia(ano, mes));
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Próxima data prevista a partir de hoje (inclusive). */
export function proximaPrevista(dia: number, hoje: string): string {
  const ano = +hoje.slice(0, 4), mes = +hoje.slice(5, 7);
  const neste = previstaNoMes(dia, ano, mes);
  if (neste >= hoje) return neste;
  return mes === 12 ? previstaNoMes(dia, ano + 1, 1) : previstaNoMes(dia, ano, mes + 1);
}

/** Hoje é dia de alerta? 'antes' = DIAS_ANTES antes da data; 'dia' = na própria data. */
export function alertaDeHoje(dia: number | null | undefined, hoje: string, diasAntes = DIAS_ANTES): { data: string; momento: Momento } | null {
  if (!dia) return null;
  const data = proximaPrevista(dia, hoje);
  if (data === hoje) return { data, momento: 'dia' };
  if (somarDias(data, -diasAntes) === hoje) return { data, momento: 'antes' };
  return null;
}

/** O posto já fez o pedido deste mês (algum pedido não cancelado de data - janela até hoje)? */
export function jaPediu(pedidos: { data_pedido: string; status: string }[], data: string, hoje: string, janela = JANELA_JA_PEDIU): boolean {
  const desde = somarDias(data, -janela);
  return pedidos.some(p => p.status !== 'cancelada' && p.data_pedido >= desde && p.data_pedido <= hoje);
}

/** De onde veio o número: Senior, digitado no link, corrigido na tela ou adicionado à mão. */
export type OrigemContato = 'senior' | 'link' | 'corrigido' | 'manual';
/**
 * `chave` identifica a pessoa para os ajustes da tela (id da Senior, ou o número
 * digitado quando o pedido não tem a pessoa da Senior); contato adicionado não tem chave.
 */
export interface Contato { chave: string | null; nome: string; numero: string; ultimo: string | null; origem: OrigemContato; ajusteId?: string }

export interface PedidoContato {
  solicitante_nome: string | null; solicitante_telefone: string | null; data_pedido: string;
  solicitante_senior_id?: string | null; senior_telefone?: string | null;
}

/**
 * Quem pediu pelo link nos últimos `dias` dias, uma linha por pessoa (pelo id da
 * Senior; sem ele, pelo número digitado), com o nome do pedido mais recente. Número:
 * o celular da Senior; se lá não houver celular válido, o mais recente digitado no link.
 */
export function contatosDoPosto(pedidos: PedidoContato[], hoje: string, dias = DIAS_CONTATOS): Contato[] {
  const desde = somarDias(hoje, -dias);
  const pessoas = new Map<string, Contato>();
  for (const p of [...pedidos].sort((a, b) => b.data_pedido.localeCompare(a.data_pedido))) {
    if (p.data_pedido < desde) continue;
    const doLink = numeroWhatsApp(p.solicitante_telefone);
    const daSenior = numeroWhatsApp(p.senior_telefone);
    const chave = p.solicitante_senior_id ?? doLink;
    if (!chave) continue;
    const atual = pessoas.get(chave);
    if (atual) {
      // Pedido mais antigo da mesma pessoa: só completa o número se ainda faltar.
      if (!atual.numero && doLink) { atual.numero = doLink; atual.origem = 'link'; }
      continue;
    }
    pessoas.set(chave, { chave, nome: (p.solicitante_nome ?? '').trim(), numero: daSenior ?? doLink ?? '', ultimo: p.data_pedido, origem: daSenior ? 'senior' : 'link' });
  }
  // Uma mensagem por número (duas pessoas com o mesmo celular recebem uma só).
  const vistos = new Set<string>();
  return [...pessoas.values()].filter(c => c.numero && !vistos.has(c.numero) && vistos.add(c.numero));
}

export interface AjusteContato { id: string; acao: 'corrigir' | 'remover' | 'adicionar'; chave: string | null; nome: string | null; numero: string | null }

/**
 * Aplica os ajustes da tela: corrige o número ou tira a pessoa da lista e soma os
 * contatos adicionados. Devolve quem recebe e quem foi tirado (para a tela mostrar).
 */
export function aplicarAjustes(contatos: Contato[], ajustes: AjusteContato[]): { recebem: Contato[]; removidos: Contato[] } {
  const recebem: Contato[] = [];
  const removidos: Contato[] = [];
  for (const c of contatos) {
    const a = ajustes.find(x => x.chave && x.chave === c.chave);
    if (a?.acao === 'remover') removidos.push({ ...c, ajusteId: a.id });
    else if (a?.acao === 'corrigir' && a.numero) recebem.push({ ...c, numero: a.numero, origem: 'corrigido', ajusteId: a.id });
    else recebem.push(c);
  }
  for (const a of ajustes.filter(x => x.acao === 'adicionar' && x.numero)) {
    recebem.push({ chave: null, nome: a.nome ?? '', numero: a.numero!, ultimo: null, origem: 'manual', ajusteId: a.id });
  }
  const vistos = new Set<string>();
  return { recebem: recebem.filter(c => !vistos.has(c.numero) && vistos.add(c.numero)), removidos };
}

export interface UltimoPedido { codigo: string; data: string }

/** Pedido mais recente (não cancelado) do posto, para citar no lembrete. */
export function ultimoPedido(pedidos: { codigo?: string | null; data_pedido: string; status: string }[]): UltimoPedido | null {
  const p = pedidos.filter(x => x.codigo && x.status !== 'cancelada')
    .sort((a, b) => b.data_pedido.localeCompare(a.data_pedido) || b.codigo!.localeCompare(a.codigo!))[0];
  return p ? { codigo: p.codigo!, data: p.data_pedido } : null;
}

const dataBr = (d: string) => d.split('-').reverse().join('/');
const primeiroNome = (n: string) => {
  const p = n.trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/**
 * Texto do lembrete (WhatsApp: *negrito*). 'manual' = enviado pelo botão da tela:
 * cita a próxima data prevista, se o posto tiver uma (sem data: "precisa ser feito").
 */
export function mensagemAlerta(a: {
  nome: string; posto: string; data: string | null; momento: Momento | 'manual'; link: string | null; ultimo?: UltimoPedido | null;
}): string {
  const ola = primeiroNome(a.nome) ? `Olá, ${primeiroNome(a.nome)}!` : 'Olá!';
  const quando = !a.data ? 'precisa ser feito'
    : a.momento === 'dia' ? `é *hoje (${dataBr(a.data)})*` : `está previsto para *${dataBr(a.data)}*`;
  const link = a.link ? `${a.link.replace(/\/+$/, '')}/pedido-material` : null;
  return `${ola} Aqui é do Grupo 5 Estrelas.\n\n`
    + `Lembrete: o pedido de material de limpeza do posto *${a.posto}* ${quando}.\n\n`
    + (a.ultimo ? `Último pedido deste posto: *${a.ultimo.codigo}*, feito em ${dataBr(a.ultimo.data)}.\n\n` : '')
    + (link ? `Faça o pedido por este link, com a sua matrícula ou CPF:\n${link}\n\n` : 'Faça o pedido pelo link do pedido de material, com a sua matrícula ou CPF.\n\n')
    + 'Se já fez o pedido, pode desconsiderar esta mensagem.\n\n'
    + '_Salve este número nos seus contatos para o link ficar clicável._';
}

/** Lembrete do Termo de EPI: a cada LEMBRETE_DIAS dias, no máximo LEMBRETE_MAX vezes, só em horário comercial. */
export const LEMBRETE_DIAS = 2;
export const LEMBRETE_MAX = 3;
const HORARIO_LEMBRETE = { de: 8, ate: 18 }; // horas de Brasília

/** Situação do termo para o lembrete: sem termo/linhas, assinaturas faltando ou quantidade faltando. */
export interface SituacaoTermo { linhas: number; assinadas: number; finalizado: boolean }

/** Hora (0–23) em Brasília. */
export const horaBrasilia = (agora: Date) => Number(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }));

/** O pedido (já avisado uma vez) deve receber outro lembrete agora? */
export function lembreteTermoDevido(a: { ultimoEnvio: string | null; lembretes: number; termo: SituacaoTermo | null; agora: Date }): boolean {
  if (!a.ultimoEnvio || a.lembretes >= LEMBRETE_MAX || a.termo?.finalizado) return false;
  const h = horaBrasilia(a.agora);
  if (h < HORARIO_LEMBRETE.de || h >= HORARIO_LEMBRETE.ate) return false;
  return a.agora.getTime() - Date.parse(a.ultimoEnvio) >= LEMBRETE_DIAS * 864e5;
}

/** O que falta no termo, para o lembrete. */
export function faltaNoTermo(t: SituacaoTermo | null): string {
  if (!t || t.linhas === 0) return 'ainda não tem nenhum colaborador';
  const faltam = t.linhas - t.assinadas;
  if (faltam > 0) return `ainda tem *${faltam} assinatura${faltam > 1 ? 's' : ''}* faltando`;
  return 'ainda não tem a quantidade entregue inteira distribuída';
}

/** Aviso ao líder: pedido com EPI atendido, o Termo de EPI está pronto para as assinaturas (ou lembrete). */
export function mensagemTermoEpi(a: {
  nome: string; codigo: string; posto: string; epis: string[]; link: string | null; lembrete?: { termo: SituacaoTermo | null } | null;
}): string {
  const ola = primeiroNome(a.nome) ? `Olá, ${primeiroNome(a.nome)}!` : 'Olá!';
  const link = a.link ? `${a.link.replace(/\/+$/, '')}/pedido-material` : null;
  const corpo = a.lembrete
    ? `*Lembrete:* o Termo de EPI do pedido *${a.codigo}* do posto *${a.posto}* ${faltaNoTermo(a.lembrete.termo)}.\n\n`
      + 'Entregue o EPI e colha a assinatura de cada colaborador para concluir o termo.\n\n'
    : `O pedido *${a.codigo}* do posto *${a.posto}* foi atendido e tem EPI`
      + (a.epis.length ? ` (${a.epis.join(', ')})` : '') + '.\n\n'
      + 'O *Termo de EPI* já está disponível: entregue o EPI e colha a assinatura de cada colaborador.\n\n';
  return `${ola} Aqui é do Grupo 5 Estrelas.\n\n`
    + corpo
    + (link ? `Abra por este link, com a sua matrícula ou CPF, na aba *Termo de EPI*:\n${link}\n\n`
      : 'Abra o link do pedido de material, com a sua matrícula ou CPF, na aba *Termo de EPI*.\n\n')
    + '_Salve este número nos seus contatos para o link ficar clicável._';
}
