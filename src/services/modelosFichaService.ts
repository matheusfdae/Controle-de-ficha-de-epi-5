import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type ModeloRow = Database['public']['Tables']['modelos_ficha']['Row'];
type ModeloInsert = Database['public']['Tables']['modelos_ficha']['Insert'];

export type LayoutCabecalho = 'completo' | 'compacto';
export type ColunaExtra = 'tamanho' | 'ca';

export interface ModeloFicha {
  id: string;
  nome: string;
  ativo: boolean;
  padrao: boolean;
  tituloDocumento: string;
  textoTermoResponsabilidade: string;
  textoDeclaracao: string;
  layoutCabecalho: LayoutCabecalho;
  colunaExtra: ColunaExtra;
  mostrarSegundoLogo: boolean;
  textoSecaoExtra: string | null;
  /** Logo própria do modelo (base64). null = usa a logo global (Configurações). */
  logoDataUrl: string | null;
}

function mapFromDB(row: ModeloRow): ModeloFicha {
  return {
    id: row.id,
    nome: row.nome,
    ativo: row.ativo,
    padrao: row.padrao,
    tituloDocumento: row.titulo_documento,
    textoTermoResponsabilidade: row.texto_termo_responsabilidade,
    textoDeclaracao: row.texto_declaracao,
    layoutCabecalho: row.layout_cabecalho as LayoutCabecalho,
    colunaExtra: row.coluna_extra as ColunaExtra,
    mostrarSegundoLogo: row.mostrar_segundo_logo,
    textoSecaoExtra: row.texto_secao_extra,
    logoDataUrl: row.logo_data_url,
  };
}

function mapToDB(m: Partial<ModeloFicha> & { nome: string }): ModeloInsert {
  return {
    id: m.id,
    nome: m.nome,
    ativo: m.ativo,
    titulo_documento: m.tituloDocumento ?? '',
    texto_termo_responsabilidade: m.textoTermoResponsabilidade ?? '',
    texto_declaracao: m.textoDeclaracao ?? '',
    layout_cabecalho: m.layoutCabecalho,
    coluna_extra: m.colunaExtra,
    mostrar_segundo_logo: m.mostrarSegundoLogo,
    texto_secao_extra: m.textoSecaoExtra || null,
    logo_data_url: m.logoDataUrl || null,
  };
}

export async function listModelos(): Promise<ModeloFicha[]> {
  const { data, error } = await supabase.from('modelos_ficha').select('*').order('nome');
  if (error) throw error;
  return (data || []).map(mapFromDB);
}

export async function listModelosAtivos(): Promise<ModeloFicha[]> {
  const { data, error } = await supabase
    .from('modelos_ficha').select('*').eq('ativo', true).order('nome');
  if (error) throw error;
  return (data || []).map(mapFromDB);
}

export async function getModeloPadrao(): Promise<ModeloFicha | undefined> {
  const { data, error } = await supabase
    .from('modelos_ficha').select('*').eq('padrao', true).maybeSingle();
  if (error) throw error;
  return data ? mapFromDB(data) : undefined;
}

export async function getModelo(id: string): Promise<ModeloFicha | undefined> {
  const { data, error } = await supabase
    .from('modelos_ficha').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapFromDB(data) : undefined;
}

export async function upsertModelo(m: Partial<ModeloFicha> & { nome: string }): Promise<ModeloFicha> {
  const { data, error } = await supabase
    .from('modelos_ficha').upsert(mapToDB(m)).select().single();
  if (error) throw error;
  return mapFromDB(data);
}

export async function deleteModelo(id: string): Promise<void> {
  const { error } = await supabase.from('modelos_ficha').delete().eq('id', id);
  if (error) throw error;
}

/** Modelo usado como último recurso se o banco não tiver nenhum modelo cadastrado. */
export const FALLBACK_MODELO: ModeloFicha = {
  id: '',
  nome: 'Padrão',
  ativo: true,
  padrao: true,
  tituloDocumento: "TERMO DE RECEBIMENTO DE UNIFORME/EPI's - REV -00",
  textoTermoResponsabilidade: "Declaro que recebi gratuitamente nesta data os EPI'S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: \"Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI's fornecidos pela empresa\". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT, inclusive no que couber a título de indenização por rescisão de contrato de trabalho a importância correspondente ao valor do material.",
  textoDeclaracao: 'DECLARO para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços. Acrescento ainda que estou ciente que: quaisquer ajustes feitos neste material que possam impedir prejudicar limitar ou ainda causar algum dano ao meu serviço ou material são de MINHA responsabilidade.',
  layoutCabecalho: 'completo',
  colunaExtra: 'tamanho',
  mostrarSegundoLogo: false,
  textoSecaoExtra: null,
  logoDataUrl: null,
};

/** Resolve o modelo de uma ficha: o dela própria, senão o padrão, senão o fallback fixo. */
export async function resolveModelo(modeloId?: string): Promise<ModeloFicha> {
  if (modeloId) {
    const m = await getModelo(modeloId);
    if (m) return m;
  }
  const padrao = await getModeloPadrao();
  return padrao ?? FALLBACK_MODELO;
}

/** Marca um modelo como padrão, desmarcando o anterior (respeita o unique index parcial). */
export async function setModeloPadrao(id: string): Promise<void> {
  const { error: unsetErr } = await supabase
    .from('modelos_ficha').update({ padrao: false }).eq('padrao', true);
  if (unsetErr) throw unsetErr;
  const { error: setErr } = await supabase
    .from('modelos_ficha').update({ padrao: true }).eq('id', id);
  if (setErr) throw setErr;
}
