import { supabase } from '@/integrations/supabase/client';

export type ItemTipo = 'epi' | 'uniforme';

export interface EPI {
  id: string;
  codigo: string | null;
  nome: string;
  categoria: string;
  ca_numero: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
  tipo: ItemTipo;
}

export interface EPITamanho {
  id: string;
  epi_id: string;
  tamanho: string;
  estoque: number;
  estoque_minimo: number;
  uf: string;
}

export interface Funcao {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface FuncaoEPI {
  id: string;
  funcao_id: string;
  epi_id: string;
  quantidade: number;
  tamanho: string | null;
}

// EPIs
export async function listEpis(tipo?: ItemTipo): Promise<EPI[]> {
  let q = supabase.from('epis').select('*').order('nome');
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as EPI[];
}

export async function upsertEpi(epi: Partial<EPI>): Promise<EPI> {
  const payload: any = {
    nome: epi.nome,
    codigo: epi.codigo,
    categoria: epi.categoria || 'protecao_cabeca',
    ca_numero: epi.ca_numero,
    estoque_minimo: epi.estoque_minimo ?? 5,
  };
  if (epi.tipo) payload.tipo = epi.tipo;
  if (epi.id) payload.id = epi.id;
  const { data, error } = await supabase.from('epis').upsert(payload).select().single();
  if (error) throw error;
  return data as EPI;
}

export async function deleteEpi(id: string) {
  const { error } = await supabase.from('epis').delete().eq('id', id);
  if (error) throw error;
}

// Tamanhos / estoque — sempre de um estado (UF). Item sem tamanho usa 'ÚNICO'.
export const TAMANHO_UNICO = 'ÚNICO';

export async function listTamanhos(epiId: string, uf: string): Promise<EPITamanho[]> {
  const { data, error } = await supabase
    .from('epi_tamanhos').select('*').eq('epi_id', epiId).eq('uf', uf).order('tamanho');
  if (error) throw error;
  return (data || []) as EPITamanho[];
}

/** Saldo por item no estado (ou em todos os estados que o usuário vê, com uf = null). */
export async function totaisPorItem(uf: string | null): Promise<Record<string, number>> {
  let q = supabase.from('epi_tamanhos').select('epi_id, estoque');
  if (uf) q = q.eq('uf', uf);
  const { data, error } = await q;
  if (error) throw error;
  const totais: Record<string, number> = {};
  for (const t of data ?? []) totais[t.epi_id] = (totais[t.epi_id] ?? 0) + t.estoque;
  return totais;
}

export async function deleteTamanho(id: string) {
  const { error } = await supabase.from('epi_tamanhos').delete().eq('id', id);
  if (error) throw error;
}

/** Define o saldo de um tamanho no estado (cria o tamanho se não existir) e registra a movimentação. */
export async function ajustarEstoque(epiId: string, uf: string, tamanho: string, novoEstoque: number, motivo?: string) {
  const { error } = await supabase.rpc('ajustar_estoque', {
    _epi_id: epiId, _uf: uf, _tamanho: tamanho, _novo: novoEstoque, _motivo: motivo,
  });
  if (error) throw new Error(error.message);
}

/** Zera o estoque do item (todos os tamanhos) no estado e registra a saída. */
export async function resetarEstoqueEpi(epiId: string, uf: string) {
  const { error } = await supabase.rpc('resetar_estoque', { _epi_id: epiId, _uf: uf });
  if (error) throw new Error(error.message);
}

export async function transferirEstoque(t: {
  epiId: string; tamanho: string; ufOrigem: string; ufDestino: string; quantidade: number; observacao?: string;
}) {
  const { error } = await supabase.rpc('transferir_estoque', {
    _epi_id: t.epiId, _tamanho: t.tamanho, _uf_origem: t.ufOrigem, _uf_destino: t.ufDestino,
    _quantidade: t.quantidade, _observacao: t.observacao || undefined,
  });
  if (error) throw new Error(error.message);
}

// Funções
export async function listFuncoes(): Promise<Funcao[]> {
  const { data, error } = await supabase.from('funcoes').select('*').order('nome');
  if (error) throw error;
  return (data || []) as Funcao[];
}

export async function upsertFuncao(f: Partial<Funcao>): Promise<Funcao> {
  const payload: any = { nome: f.nome, descricao: f.descricao };
  if (f.id) payload.id = f.id;
  const { data, error } = await supabase.from('funcoes').upsert(payload).select().single();
  if (error) throw error;
  return data as Funcao;
}

export async function deleteFuncao(id: string) {
  const { error } = await supabase.from('funcoes').delete().eq('id', id);
  if (error) throw error;
}

// Funcao_epis
export async function listFuncaoEpis(funcaoId: string): Promise<FuncaoEPI[]> {
  const { data, error } = await supabase
    .from('funcao_epis').select('*').eq('funcao_id', funcaoId);
  if (error) throw error;
  return (data || []) as FuncaoEPI[];
}

export async function addFuncaoEpi(item: Omit<FuncaoEPI, 'id'>) {
  const { error } = await supabase.from('funcao_epis').insert({
    funcao_id: item.funcao_id,
    epi_id: item.epi_id,
    quantidade: item.quantidade,
    tamanho: item.tamanho,
  });
  if (error) throw error;
}

export async function removeFuncaoEpi(id: string) {
  const { error } = await supabase.from('funcao_epis').delete().eq('id', id);
  if (error) throw error;
}

// ===== Movimentações de estoque (gráfico) =====
export interface MovimentacaoDia {
  data: string; // YYYY-MM-DD
  entradas: number;
  saidas: number;
}

export async function listMovimentacoes(diasAtras: number, uf: string | null = null): Promise<MovimentacaoDia[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - diasAtras);
  desde.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('movimentacoes_estoque')
    .select('tipo_mov, quantidade, data_mov')
    .gte('data_mov', desde.toISOString())
    .match(uf ? { uf } : {})
    .order('data_mov', { ascending: true });
  if (error) { console.error(error); return []; }

  const map = new Map<string, MovimentacaoDia>();
  // pré-popula com zeros para todos os dias do período
  for (let i = 0; i <= diasAtras; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (diasAtras - i));
    const k = d.toISOString().split('T')[0];
    map.set(k, { data: k, entradas: 0, saidas: 0 });
  }

  (data || []).forEach((m: any) => {
    const k = (m.data_mov as string).split('T')[0];
    const cur = map.get(k) || { data: k, entradas: 0, saidas: 0 };
    if (m.tipo_mov === 'entrada') cur.entradas += m.quantidade || 0;
    else if (m.tipo_mov === 'saida') cur.saidas += m.quantidade || 0;
    map.set(k, cur);
  });

  return Array.from(map.values()).sort((a, b) => a.data.localeCompare(b.data));
}
