// A regra fica em supabase/functions/_shared/convocacaoUniforme.ts (a mesma
// usada pela Edge Function que envia o e-mail). Aqui só adapta EPIFicha.
import { EPIFicha } from '@/types/epi';
import {
  ColaboradorSeniorBase, ConvocacaoUniforme, ItemCatalogo, PostoTroca, calcularTrocasUniforme as calcular,
  criarBuscaSenior, criarRegraTroca,
} from '../../supabase/functions/_shared/convocacaoUniforme';

export {
  DIAS_AVISO, MESES_TROCA_PADRAO, chaveTexto, criarClassificador, criarRegraTroca, formatarData, regraTexto, situacaoTexto,
} from '../../supabase/functions/_shared/convocacaoUniforme';
export type {
  ColaboradorSeniorBase, ConvocacaoUniforme, ItemCatalogo, PostoTroca, RegraTroca, SituacaoTroca,
} from '../../supabase/functions/_shared/convocacaoUniforme';

export function calcularTrocasUniforme(
  fichas: EPIFicha[], catalogo: ItemCatalogo[], hoje: Date = new Date(), postos: PostoTroca[] = [],
  senior: ColaboradorSeniorBase[] = [],
): ConvocacaoUniforme[] {
  return calcular(fichas.map(f => ({
    id: f.id, numero: f.numero, nome: f.nomeFuncionario, cpf: f.cpf, matricula: f.matricula, funcao: f.funcao,
    posto: f.posto, uf: f.uf, status: f.status, assinadoEm: f.assinadoEm, dataEntrega: f.dataEntrega,
    itens: f.itens.map(i => ({ epiId: i.epiId, descricao: i.descricao, recebido: i.recebido })),
  })), catalogo, hoje, criarRegraTroca(postos), criarBuscaSenior(senior));
}
