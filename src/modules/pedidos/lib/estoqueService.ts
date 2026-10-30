import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Estoque do posto por plantão: o supervisor abre com foto e contagem, fecha
 * com foto, usado/recebido/contagem final, rubrica e declaração. As regras
 * ficam no banco (estoque_abrir_plantao / estoque_fechar_plantao).
 */

export interface Plantao {
  id: string; posto_id: string; uf: string; status: 'aberto' | 'fechado'; aberto_em: string; aberto_por_nome: string | null;
  fechado_em: string | null; fechado_por_nome: string | null; observacao_inicio: string | null; observacao_fim: string | null;
  assinatura: string | null; declaracao_aceita_em: string | null; tem_diferenca: boolean;
}
export interface ItemPlantao {
  plantao_id: string; material_id: string; qtd_inicio: number; qtd_recebida: number; qtd_usada: number | null; qtd_fim: number | null; diferenca: number | null;
}
export interface SaldoPosto { material_id: string; quantidade: number; atualizado_em: string }
export interface AnaliseItem {
  material_id: string; estoque: number; consumo_dia: number; dias_estoque: number | null; dias_com_pedido: number | null;
  quantidade_pedido: number; alerta: boolean; sem_historico: boolean; limite_dias: number;
}

const n = (v: unknown) => (v == null ? null : Number(v));

export async function saldoDoPosto(postoId: string): Promise<SaldoPosto[]> {
  const { data, error } = await supabase.from('estoque_posto').select('material_id, quantidade, atualizado_em').eq('posto_id', postoId);
  if (error) throw error;
  return (data ?? []).map(s => ({ ...s, quantidade: Number(s.quantidade) }));
}

/** Plantões do posto (o aberto, se houver, vem primeiro) com os itens. */
export async function plantoesDoPosto(postoId: string, limite = 30): Promise<(Plantao & { itens: ItemPlantao[] })[]> {
  const { data, error } = await supabase.from('estoque_plantoes')
    .select('id, posto_id, uf, status, aberto_em, aberto_por_nome, fechado_em, fechado_por_nome, observacao_inicio, observacao_fim, assinatura, declaracao_aceita_em, tem_diferenca')
    .eq('posto_id', postoId).order('aberto_em', { ascending: false }).limit(limite);
  if (error) throw error;
  const plantoes = (data ?? []) as Plantao[];
  if (!plantoes.length) return [];
  const { data: itens, error: e } = await supabase.from('estoque_plantao_itens').select('*').in('plantao_id', plantoes.map(p => p.id));
  if (e) throw e;
  const lista = (itens ?? []).map(i => ({ ...i, qtd_inicio: Number(i.qtd_inicio), qtd_recebida: Number(i.qtd_recebida),
    qtd_usada: n(i.qtd_usada), qtd_fim: n(i.qtd_fim), diferenca: n(i.diferenca) })) as ItemPlantao[];
  return plantoes.map(p => ({ ...p, itens: lista.filter(i => i.plantao_id === p.id) }))
    .sort((a, b) => (a.status === 'aberto' ? -1 : b.status === 'aberto' ? 1 : 0));
}

export async function fotosDoPlantao(plantaoId: string): Promise<{ inicio?: string; fim?: string }> {
  const { data, error } = await supabase.from('estoque_plantao_fotos').select('momento, foto').eq('plantao_id', plantaoId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(f => [f.momento, f.foto]));
}

const q = (v: number) => String(Math.round(v * 100) / 100);

export async function abrirPlantao(postoId: string, foto: string, itens: { material_id: string; quantidade: number }[], observacao: string) {
  const { data, error } = await supabase.rpc('estoque_abrir_plantao', {
    _posto_id: postoId, _foto: foto, _itens: itens.map(i => ({ material_id: i.material_id, quantidade: q(i.quantidade) })) as unknown as Json,
    _observacao: observacao.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function fecharPlantao(plantaoId: string, foto: string,
  itens: { material_id: string; usada: number; recebida: number; final: number }[], assinatura: string, ciente: boolean, observacao: string) {
  const { data, error } = await supabase.rpc('estoque_fechar_plantao', {
    _plantao_id: plantaoId, _foto: foto, _assinatura: assinatura, _ciente: ciente, _observacao: observacao.trim() || null,
    _itens: itens.map(i => ({ material_id: i.material_id, usada: q(i.usada), recebida: q(i.recebida), final: q(i.final) })) as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return data as { diferencas: number };
}

export async function cancelarPlantao(plantaoId: string) {
  const { error } = await supabase.rpc('estoque_cancelar_plantao', { _plantao_id: plantaoId });
  if (error) throw new Error(error.message);
}

export async function analisePedido(pedidoId: string): Promise<AnaliseItem[]> {
  const { data, error } = await supabase.rpc('estoque_analise_pedido', { _pedido_id: pedidoId });
  if (error) throw new Error(error.message);
  return (data ?? []).map(a => ({ ...a, estoque: Number(a.estoque), consumo_dia: Number(a.consumo_dia), dias_estoque: n(a.dias_estoque),
    dias_com_pedido: n(a.dias_com_pedido), quantidade_pedido: Number(a.quantidade_pedido) }));
}

/** Contagem final esperada: início + recebido - usado (nunca negativa). */
export const esperado = (inicio: number, recebida: number, usada: number) => Math.max(0, Math.round((inicio + recebida - usada) * 100) / 100);

/** Foto do celular reduzida para JPEG (lado maior 1280 px), para caber no banco. */
export function comprimirFoto(arquivo: File, lado = 1280, qualidade = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let saida = c.toDataURL('image/jpeg', qualidade);
      if (saida.length > 1_350_000) saida = c.toDataURL('image/jpeg', 0.5);
      resolve(saida);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a foto.')); };
    img.src = url;
  });
}
