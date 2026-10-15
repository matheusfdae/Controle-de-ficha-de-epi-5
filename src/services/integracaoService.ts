import type { EPIFicha, EPIItem, Turno } from '@/types/epi';
import type { EPI, FuncaoEPI } from '@/services/estoqueService';
import type { Posto } from '@/services/postosService';
import type { ColaboradorLista } from '@/services/colaboradoresSeniorService';
import { generateId, saveFicha } from '@/services/fichaService';
import { nomePostoTrabalho, turnoDaEscala, formatCpf } from '@/services/seniorService';
import { empresaPelaMatricula } from '@/lib/empresaPelaMatricula';
import { chaveSolta, limparNomePosto } from '@/lib/geoPlanilha';

/** Dados do colaborador para as fichas da admissão (vindos da Senior ou do cadastro manual). */
export interface AdmitidoFicha {
  nome: string;
  cpf: string;
  telefone: string;
  matricula: string;
  funcao: string;
  empresa: string;
  posto: string;
  uf: string;
  turno: Turno;
  localSenior?: string;
  centroCustoCodigo?: string;
  centroCusto?: string;
  postoTrabalhoCodigo?: string;
  postoTrabalho?: string;
  escala?: string;
}

/** Item do kit (Tipo de uniforme) já com o tipo do catálogo, para separar EPI de uniforme. */
export interface ItemAdmissao {
  epiId: string;
  nome: string;
  ca: string;
  tipo: 'epi' | 'uniforme';
  quantidade: number;
  tamanho: string;
  incluir: boolean;
}

/** Posto do cadastro de postos que bate com o nome (ou apelido); senão o nome limpo. */
export function postoCadastrado(postos: Posto[], ...textos: (string | null | undefined)[]): { nome: string; uf?: string } | null {
  for (const t of textos) {
    if (!t) continue;
    const limpo = limparNomePosto(t);
    const chaves = new Set([chaveSolta(limpo), chaveSolta(t)]);
    const achado = postos.find(p => [p.nome, ...p.apelidos].some(n => chaves.has(chaveSolta(n))));
    if (achado) return { nome: achado.nome, uf: achado.uf };
  }
  const primeiro = textos.find(Boolean);
  return primeiro ? { nome: limparNomePosto(primeiro) } : null;
}

/** Converte um colaborador da lista da Senior nos dados da ficha. */
export function admitidoDaSenior(c: ColaboradorLista, postos: Posto[], empresaPadrao: string): AdmitidoFicha {
  const matricula = String(c.num_cad);
  const posto = postoCadastrado(postos, nomePostoTrabalho(c.posto_descricao), c.nome_local);
  return {
    nome: c.nome,
    cpf: c.cpf ? formatCpf(c.cpf) : '',
    telefone: c.telefone ?? '',
    matricula,
    funcao: c.cargo ?? '',
    empresa: empresaPelaMatricula(matricula) ?? empresaPadrao,
    posto: posto?.nome ?? '',
    uf: c.uf ?? '',
    turno: turnoDaEscala(c.escala_nome) ?? 'diurno',
    localSenior: c.nome_local ?? '',
    centroCustoCodigo: c.cod_centro_custo ?? '',
    centroCusto: c.centro_custo ?? '',
    postoTrabalhoCodigo: c.posto_codigo ?? '',
    postoTrabalho: c.posto_descricao ?? '',
    escala: c.escala_nome ?? '',
  };
}

/** Itens do kit (Tipo de uniforme), com o tipo de cada um vindo do catálogo. */
export function itensDoKit(vinculos: FuncaoEPI[], catalogo: EPI[]): ItemAdmissao[] {
  return vinculos.flatMap(v => {
    const e = catalogo.find(x => x.id === v.epi_id);
    if (!e) return [];
    return [{
      epiId: e.id, nome: e.nome, ca: e.ca_numero ?? '', tipo: e.tipo === 'uniforme' ? 'uniforme' : 'epi',
      quantidade: v.quantidade || 1, tamanho: v.tamanho ?? '', incluir: true,
    } as ItemAdmissao];
  });
}

/** Itens incluídos que precisam de tamanho e estão sem (item controlado por tamanho no estoque). */
export function faltaTamanho(itens: ItemAdmissao[], tamanhos: Record<string, string[]>): ItemAdmissao[] {
  return itens.filter(i => i.incluir && !i.tamanho.trim()
    && (tamanhos[i.epiId] ?? []).some(t => t.toUpperCase() !== 'ÚNICO'));
}

/**
 * Gera as fichas de admissão pendentes de assinatura: uma de EPI e uma de
 * uniforme (só as que tiverem itens). Devolve quantas fichas foram criadas.
 */
export async function gerarFichasAdmissao(a: AdmitidoFicha, itens: ItemAdmissao[], modeloId?: string): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);
  let criadas = 0;
  for (const tipo of ['epi', 'uniforme'] as const) {
    const doTipo = itens.filter(i => i.incluir && i.tipo === tipo);
    if (!doTipo.length) continue;
    const ficha: EPIFicha = {
      id: generateId(),
      nomeFuncionario: a.nome,
      funcao: a.funcao,
      telefone: a.telefone,
      motivo: 'admissao',
      turno: a.turno,
      empresa: a.empresa,
      cpf: a.cpf,
      matricula: a.matricula,
      posto: a.posto,
      uf: a.uf,
      dataEntrega: hoje,
      localSenior: a.localSenior ?? '',
      centroCustoCodigo: a.centroCustoCodigo ?? '',
      centroCusto: a.centroCusto ?? '',
      postoTrabalhoCodigo: a.postoTrabalhoCodigo ?? '',
      postoTrabalho: a.postoTrabalho ?? '',
      escala: a.escala ?? '',
      itens: doTipo.map<EPIItem>(i => ({
        id: generateId(), descricao: i.nome, ca: i.ca, quantidade: i.quantidade, tamanho: i.tamanho.trim(),
        dataEntrega: hoje, postoServico: a.posto, recebido: false, epiId: i.epiId,
      })),
      status: 'pendente',
      criadoEm: new Date().toISOString(),
      observacoes: 'Gerada pela Integração (admissão)',
      modeloId,
    };
    await saveFicha(ficha);
    criadas++;
  }
  return criadas;
}
