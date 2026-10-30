import {
  STATUS_PEDIDO, nomeMaterial, tetoNoMes, valorDoPedido,
  type Material, type PedidoCompleto, type StatusPedido, type TetoPosto,
} from './pedidosService';

/**
 * Cálculos do Painel Gerencial (tudo a partir dos pedidos já carregados).
 * Gasto = pedidos a faturar ou faturados, fora os cobrados do cliente, no mês
 * da aprovação — a mesma regra do teto.
 */

export type Situacao = 'ok' | 'atencao' | 'acima' | 'sem_teto';
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  ok: 'Até 70% do teto', atencao: '70% a 100%', acima: 'Acima do teto', sem_teto: 'Sem teto',
};
/** Cores de situação (reservadas: só para o teto, sempre com rótulo ou ícone). */
export const COR_SITUACAO: Record<Situacao, string> = { ok: '#0ca30c', atencao: '#fab219', acima: '#d03b3b', sem_teto: '#64748b' };
export const situacao = (gasto: number, teto: number | null): Situacao =>
  teto == null || teto <= 0 ? 'sem_teto' : gasto > teto ? 'acima' : gasto / teto > 0.7 ? 'atencao' : 'ok';

const contaNoTeto = (p: Pick<PedidoCompleto, 'status' | 'cobrar_cliente'>) =>
  (p.status === 'a_faturar' || p.status === 'faturada') && !p.cobrar_cliente;
const doMes = (data: string | null, mes: string) => !!data && data.slice(0, 7) === mes;
const r2 = (v: number) => Math.round(v * 100) / 100;
const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

