import { diasDeDiferenca } from '../../../../supabase/functions/_shared/avisoMovimentacao';
import { MOTIVOS, type Movimentacao } from './movimentacaoService';

/**
 * Contas do Painel Gerencial da Movimentação Diária. Tudo pela data informada
 * pelo fiscal (data_movimentacao), que é a data do plantão.
 */

export { mesesAte, rotuloMes } from '@/modules/pedidos/lib/gerencial';

export const doMes = (l: Movimentacao, mes: string) => l.data_movimentacao.slice(0, 7) === mes;
export const descoberto = (l: Movimentacao) => !l.cobertura_nome;
/** Dias de atraso do lançamento (0 = lançado no dia). */
export const atraso = (l: Movimentacao) => Math.max(0, diasDeDiferenca(l.data_movimentacao, l.data_lancamento));
export const pct = (n: number, t: number) => (t ? Math.round((n / t) * 1000) / 10 : null);
const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function indicadores(ls: Movimentacao[], mes: string, mesAnterior: string) {
  const m = ls.filter(l => doMes(l, mes));
  const div = m.filter(l => l.status === 'divergente');
  return {
    total: m.length,
    anterior: ls.filter(l => doMes(l, mesAnterior)).length,
    divergentes: div.length,
    pctDivergentes: pct(div.length, m.length),
    atrasoMedio: media(div.map(atraso)),
    faltas: m.filter(l => l.motivo === 'FALTA').length,
    descobertos: m.filter(descoberto).length,
    extras: m.filter(l => l.cobertura_por_extra).length,
    pctExtras: pct(m.filter(l => l.cobertura_por_extra).length, m.length),
    avisosPendentes: ls.filter(l => l.status === 'divergente' && !l.email_avisado_em).length,
    fiscais: new Set(m.map(l => l.fiscal_matricula ?? l.fiscal_nome)).size,
    postos: new Set(m.map(l => l.posto_nome.trim().toUpperCase())).size,
  };
}

/** Lançamentos OK x divergentes e postos descobertos, mês a mês. */
export const porMes = (ls: Movimentacao[], meses: string[], rotulo: (m: string) => string) => meses.map(mes => {
  const m = ls.filter(l => doMes(l, mes));
  return {
    mes, rotulo: rotulo(mes),
    OK: m.filter(l => l.status === 'ok').length,
    Divergente: m.filter(l => l.status === 'divergente').length,
    Descobertos: m.filter(descoberto).length,
  };
});

export const porMotivo = (m: Movimentacao[]) =>
  [...MOTIVOS, ...new Set(m.map(l => l.motivo).filter(x => !(MOTIVOS as readonly string[]).includes(x)))]
    .map(motivo => ({ motivo, total: m.filter(l => l.motivo === motivo).length }))
    .filter(x => x.total > 0 || (MOTIVOS as readonly string[]).includes(x.motivo));

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
/** Por dia da semana do plantão, separado por turno. */
export const porDiaSemana = (m: Movimentacao[]) => SEMANA.map((dia, i) => {
  const d = m.filter(l => new Date(`${l.data_movimentacao}T12:00:00Z`).getUTCDay() === i);
  return { dia, Diurno: d.filter(l => l.turno === 'DIURNO').length, Noturno: d.filter(l => l.turno === 'NOTURNO').length };
});

/** Atraso dos lançamentos: no dia, 1 dia, 2–3 dias, 4–7 dias, mais de 7. */
export const faixasAtraso = (m: Movimentacao[]) => {
  const faixas = [
    { faixa: 'No dia', ate: 0 }, { faixa: '1 dia', ate: 1 }, { faixa: '2 a 3 dias', ate: 3 },
    { faixa: '4 a 7 dias', ate: 7 }, { faixa: 'Mais de 7', ate: Infinity },
  ];
  const cont = faixas.map(f => ({ faixa: f.faixa, total: 0 }));
  for (const l of m) cont[faixas.findIndex(f => atraso(l) <= f.ate)].total++;
  return cont;
};

function agrupar<T>(m: Movimentacao[], chave: (l: Movimentacao) => string | null, linha: (k: string, ls: Movimentacao[]) => T) {
  const g = new Map<string, Movimentacao[]>();
  for (const l of m) {
    const k = chave(l);
    if (k) g.set(k, [...(g.get(k) ?? []), l]);
  }
  return [...g.entries()].map(([k, ls]) => linha(k, ls));
}

const ultimaData = (ls: Movimentacao[]) => ls.reduce((a, l) => (l.data_movimentacao > a ? l.data_movimentacao : a), '');

/** Desempenho dos fiscais: quem mais lança fora do dia aparece primeiro. */
export const porFiscal = (m: Movimentacao[]) =>
  agrupar(m, l => l.fiscal_matricula ?? l.fiscal_nome, (_k, ls) => {
    const div = ls.filter(l => l.status === 'divergente');
    return {
      chave: _k, nome: ls[0].fiscal_nome, matricula: ls[0].fiscal_matricula,
      total: ls.length, divergentes: div.length, pct: pct(div.length, ls.length) ?? 0,
      atrasoMedio: media(div.map(atraso)), ultimo: ultimaData(ls),
    };
  }).sort((a, b) => b.divergentes - a.divergentes || b.pct - a.pct || b.total - a.total || a.nome.localeCompare(b.nome));

/** Postos: faltas, descobertos e extras. */
export const porPosto = (m: Movimentacao[]) =>
  agrupar(m, l => l.posto_nome.trim().toUpperCase(), (k, ls) => ({
    nome: k, uf: ls[0].uf, total: ls.length,
    faltas: ls.filter(l => l.motivo === 'FALTA').length,
    descobertos: ls.filter(descoberto).length,
    extras: ls.filter(l => l.cobertura_por_extra).length,
    diurno: ls.filter(l => l.turno === 'DIURNO').length,
    noturno: ls.filter(l => l.turno === 'NOTURNO').length,
  })).sort((a, b) => b.total - a.total || b.descobertos - a.descobertos || a.nome.localeCompare(b.nome));

/** Colaboradores que mais faltaram (reincidência). */
export const reincidentes = (m: Movimentacao[]) =>
  agrupar(m, l => l.falta_matricula, (k, ls) => ({
    matricula: k, nome: ls[0].falta_nome, total: ls.length,
    faltas: ls.filter(l => l.motivo === 'FALTA').length,
    postos: [...new Set(ls.map(l => l.posto_nome.trim().toUpperCase()))],
    ultima: ultimaData(ls),
  })).sort((a, b) => b.faltas - a.faltas || b.total - a.total || a.nome.localeCompare(b.nome));

/** Quem mais cobriu (e quantas dessas por extra). */
export const coberturas = (m: Movimentacao[]) =>
  agrupar(m, l => l.cobertura_matricula, (k, ls) => ({
    matricula: k, nome: ls[0].cobertura_nome ?? '', total: ls.length,
    extras: ls.filter(l => l.cobertura_por_extra).length,
    postos: [...new Set(ls.map(l => l.posto_nome.trim().toUpperCase()))],
  })).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
