import { ABERTOS, STATUS_PEDIDO, nomeMaterial, type Material, type PedidoCompleto, type StatusPedido } from './pedidosService';

/**
 * Cálculos do Painel Gerencial (só quantidade), a partir dos pedidos já
 * carregados. "No mês" = pedidos feitos no mês (data do pedido).
 */

const doMes = (data: string | null | undefined, mes: string) => !!data && data.slice(0, 7) === mes;
const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
const media = (v: number[]) => (v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null);
const validos = (p: PedidoCompleto) => p.status !== 'cancelada';
/** Entregue = quantidade atendida (ou a conferida, enquanto não foi atendido). */
const qtdItem = (i: PedidoCompleto['itens'][number]) => i.quantidade_atendida ?? i.quantidade;
/** Compras entregou menos (ou diferente) do que foi conferido em algum item. */
export const entregaParcial = (p: PedidoCompleto) => p.status === 'atendida' && p.itens.some(i => i.quantidade_atendida != null && i.quantidade_atendida !== i.quantidade);

export function mesesAte(mes: string, quantos: number): string[] {
  const [a, m] = mes.split('-').map(Number);
  return Array.from({ length: quantos }, (_, i) => new Date(Date.UTC(a, m - 1 - (quantos - 1 - i), 1)).toISOString().slice(0, 7));
}
export const rotuloMes = (mes: string) => {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
};

/** Do envio até o atendimento, em dias. */
const tempoAtendimento = (p: PedidoCompleto) => {
  const ini = p.eventos.find(e => e.para_status === 'enviada')?.created_at ?? p.created_at;
  return p.atendida_em ? dias(ini, p.atendida_em) : null;
};

export interface LinhaPosto {
  id: string; nome: string; uf: string; pedidos: number; linhas: number; emAndamento: number; atendidos: number; parciais: number; devolvidos: number;
  diasAtendimento: number | null;
}

/** Pedidos do mês por posto, do que mais pediu para o que menos pediu (postos sem pedido ficam de fora). */
export function porPosto(pedidos: PedidoCompleto[], postos: { id: string; nome: string; uf: string }[], mes: string): LinhaPosto[] {
  return postos.map(po => {
    const doPosto = pedidos.filter(p => p.posto_id === po.id && validos(p) && doMes(p.data_pedido, mes));
    return {
      id: po.id, nome: po.nome, uf: po.uf, pedidos: doPosto.length, linhas: doPosto.reduce((s, p) => s + p.itens.length, 0),
      emAndamento: doPosto.filter(p => ABERTOS.includes(p.status)).length,
      atendidos: doPosto.filter(p => p.status === 'atendida').length, parciais: doPosto.filter(entregaParcial).length,
      devolvidos: doPosto.filter(p => p.eventos.some(e => e.para_status === 'devolvida')).length,
      diasAtendimento: media(doPosto.map(tempoAtendimento).filter((x): x is number => x != null)),
    };
  }).filter(l => l.pedidos > 0).sort((a, b) => b.pedidos - a.pedidos || b.linhas - a.linhas);
}

/** Pedidos feitos e atendidos mês a mês. */
export const pedidosPorMes = (pedidos: PedidoCompleto[], meses: string[]) => meses.map(mes => ({
  mes, rotulo: rotuloMes(mes),
  pedidos: pedidos.filter(p => validos(p) && doMes(p.data_pedido, mes)).length,
  atendidos: pedidos.filter(p => p.status === 'atendida' && doMes(p.atendida_em, mes)).length,
}));

/** Quantos pedidos estão em cada etapa agora. */
export const porEtapa = (pedidos: PedidoCompleto[]) =>
  ABERTOS.map(s => ({ status: s, rotulo: STATUS_PEDIDO[s], pedidos: pedidos.filter(p => p.status === s).length }));

/**
 * Itens mais pedidos no mês: em quantos pedidos o item apareceu (dá para
 * comparar itens de unidades diferentes) e a quantidade somada, na unidade dele.
 */
export function topItens(pedidos: PedidoCompleto[], materiais: Material[], mes: string, quantos = 8) {
  const t = new Map<string, { pedidos: number; quantidade: number }>();
  for (const p of pedidos.filter(x => validos(x) && doMes(x.data_pedido, mes))) {
    for (const i of p.itens) {
      const v = t.get(i.material_id) ?? { pedidos: 0, quantidade: 0 };
      v.pedidos++; v.quantidade += qtdItem(i);
      t.set(i.material_id, v);
    }
  }
  return [...t.entries()].map(([id, v]) => {
    const m = materiais.find(x => x.id === id);
    return { id, nome: nomeMaterial(m, materiais), unidade: m?.unidade ?? '', pedidos: v.pedidos, quantidade: Math.round(v.quantidade * 100) / 100 };
  }).sort((a, b) => b.pedidos - a.pedidos || b.quantidade - a.quantidade).slice(0, quantos);
}

/** Tempo médio (dias) em cada etapa, pelo histórico; anotações (mesma etapa) não contam. */
export function tempoPorEtapa(pedidos: PedidoCompleto[]) {
  const soma = new Map<StatusPedido, number[]>();
  for (const p of pedidos) {
    const ev = [...p.eventos].filter(e => e.de_status !== e.para_status).sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let i = 0; i < ev.length - 1; i++) {
      const etapa = ev[i].para_status;
      if (etapa !== 'enviada' && etapa !== 'a_atender') continue;
      soma.set(etapa, [...(soma.get(etapa) ?? []), dias(ev[i].created_at, ev[i + 1].created_at)]);
    }
  }
  return ([['enviada', 'Conferência (supervisor)'], ['a_atender', 'Atendimento (compras)']] as const).map(([status, rotulo]) => ({
    status, rotulo, dias: media(soma.get(status) ?? []), pedidos: soma.get(status)?.length ?? 0,
  }));
}

/** Indicadores do topo para o mês. */
export function indicadores(pedidos: PedidoCompleto[], mes: string, mesAnterior: string) {
  const noMes = pedidos.filter(p => validos(p) && doMes(p.data_pedido, mes));
  const atendidosNoMes = pedidos.filter(p => p.status === 'atendida' && doMes(p.atendida_em, mes));
  return {
    pedidos: noMes.length, pedidosAnterior: pedidos.filter(p => validos(p) && doMes(p.data_pedido, mesAnterior)).length,
    emAndamento: pedidos.filter(p => ABERTOS.includes(p.status)).length,
    atendidos: atendidosNoMes.length, parciais: atendidosNoMes.filter(entregaParcial).length,
    devolvidos: noMes.filter(p => p.eventos.some(e => e.para_status === 'devolvida')).length,
    comEpi: noMes.filter(p => p.tem_epi).length,
    diasAtendimento: media(atendidosNoMes.map(tempoAtendimento).filter((x): x is number => x != null)),
  };
}
