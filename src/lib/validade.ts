import { EPIFicha, EPIItem } from '@/types/epi';

/**
 * Retorna a data de validade efetiva de um item.
 * - Se o item já possui dataValidade explícita, usa-a.
 * - Caso contrário, calcula a partir da data de assinatura da ficha + diasValidade.
 * - Se a ficha ainda não foi assinada, retorna undefined.
 */
export function getItemValidade(
  item: EPIItem,
  ficha: Pick<EPIFicha, 'assinadoEm' | 'dataEntrega' | 'status'>,
  diasValidade: number,
): string | undefined {
  if (item.dataValidade) return item.dataValidade;
  const base = ficha.assinadoEm || (ficha.status === 'assinada' ? ficha.dataEntrega : undefined);
  if (!base || !diasValidade) return undefined;
  const d = new Date(base);
  d.setDate(d.getDate() + diasValidade);
  return d.toISOString().split('T')[0];
}
