// A regra fica em supabase/functions/_shared/convocacaoUniforme.ts (a mesma
// usada pela Edge Function que envia o e-mail). Aqui só adapta EPIFicha.
import { EPIFicha } from '@/types/epi';
import {
  ConvocacaoUniforme, ItemCatalogo, calcularTrocasUniforme as calcular,
} from '../../supabase/functions/_shared/convocacaoUniforme';

export {
  DIAS_AVISO, MESES_TROCA, criarClassificador, formatarData, situacaoTexto,
} from '../../supabase/functions/_shared/convocacaoUniforme';
export type { ConvocacaoUniforme, ItemCatalogo, SituacaoTroca } from '../../supabase/functions/_shared/convocacaoUniforme';

export function calcularTrocasUniforme(fichas: EPIFicha[], catalogo: ItemCatalogo[], hoje: Date = new Date()): ConvocacaoUniforme[] {
  return calcular(fichas.map(f => ({
    id: f.id, numero: f.numero, nome: f.nomeFuncionario, cpf: f.cpf, matricula: f.matricula, funcao: f.funcao,
    posto: f.posto, uf: f.uf, status: f.status, assinadoEm: f.assinadoEm, dataEntrega: f.dataEntrega,
    itens: f.itens.map(i => ({ epiId: i.epiId, descricao: i.descricao, recebido: i.recebido })),
  })), catalogo, hoje);
}
