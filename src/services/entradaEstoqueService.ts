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
  /** Estado que está recebendo a nota. */
  uf: string;
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
  uf: string;
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

export interface NotaLancada {
  id: string;
  numero_nf: string | null;
  fornecedor_nome: string | null;
  data_entrada: string;
}

/** "000123" e "123" são a mesma NF (e a mesma série); texto livre fica como está. */
export function normalizarNumeroNf(valor: string | null | undefined): string {
  const v = (valor ?? '').trim();
  return /^\d+$/.test(v) ? String(Number(v)) : v;
}

/**
 * Entrada já registrada para esta nota: pela chave de acesso quando houver;
 * sem chave (nota digitada, PDF escaneado), por CNPJ do emitente + número + série.
 */
export async function buscarNotaLancada(
  cab: Pick<EntradaCabecalho, 'chave_acesso' | 'fornecedor_cnpj' | 'numero_nf' | 'serie'>,
): Promise<NotaLancada | null> {
  const chave = (cab.chave_acesso ?? '').replace(/\D/g, '');
  const cnpj = cab.fornecedor_cnpj.replace(/\D/g, '');
  const numero = normalizarNumeroNf(cab.numero_nf);
  let query = supabase.from('entradas_estoque').select('id, numero_nf, fornecedor_nome, data_entrada');
  if (chave.length === 44) {
    query = query.eq('chave_acesso', chave);
  } else if (cnpj.length === 14 && numero) {
    query = query.eq('fornecedor_cnpj', cnpj).eq('numero_nf', numero);
    const serie = normalizarNumeroNf(cab.serie);
    // Lançamento antigo sem série também conta: na dúvida, avisa.
    if (/^\d+$/.test(serie)) query = query.or(`serie.is.null,serie.eq.${serie}`);
  } else {
    return null;
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
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
    .select('id, numero_nf, fornecedor_nome, data_entrada, origem, uf, entradas_estoque_itens(quantidade)')
    .order('data_entrada', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(e => ({
    id: e.id, numero_nf: e.numero_nf, fornecedor_nome: e.fornecedor_nome,
    data_entrada: e.data_entrada, origem: e.origem, uf: e.uf,
    itens: e.entradas_estoque_itens.length,
    unidades: e.entradas_estoque_itens.reduce((s, i) => s + i.quantidade, 0),
  }));
}
