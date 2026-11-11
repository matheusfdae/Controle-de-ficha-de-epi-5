import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { EquipamentoGasto, MesGasto, PlanilhaGasto, SecaoGasto } from './planilhaGasto';

/** Conteúdo da aba guardado em gasto_mensal.dados. */
export interface DadosGasto {
  secoes: SecaoGasto[];
  meses: MesGasto[];
  rotuloSaldo: 'VARIAÇÃO' | 'SALDO';
  equipamentos: EquipamentoGasto[];
  observacoes: string[];
}
export interface GastoPosto {
  id: string; ano: number; aba: string; ordem: number;
  posto_id: string | null; posto_nome: string; uf: string;
  custo_texto: string | null; custo_valor: number | null;
  dados: DadosGasto;
  atualizado_em: string;
}

const CAMPOS = 'id, ano, aba, ordem, posto_id, posto_nome, uf, custo_texto, custo_valor, dados, atualizado_em';

const vazio = (): DadosGasto => ({
  secoes: [{ titulo: null, itens: [] }],
  meses: Array.from({ length: 12 }, () => ({ faturamento: [], previsto: null, realizado: null, parcelas: null })),
  rotuloSaldo: 'VARIAÇÃO', equipamentos: [], observacoes: [],
});

function linha(r: Record<string, unknown>): GastoPosto {
  const d = (r.dados ?? {}) as Partial<DadosGasto>;
  const base = vazio();
  return {
    ...(r as unknown as GastoPosto),
    custo_valor: r.custo_valor == null ? null : Number(r.custo_valor),
    dados: {
      secoes: d.secoes?.length ? d.secoes : base.secoes,
      meses: d.meses?.length === 12 ? d.meses : base.meses,
      rotuloSaldo: d.rotuloSaldo ?? base.rotuloSaldo,
      equipamentos: d.equipamentos ?? [],
      observacoes: d.observacoes ?? [],
    },
  };
}

export async function listGastoMensal(ano: number): Promise<GastoPosto[]> {
  const { data, error } = await supabase.from('gasto_mensal').select(CAMPOS).eq('ano', ano).order('ordem').order('posto_nome');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => linha(r as Record<string, unknown>));
}

/** Anos com controle cadastrado (mais recente primeiro). */
export async function anosGastoMensal(): Promise<number[]> {
  const { data, error } = await supabase.from('gasto_mensal').select('ano');
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map(r => r.ano as number))].sort((a, b) => b - a);
}

export interface AbaParaImportar { planilha: PlanilhaGasto; posto_id: string | null; uf: string; ordem: number }

/** Grava as abas do ano: a mesma aba no mesmo ano é substituída pela da planilha. */
export async function importarGastoMensal(ano: number, abas: AbaParaImportar[]) {
  const linhas = abas.map(({ planilha: p, posto_id, uf, ordem }) => ({
    ano, aba: p.aba, ordem, posto_id, posto_nome: p.posto, uf,
    custo_texto: p.custoTexto || null, custo_valor: p.custoValor,
    dados: { secoes: p.secoes, meses: p.meses, rotuloSaldo: p.rotuloSaldo, equipamentos: p.equipamentos, observacoes: p.observacoes } as unknown as Json,
  }));
  const { error } = await supabase.from('gasto_mensal').upsert(linhas, { onConflict: 'ano,aba' });
  if (error) throw new Error(error.message);
}

export async function salvarGastoPosto(g: Pick<GastoPosto, 'id' | 'custo_texto' | 'custo_valor' | 'dados'>): Promise<GastoPosto> {
  const { data, error } = await supabase.from('gasto_mensal')
    .update({ custo_texto: g.custo_texto, custo_valor: g.custo_valor, dados: g.dados as unknown as Json })
    .eq('id', g.id).select(CAMPOS).single();
  if (error) throw new Error(error.message);
  return linha(data as Record<string, unknown>);
}

export async function excluirGastoPosto(id: string) {
  const { error } = await supabase.from('gasto_mensal').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Texto digitado no "valor realizado" na edição: "1.234,56", "1234.56" ou a soma das
 * notas "26829,76 + 8755,64 - 699,30". Devolve o total e as parcelas (se houver soma).
 */
export function lerValorDigitado(t: string): { total: number | null; parcelas: number[] | null } | 'invalido' {
  const s = t.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!s) return { total: null, parcelas: null };
  const partes = s.match(/^[+-]?[^+-]+|[+-][^+-]+/g);
  if (!partes) return 'invalido';
  const nums: number[] = [];
  for (const p of partes) {
    const sinal = p.startsWith('-') ? -1 : 1;
    let n = p.replace(/^[+-]/, '');
    // vírgula decimal (padrão brasileiro): tira pontos de milhar
    if (n.includes(',')) n = n.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(n)) return 'invalido';
    nums.push(sinal * Number(n));
  }
  const total = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
  return { total, parcelas: nums.length > 1 ? nums.map(n => Math.round(n * 100) / 100) : null };
}
