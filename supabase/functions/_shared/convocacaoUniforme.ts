// Regra da troca de uniforme, usada pela tela (Vencimentos) e pela Edge
// Function que envia a convocação por e-mail. Sem imports de Deno/npm de
// propósito: roda nos dois lados e é testada pelo vitest.
//
// Troca: MESES_TROCA meses depois da ASSINATURA da última ficha de uniforme
// do colaborador (pedido do Matheus, 08/10/2026). Datas no fuso de Brasília.

export const MESES_TROCA = 3;
export const DIAS_AVISO = 30;
const FUSO = 'America/Sao_Paulo';

export type SituacaoTroca = 'vencido' | 'proximo' | 'em_dia';

export interface ItemCatalogo { id: string; nome: string; tipo: 'epi' | 'uniforme' }

export interface ItemFichaBase { epiId?: string | null; descricao?: string | null; recebido?: boolean | null }

export interface FichaBase {
  id: string;
  numero?: number | null;
  nome: string;
  cpf?: string | null;
  matricula?: string | null;
  funcao?: string | null;
  posto?: string | null;
  uf: string;
  status: string; // 'assinada' conta
  /** timestamp ISO da assinatura do colaborador */
  assinadoEm?: string | null;
  /** yyyy-MM-dd */
  dataEntrega?: string | null;
  itens: ItemFichaBase[];
}

export interface ConvocacaoUniforme {
  chave: string;
  nome: string;
  cpf: string;
  matricula: string;
  funcao: string;
  posto: string;
  uf: string;
  fichaId: string;
  fichaNumero?: number;
  /** yyyy-MM-dd */
  dataAssinatura: string;
  /** Ficha assinada sem data de assinatura registrada: usou a data de entrega. */
  semDataAssinatura: boolean;
  /** yyyy-MM-dd */
  dataTroca: string;
  diasRestantes: number;
  situacao: SituacaoTroca;
  itens: string[];
}

/** Ignora maiúsculas, acentos, hífens e espaços. */
export function chaveTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Data (yyyy-MM-dd) em Brasília de um instante. */
export function dataBrasilia(instante: Date | string): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante;
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Soma meses a yyyy-MM-dd; 31/01 + 1 mês = 28 ou 29/02 (último dia do mês). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);
}

export function formatarData(iso: string): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Tipo do item da ficha: pelo catálogo (epiId) ou, se digitado à mão, pela descrição. */
export function criarClassificador(catalogo: ItemCatalogo[]) {
  const porId = new Map(catalogo.map(c => [c.id, c.tipo]));
  const porNome = new Map(catalogo.map(c => [chaveTexto(c.nome), c.tipo]));
  return (item: ItemFichaBase): 'epi' | 'uniforme' | null =>
    (item.epiId && porId.get(item.epiId)) || porNome.get(chaveTexto(item.descricao || '')) || null;
}

/** Mesmo colaborador: pelo CPF; sem CPF, pelo nome. */
export function chaveColaborador(f: { cpf?: string | null; nome: string }): string {
  const cpf = (f.cpf || '').replace(/\D/g, '');
  return cpf.length >= 11 ? `cpf:${cpf}` : `nome:${chaveTexto(f.nome || '')}`;
}

export function calcularTrocasUniforme(
  fichas: FichaBase[], catalogo: ItemCatalogo[], hoje: Date = new Date(),
): ConvocacaoUniforme[] {
  const tipoDe = criarClassificador(catalogo);
  const hojeIso = dataBrasilia(hoje);
  const ultima = new Map<string, { f: FichaBase; data: string; semData: boolean; itens: string[] }>();

  for (const f of fichas) {
    if (f.status !== 'assinada') continue;
    // Itens entregues = marcados como recebidos; ficha antiga sem nenhuma marca conta todos.
    const entregues = f.itens.some(i => i.recebido) ? f.itens.filter(i => i.recebido) : f.itens;
    const uniformes = entregues.filter(i => tipoDe(i) === 'uniforme');
    if (uniformes.length === 0) continue;
    const data = f.assinadoEm ? dataBrasilia(f.assinadoEm) : (f.dataEntrega || '').slice(0, 10);
    if (!data) continue;
    const k = chaveColaborador(f);
    const atual = ultima.get(k);
    if (!atual || data > atual.data) {
      ultima.set(k, { f, data, semData: !f.assinadoEm, itens: uniformes.map(i => i.descricao || '') });
    }
  }

  return Array.from(ultima.entries()).map(([chave, { f, data, semData, itens }]) => {
    const dataTroca = somarMeses(data, MESES_TROCA);
    const dias = diasEntre(hojeIso, dataTroca);
    const c: ConvocacaoUniforme = {
      chave,
      nome: f.nome,
      cpf: f.cpf || '',
      matricula: f.matricula || '',
      funcao: f.funcao || '',
      posto: f.posto || '',
      uf: f.uf,
      fichaId: f.id,
      fichaNumero: f.numero ?? undefined,
      dataAssinatura: data,
      semDataAssinatura: semData,
      dataTroca,
      diasRestantes: dias,
      situacao: dias <= 0 ? 'vencido' : dias <= DIAS_AVISO ? 'proximo' : 'em_dia',
      itens,
    };
    return c;
  }).sort((a, b) => a.diasRestantes - b.diasRestantes || a.nome.localeCompare(b.nome));
}

export const situacaoTexto = (t: Pick<ConvocacaoUniforme, 'diasRestantes'>) =>
  t.diasRestantes <= 0 ? `Vencido há ${Math.abs(t.diasRestantes)} dias` : `Vence em ${t.diasRestantes} dias`;
