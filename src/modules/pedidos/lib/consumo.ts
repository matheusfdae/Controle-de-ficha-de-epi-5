import type { ItemPlantao, Plantao } from './estoqueService';

/**
 * Relatório de consumo do estoque do posto, a partir dos lançamentos
 * (plantões fechados): diário (início, recebido, usado e final de cada item no
 * dia), quinzenal e mensal (quanto foi usado por dia, total, média e pico).
 * Puro: testado no vitest.
 */

export type PlantaoComItens = Plantao & { itens: ItemPlantao[] };
export type TipoPeriodo = 'dia' | 'quinzena' | 'mes';

/** Dia do lançamento em Brasília (AAAA-MM-DD). */
export const diaDoLancamento = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const ultimoDia = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
const diaIso = (mes: string, d: number) => `${mes}-${String(d).padStart(2, '0')}`;

/** Dias do período: o dia; a quinzena (1 = 1 a 15, 2 = 16 ao fim) ou o mês inteiro. */
export function diasDoPeriodo(tipo: TipoPeriodo, ref: string, quinzena: 1 | 2 = 1): string[] {
  if (tipo === 'dia') return [ref];
  const mes = ref.slice(0, 7);
  const [de, ate] = tipo === 'mes' ? [1, ultimoDia(mes)] : quinzena === 1 ? [1, 15] : [16, ultimoDia(mes)];
  return Array.from({ length: ate - de + 1 }, (_, i) => diaIso(mes, de + i));
}

export interface LinhaDia { material_id: string; inicio: number; recebido: number; usado: number; final: number; lancamentos: number }

/** Um dia: início do 1º lançamento, recebido e usado somados, final do último. */
export function consumoDoDia(plantoes: PlantaoComItens[], dia: string): LinhaDia[] {
  const doDia = plantoes.filter(p => diaDoLancamento(p.aberto_em) === dia).sort((a, b) => a.aberto_em.localeCompare(b.aberto_em));
  const t = new Map<string, LinhaDia>();
  for (const p of doDia) for (const i of p.itens) {
    const v = t.get(i.material_id);
    if (!v) t.set(i.material_id, { material_id: i.material_id, inicio: i.qtd_inicio, recebido: i.qtd_recebida, usado: i.qtd_usada ?? 0, final: i.qtd_fim ?? 0, lancamentos: 1 });
    else { v.recebido += i.qtd_recebida; v.usado += i.qtd_usada ?? 0; v.final = i.qtd_fim ?? v.final; v.lancamentos++; }
  }
  return [...t.values()];
}

export interface LinhaPeriodo {
  material_id: string;
  /** Usado em cada dia do período (mesma ordem de `dias`). */
  porDia: number[];
  total: number;
  /** Total / dias com lançamento no período. */
  mediaDia: number;
  diasComUso: number;
  pico: number; picoDia: string | null;
  recebido: number;
}

export interface ResumoPeriodo {
  dias: string[];
  /** Dias do período que tiveram lançamento. */
  diasLancados: string[];
  linhas: LinhaPeriodo[];
  /** Soma de tudo o que foi usado em cada dia (todas as unidades juntas). */
  totalPorDia: number[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Quinzena ou mês: usado por item em cada dia, total, média por dia lançado e o dia de maior uso. */
export function consumoDoPeriodo(plantoes: PlantaoComItens[], dias: string[]): ResumoPeriodo {
  const idx = new Map(dias.map((d, i) => [d, i]));
  const lancados = new Set<string>();
  const t = new Map<string, { porDia: number[]; recebido: number }>();
  for (const p of plantoes) {
    const i = idx.get(diaDoLancamento(p.aberto_em));
    if (i == null) continue;
    lancados.add(dias[i]);
    for (const it of p.itens) {
      const v = t.get(it.material_id) ?? { porDia: dias.map(() => 0), recebido: 0 };
      v.porDia[i] += it.qtd_usada ?? 0;
      v.recebido += it.qtd_recebida;
      t.set(it.material_id, v);
    }
  }
  const nLanc = Math.max(1, lancados.size);
  const linhas = [...t.entries()].map(([material_id, v]) => {
    const total = r2(v.porDia.reduce((s, x) => s + x, 0));
    const pico = Math.max(...v.porDia);
    return {
      material_id, porDia: v.porDia.map(r2), total, mediaDia: r2(total / nLanc), diasComUso: v.porDia.filter(x => x > 0).length,
      pico: r2(pico), picoDia: pico > 0 ? dias[v.porDia.indexOf(pico)] : null, recebido: r2(v.recebido),
    };
  }).sort((a, b) => b.total - a.total);
  return {
    dias, diasLancados: dias.filter(d => lancados.has(d)), linhas,
    totalPorDia: dias.map((_, i) => r2(linhas.reduce((s, l) => s + l.porDia[i], 0))),
  };
}
