import { supabase } from '@/integrations/supabase/client';

export interface EPI {
  id: string;
  codigo: string | null;
  nome: string;
  categoria: string;
  ca_numero: string | null;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
}

export interface EPITamanho {
  id: string;
  epi_id: string;
  tamanho: string;
  estoque: number;
  estoque_minimo: number;
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
export async function listEpis(): Promise<EPI[]> {
  const { data, error } = await supabase.from('epis').select('*').order('nome');
  if (error) throw error;
  return (data || []) as EPI[];
}

export async function upsertEpi(epi: Partial<EPI>): Promise<EPI> {
  const payload: any = {
    nome: epi.nome,
    codigo: epi.codigo,
    categoria: epi.categoria || 'protecao_cabeca',
    ca_numero: epi.ca_numero,
    estoque_minimo: epi.estoque_minimo ?? 5,
  };
  if (epi.id) payload.id = epi.id;
  const { data, error } = await supabase.from('epis').upsert(payload).select().single();
  if (error) throw error;
  return data as EPI;
}

export async function deleteEpi(id: string) {
  const { error } = await supabase.from('epis').delete().eq('id', id);
  if (error) throw error;
}

// Tamanhos / estoque
export async function listTamanhos(epiId: string): Promise<EPITamanho[]> {
  const { data, error } = await supabase
    .from('epi_tamanhos').select('*').eq('epi_id', epiId).order('tamanho');
  if (error) throw error;
  return (data || []) as EPITamanho[];
}

export async function upsertTamanho(t: Partial<EPITamanho> & { epi_id: string; tamanho: string }) {
  const { error } = await supabase.from('epi_tamanhos').upsert({
    id: t.id,
    epi_id: t.epi_id,
    tamanho: t.tamanho,
    estoque: t.estoque ?? 0,
    estoque_minimo: t.estoque_minimo ?? 0,
  }, { onConflict: 'epi_id,tamanho' });
  if (error) throw error;
}

export async function deleteTamanho(id: string) {
  const { error } = await supabase.from('epi_tamanhos').delete().eq('id', id);
  if (error) throw error;
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

export async function listMovimentacoes(diasAtras: number): Promise<MovimentacaoDia[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - diasAtras);
  desde.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('movimentacoes_estoque')
    .select('tipo_mov, quantidade, data_mov')
    .gte('data_mov', desde.toISOString())
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
