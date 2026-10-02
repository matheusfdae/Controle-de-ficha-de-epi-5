import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { CodigoFornecedor } from '@/lib/nfe';

export interface EntradaCabecalho {
  numero_nf: string;
  serie: string;
  chave_acesso: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  data_emissao: string;
  origem: 'manual' | 'xml_nfe' | 'pdf_danfe';
  observacao: string;
}

export interface EntradaItem {
  epi_id: string;
  tamanho: string | null;
  quantidade: number;
  descricao_nf: string | null;
  codigo_fornecedor: string | null;
  valor_unitario: number | null;
}

export interface EntradaResumo {
  id: string;
  numero_nf: string | null;
  fornecedor_nome: string | null;
  data_entrada: string;
  origem: string;
  itens: number;
  unidades: number;
}

/** Grava a nota inteira numa transação (função registrar_entrada_estoque). */
export async function registrarEntrada(cabecalho: EntradaCabecalho, itens: EntradaItem[]): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_entrada_estoque', {
    _cabecalho: cabecalho as unknown as Json,
    _itens: itens as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function chaveJaLancada(chave: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('entradas_estoque').select('id', { count: 'exact', head: true }).eq('chave_acesso', chave);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function listCodigosFornecedor(cnpj: string): Promise<CodigoFornecedor[]> {
  const { data, error } = await supabase
    .from('epi_codigos_fornecedor')
    .select('fornecedor_cnpj, codigo_fornecedor, epi_id, tamanho')
    .eq('fornecedor_cnpj', cnpj.replace(/\D/g, ''));
  if (error) throw error;
  return data ?? [];
}

/** Tamanhos já cadastrados, agrupados por EPI (para sugerir na tela). */
export async function mapaTamanhos(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('epi_tamanhos').select('epi_id, tamanho').order('tamanho');
  if (error) throw error;
  const mapa: Record<string, string[]> = {};
  for (const t of data ?? []) (mapa[t.epi_id] ??= []).push(t.tamanho);
  return mapa;
}

export async function listUltimasEntradas(limite = 10): Promise<EntradaResumo[]> {
  const { data, error } = await supabase
    .from('entradas_estoque')
    .select('id, numero_nf, fornecedor_nome, data_entrada, origem, entradas_estoque_itens(quantidade)')
    .order('data_entrada', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(e => ({
    id: e.id, numero_nf: e.numero_nf, fornecedor_nome: e.fornecedor_nome,
    data_entrada: e.data_entrada, origem: e.origem,
    itens: e.entradas_estoque_itens.length,
    unidades: e.entradas_estoque_itens.reduce((s, i) => s + i.quantidade, 0),
  }));
}
