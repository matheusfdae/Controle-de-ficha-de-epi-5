import { supabase } from '@/integrations/supabase/client';

export interface Uniforme {
  id: string;
  codigo: string | null;
  nome: string;
  categoria: string;
  descricao: string | null;
  genero: 'masculino' | 'feminino' | 'unissex';
  tamanhos_disponiveis: string[];
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
}

export async function listUniformes(): Promise<Uniforme[]> {
  const { data, error } = await supabase.from('uniformes').select('*').order('nome');
  if (error) throw error;
  return (data || []) as Uniforme[];
}

export async function upsertUniforme(u: Partial<Uniforme>): Promise<Uniforme> {
  const payload: any = {
    nome: u.nome,
    codigo: u.codigo ?? null,
    categoria: u.categoria || 'geral',
    descricao: u.descricao ?? null,
    genero: u.genero || 'unissex',
    tamanhos_disponiveis: u.tamanhos_disponiveis ?? [],
    estoque_atual: u.estoque_atual ?? 0,
    estoque_minimo: u.estoque_minimo ?? 5,
  };
  if (u.id) payload.id = u.id;
  const { data, error } = await supabase.from('uniformes').upsert(payload).select().single();
  if (error) throw error;
  return data as Uniforme;
}

export async function deleteUniforme(id: string) {
  const { error } = await supabase.from('uniformes').delete().eq('id', id);
  if (error) throw error;
}

/** Ajusta o estoque do uniforme registrando uma movimentação. */
export async function ajustarEstoqueUniforme(
  id: string,
  novoEstoque: number,
  motivo: string,
) {
  const { data: atual, error: e1 } = await supabase
    .from('uniformes').select('estoque_atual').eq('id', id).single();
  if (e1) throw e1;
  const delta = novoEstoque - (atual?.estoque_atual ?? 0);
  const { error: e2 } = await supabase.from('uniformes').update({ estoque_atual: novoEstoque }).eq('id', id);
  if (e2) throw e2;
  if (delta !== 0) {
    await supabase.from('movimentacoes_estoque').insert({
      tipo_item: 'uniforme',
      item_id: id,
      tipo_mov: delta > 0 ? 'entrada' : 'saida',
      quantidade: Math.abs(delta),
      motivo,
    });
  }
}

export async function resetarEstoqueUniforme(id: string) {
  await ajustarEstoqueUniforme(id, 0, 'Reset de estoque');
}
