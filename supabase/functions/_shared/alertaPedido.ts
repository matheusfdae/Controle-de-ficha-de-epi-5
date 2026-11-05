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

export interface Contato { nome: string; numero: string; ultimo: string }

/** Quem pediu pelo link nos últimos `dias` dias: um por celular válido, com o nome do pedido mais recente. */
export function contatosDoPosto(pedidos: { solicitante_nome: string | null; solicitante_telefone: string | null; data_pedido: string }[],
  hoje: string, dias = DIAS_CONTATOS): Contato[] {
  const desde = somarDias(hoje, -dias);
  const porNumero = new Map<string, Contato>();
  for (const p of [...pedidos].sort((a, b) => b.data_pedido.localeCompare(a.data_pedido))) {
    if (p.data_pedido < desde) continue;
    const numero = numeroWhatsApp(p.solicitante_telefone);
    if (!numero || porNumero.has(numero)) continue;
    porNumero.set(numero, { nome: (p.solicitante_nome ?? '').trim(), numero, ultimo: p.data_pedido });
  }
  return [...porNumero.values()];
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
export function mensagemAlerta(a: { nome: string; posto: string; data: string | null; momento: Momento | 'manual'; link: string | null }): string {
  const ola = primeiroNome(a.nome) ? `Olá, ${primeiroNome(a.nome)}!` : 'Olá!';
  const quando = !a.data ? 'precisa ser feito'
    : a.momento === 'dia' ? `é *hoje (${dataBr(a.data)})*` : `está previsto para *${dataBr(a.data)}*`;
  const link = a.link ? `${a.link.replace(/\/+$/, '')}/pedido-material` : null;
  return `${ola} Aqui é do Grupo 5 Estrelas.\n\n`
    + `Lembrete: o pedido de material de limpeza do posto *${a.posto}* ${quando}.\n\n`
    + (link ? `Faça o pedido por este link, com a sua matrícula ou CPF:\n${link}\n\n` : 'Faça o pedido pelo link do pedido de material, com a sua matrícula ou CPF.\n\n')
    + 'Se já fez o pedido, pode desconsiderar esta mensagem.';
}