export function mesesAte(mes: string, quantos: number): string[] {
  const [a, m] = mes.split('-').map(Number);
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (quantos - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
export const rotuloMes = (mes: string) => {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
};

export interface LinhaPosto { id: string; nome: string; uf: string; teto: number | null; gasto: number; pedidos: number; situacao: Situacao; uso: number | null }

/** Teto, gasto e situação de cada posto no mês (postos sem gasto e sem teto ficam de fora). */
export function porPosto(pedidos: PedidoCompleto[], postos: { id: string; nome: string; uf: string }[], tetos: TetoPosto[], mes: string): LinhaPosto[] {
  const fimMes = `${mes}-28`;
  return postos.map(po => {
    const doPosto = pedidos.filter(p => p.posto_id === po.id && contaNoTeto(p) && doMes(p.data_aprovacao, mes));
    const gasto = r2(doPosto.reduce((s, p) => s + valorDoPedido(p), 0));
    const teto = tetoNoMes(tetos, po.id, fimMes);
    return { id: po.id, nome: po.nome, uf: po.uf, teto, gasto, pedidos: doPosto.length, situacao: situacao(gasto, teto),
      uso: teto ? Math.round((gasto / teto) * 1000) / 10 : null };
  }).filter(l => l.gasto > 0 || l.teto != null)
    .sort((a, b) => (b.uso ?? -1) - (a.uso ?? -1) || b.gasto - a.gasto);
}

/** Gasto e teto somado (dos postos com teto) mês a mês. */
export function gastoMensal(pedidos: PedidoCompleto[], postos: { id: string }[], tetos: TetoPosto[], meses: string[]) {
  return meses.map(mes => ({
    mes, rotulo: rotuloMes(mes),
    gasto: r2(pedidos.filter(p => contaNoTeto(p) && doMes(p.data_aprovacao, mes)).reduce((s, p) => s + valorDoPedido(p), 0)),
    teto: r2(postos.reduce((s, po) => s + (tetoNoMes(tetos, po.id, `${mes}-28`) ?? 0), 0)),
  }));
}

const ABERTOS: StatusPedido[] = ['enviada', 'devolvida', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar'];
/** Quantos pedidos estão em cada etapa agora. */
export const porEtapa = (pedidos: PedidoCompleto[]) =>
  ABERTOS.map(s => ({ status: s, rotulo: STATUS_PEDIDO[s], pedidos: pedidos.filter(p => p.status === s).length }));

/** Itens com maior gasto no mês (quantidade × preço da nota, senão orçado, senão tabela). */
export function topItens(pedidos: PedidoCompleto[], materiais: Material[], mes: string, quantos = 8) {
  const total = new Map<string, { gasto: number; quantidade: number }>();
  for (const p of pedidos.filter(x => contaNoTeto(x) && doMes(x.data_aprovacao, mes))) {
    for (const i of p.itens) {
      const notas = p.compras.flatMap(c => c.itens).filter(c => c.material_id === i.material_id);
      const valor = notas.length ? notas.reduce((s, c) => s + c.quantidade * c.valor_unitario, 0)
        : i.quantidade * (i.preco_orcado ?? i.preco_ref ?? 0);
      const t = total.get(i.material_id) ?? { gasto: 0, quantidade: 0 };
      t.gasto += valor; t.quantidade += i.quantidade;
      total.set(i.material_id, t);
    }
  }
  return [...total.entries()]
    .map(([id, t]) => ({ id, nome: nomeMaterial(materiais.find(m => m.id === id), materiais), gasto: r2(t.gasto), quantidade: t.quantidade }))
    .filter(t => t.gasto > 0).sort((a, b) => b.gasto - a.gasto).slice(0, quantos);
}

/**
 * Tempo médio (dias) em cada etapa, pelo histórico: de quando o pedido entrou
 * na etapa até sair dela. Só pedidos com a etapa concluída.
 */
export function tempoPorEtapa(pedidos: PedidoCompleto[]) {
  const soma = new Map<StatusPedido, { total: number; n: number }>();
  for (const p of pedidos) {
    const ev = [...p.eventos].filter(e => e.de_status !== e.para_status).sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (let i = 0; i < ev.length - 1; i++) {
      const etapa = ev[i].para_status;
      if (!['enviada', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar'].includes(etapa)) continue;
      const s = soma.get(etapa) ?? { total: 0, n: 0 };
      s.total += dias(ev[i].created_at, ev[i + 1].created_at); s.n++;
      soma.set(etapa, s);
    }
  }
  return (['enviada', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar'] as StatusPedido[]).map(s => {
    const v = soma.get(s);
    return { status: s, rotulo: { enviada: 'Conferência', em_orcamento: 'Orçamento', aguardando_aprovacao: 'Aprovação do excesso', a_faturar: 'Faturamento' }[s as string] as string,
      dias: v ? Math.round((v.total / v.n) * 10) / 10 : null, pedidos: v?.n ?? 0 };
  });
}

/** Dias do envio ao faturamento, em média, dos pedidos faturados no mês. */
export function tempoAteFaturar(pedidos: PedidoCompleto[], mes: string): number | null {
  const tempos = pedidos.filter(p => p.status === 'faturada' && doMes(p.faturada_em?.slice(0, 10) ?? null, mes))
    .map(p => dias(p.eventos.find(e => e.para_status === 'enviada')?.created_at ?? p.created_at, p.faturada_em!));
  return tempos.length ? Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 10) / 10 : null;
}

/** Indicadores do topo para o mês. */
export function indicadores(pedidos: PedidoCompleto[], linhas: LinhaPosto[], mes: string, mesAnterior: string) {
  const gastoDe = (m: string) => r2(pedidos.filter(p => contaNoTeto(p) && doMes(p.data_aprovacao, m)).reduce((s, p) => s + valorDoPedido(p), 0));
  const comTeto = linhas.filter(l => l.teto != null);
  const tetoTotal = comTeto.reduce((s, l) => s + (l.teto ?? 0), 0);
  const gastoComTeto = comTeto.reduce((s, l) => s + l.gasto, 0);
  const excesso = pedidos.filter(p => p.eventos.some(e => e.de_status === 'aguardando_aprovacao' && doMes(e.created_at.slice(0, 10), mes)));
  return {
    gasto: gastoDe(mes), gastoAnterior: gastoDe(mesAnterior),
    usoTeto: tetoTotal ? Math.round((gastoComTeto / tetoTotal) * 1000) / 10 : null,
    postosAcima: comTeto.filter(l => l.situacao === 'acima').length, postosComTeto: comTeto.length,
    pedidosNoMes: pedidos.filter(p => doMes(p.data_pedido, mes)).length,
    emAberto: pedidos.filter(p => ABERTOS.includes(p.status)).length,
    excessoAprovado: excesso.filter(p => p.eventos.some(e => e.de_status === 'aguardando_aprovacao' && e.para_status === 'a_faturar')).length,
    excessoReprovado: excesso.filter(p => p.eventos.some(e => e.de_status === 'aguardando_aprovacao' && e.para_status === 'reprovada')).length,
    tempoAteFaturar: tempoAteFaturar(pedidos, mes),
    aCobrar: r2(pedidos.filter(p => p.cobrar_cliente && p.status === 'faturada' && !p.cobrado_em).reduce((s, p) => s + valorDoPedido(p), 0)),
  };
}
