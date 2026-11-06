import { supabase } from '@/integrations/supabase/client';

/** Situação da consulta à SEFAZ de cada CNPJ (gravada pelo robô da VM). */
export interface EmpresaSefaz {
  cnpj: string; nome: string | null; ult_nsu: string; max_nsu: string | null;
  proxima_consulta_em: string | null; ultima_consulta_em: string | null; ultimo_status: string | null; ultimo_erro: string | null;
}

export interface NotaSefaz {
  chave: string; emitente_cnpj: string | null; emitente_nome: string | null; numero: string | null; emissao: string | null;
  valor_total: number | null; situacao: 'resumo' | 'completa' | 'cancelada'; ciencia_em: string | null; ciencia_erro: string | null;
}

export interface ItemNotaSefaz {
  id: string; chave: string; n_item: number; codigo: string | null; descricao: string; unidade: string | null;
  quantidade: number | null; valor_unit: number | null; material_id: string | null;
}

/** Produto de um fornecedor ainda sem material ligado (o item mais recente dele). */
export interface ProdutoSemLigacao {
  item: ItemNotaSefaz; fornecedor: string; fornecedor_cnpj: string; emissao: string | null; notas: number;
}

export interface Ligacao { fornecedor_cnpj: string; codigo: string; material_id: string; fator: number }

export const formatarCnpj = (c: string | null) =>
  c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c ?? '—';

export async function listarEmpresasSefaz(): Promise<EmpresaSefaz[]> {
  const { data, error } = await supabase.from('sefaz_empresas').select('*').order('nome');
  if (error) throw error;
  return (data ?? []) as EmpresaSefaz[];
}

export async function listarNotasSefaz(limite = 300): Promise<NotaSefaz[]> {
  const { data, error } = await supabase.from('notas_sefaz')
    .select('chave, emitente_cnpj, emitente_nome, numero, emissao, valor_total, situacao, ciencia_em, ciencia_erro')
    .order('emissao', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []).map(n => ({ ...n, valor_total: n.valor_total == null ? null : Number(n.valor_total) })) as NotaSefaz[];
}

export async function listarItensSefaz(chaves: string[]): Promise<ItemNotaSefaz[]> {
  if (!chaves.length) return [];
  const itens: ItemNotaSefaz[] = [];
  // Em partes, para a URL não ficar enorme.
  for (let i = 0; i < chaves.length; i += 100) {
    const { data, error } = await supabase.from('notas_sefaz_itens')
      .select('id, chave, n_item, codigo, descricao, unidade, quantidade, valor_unit, material_id')
      .in('chave', chaves.slice(i, i + 100)).order('n_item');
    if (error) throw error;
    itens.push(...(data ?? []).map(it => ({
      ...it,
      quantidade: it.quantidade == null ? null : Number(it.quantidade),
      valor_unit: it.valor_unit == null ? null : Number(it.valor_unit),
    })) as ItemNotaSefaz[]);
  }
  return itens;
}

export async function listarLigacoes(): Promise<Ligacao[]> {
  const { data, error } = await supabase.from('material_codigos_fornecedor').select('fornecedor_cnpj, codigo, material_id, fator');
  if (error) throw error;
  return (data ?? []).map(l => ({ ...l, fator: Number(l.fator) }));
}

/** Liga o código do fornecedor ao material (vale para as próximas notas) e aplica o preço. */
export async function ligarItem(itemId: string, materialId: string | null, fator = 1): Promise<void> {
  const { error } = await supabase.rpc('sefaz_vincular_item', { _item_id: itemId, _material_id: materialId, _fator: fator });
  if (error) throw error;
}

/** Um produto por fornecedor + código, das notas completas, que ainda não tem material. */
export function produtosSemLigacao(notas: NotaSefaz[], itens: ItemNotaSefaz[]): ProdutoSemLigacao[] {
  const porChave = new Map(notas.map(n => [n.chave, n]));
  const grupos = new Map<string, ProdutoSemLigacao>();
  for (const it of itens) {
    const n = porChave.get(it.chave);
    if (!n || n.situacao !== 'completa' || it.material_id || !it.codigo || !n.emitente_cnpj) continue;
    const k = `${n.emitente_cnpj}|${it.codigo}`;
    const atual = grupos.get(k);
    if (!atual) {
      grupos.set(k, { item: it, fornecedor: n.emitente_nome ?? formatarCnpj(n.emitente_cnpj), fornecedor_cnpj: n.emitente_cnpj, emissao: n.emissao, notas: 1 });
    } else {
      atual.notas++;
      if ((n.emissao ?? '') > (atual.emissao ?? '')) { atual.item = it; atual.emissao = n.emissao; }
    }
  }
  return [...grupos.values()].sort((a, b) => (b.emissao ?? '').localeCompare(a.emissao ?? ''));
}
