/**
 * Relatório do teto de gasto de um posto no ano (o resumo da aba da planilha de
 * gasto mensal): por mês a data de faturamento, o valor previsto, o realizado e a
 * variação; e o acumulado. Vem do Controle de gasto mensal do posto; sem ele,
 * é montado pelos pedidos do sistema (previsto = teto do posto).
 */
import type { GastoPosto } from './gastoMensalService';
import type { PedidoCompleto } from './pedidosService';
import { acumulado, type MesGasto } from './planilhaGasto';

export interface RelatorioTeto {
  origem: 'controle' | 'pedidos';
  /** Quando a planilha do posto foi importada/editada pela última vez. */
  atualizadoEm: string | null;
  /** Último mês com valores (1–12); os seguintes saem zerados. */
  ateMes: number;
  custoTexto: string;
  rotulo: 'VARIAÇÃO' | 'SALDO';
  meses: MesGasto[];
  acumulado: { previsto: number; aplicado: number; saldo: number };
}

const reaisTexto = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Mês de referência padrão: o último mês fechado do ano atual (em novembro, outubro); ano passado = dezembro. */
export function mesDeReferencia(ano: number, hoje = new Date()): number {
  if (ano < hoje.getFullYear()) return 12;
  if (ano > hoje.getFullYear()) return 1;
  return Math.max(1, hoje.getMonth());
}

/**
 * Mês em que o relatório abre. Com a planilha do posto: o último mês que ela já
 * preencheu (realizado ou data de faturamento), sem passar do mês atual — a
 * planilha é atualizada todo mês. Sem planilha (pelos pedidos): o último mês fechado.
 */
export function mesInicial(ano: number, controle: GastoPosto | null, hoje = new Date()): number {
  const fechado = mesDeReferencia(ano, hoje);
  if (!controle) return fechado;
  const limite = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 1 : hoje.getMonth() + 1;
  let ultimo = 0;
  controle.dados.meses.forEach((m, k) => {
    if ((m.realizado ?? 0) > 0 || m.faturamento.some(f => /^\d{4}-\d{2}-\d{2}$/.test(f))) ultimo = k + 1;
  });
  return Math.max(1, Math.min(limite, Math.max(ultimo, fechado)));
}

/** Meses depois do de referência ainda não aconteceram: tudo zerado, como na planilha. */
function ateOMes(meses: MesGasto[], ateMes: number): MesGasto[] {
  return meses.map((m, k) => (k < ateMes ? m : { faturamento: [], previsto: 0, realizado: 0, parcelas: null }));
}

export function relatorioTeto(ano: number, controle: GastoPosto | null, pedidos: PedidoCompleto[], teto: number | null,
  ateMes = mesDeReferencia(ano)): RelatorioTeto {
  if (controle) {
    const meses = ateOMes(controle.dados.meses, ateMes);
    return {
      origem: 'controle', atualizadoEm: controle.atualizado_em, ateMes,
      custoTexto: controle.custo_texto || (controle.custo_valor != null ? reaisTexto(controle.custo_valor) : '—'),
      rotulo: controle.dados.rotuloSaldo,
      meses,
      acumulado: acumulado(meses),
    };
  }
  const meses: MesGasto[] = ateOMes(Array.from({ length: 12 }, (_, k) => {
    const doMes = pedidos.filter(p => p.status !== 'cancelada' && Number(p.data_pedido.slice(0, 4)) === ano && Number(p.data_pedido.slice(5, 7)) === k + 1);
    const realizado = Math.round(doMes.reduce((s, p) => s + (p.valor_total ?? 0), 0) * 100) / 100;
    // Faturamento = quando o pedido foi atendido (entregue).
    const faturamento = [...new Set(doMes.map(p => p.atendida_em?.slice(0, 10)).filter((d): d is string => !!d))].sort();
    return { faturamento, previsto: teto, realizado, parcelas: doMes.length > 1 ? doMes.map(p => p.valor_total ?? 0) : null };
  }), ateMes);
  return {
    origem: 'pedidos', atualizadoEm: null, ateMes,
    custoTexto: teto != null ? reaisTexto(teto) : 'sem teto',
    rotulo: 'VARIAÇÃO',
    meses,
    acumulado: acumulado(meses),
  };
}

/** Como a planilha mostra a variação: valor sem sinal, vermelho se passou do previsto, verde se sobrou. */
export function variacao(previsto: number | null, realizado: number | null): { valor: number; tom: 'passou' | 'sobrou' | 'zero' } {
  const v = Math.round(((previsto ?? 0) - (realizado ?? 0)) * 100) / 100;
  return { valor: Math.abs(v), tom: v < 0 ? 'passou' : v > 0 ? 'sobrou' : 'zero' };
}
