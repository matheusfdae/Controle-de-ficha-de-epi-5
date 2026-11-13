import { supabase } from '@/integrations/supabase/client';
import {
  MOTIVOS_SENIOR, motivoSenior, parametrosEnvio, type PadraoPosto, type SituacaoSenior,
} from '../../../../supabase/functions/_shared/trocaPostoSenior';

/**
 * Troca de posto do colaborador: pedido -> aprovação -> (administrador) envio à
 * Senior pelo serviço historicos / Posto_4, com releitura e opção de desfazer.
 */

export { MOTIVOS_SENIOR, motivoSenior };
export type { PadraoPosto, SituacaoSenior };

export type StatusTroca = 'pendente' | 'aprovada' | 'recusada' | 'cancelada' | 'enviando' | 'enviada' | 'erro_envio' | 'desfeita';

export const STATUS_ROTULO: Record<StatusTroca, string> = {
  pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada',
  enviando: 'Enviando à Senior', enviada: 'Gravada na Senior', erro_envio: 'Erro no envio', desfeita: 'Desfeita na Senior',
};

export const MOTIVOS = [
  'Remanejamento operacional',
  'Pedido do cliente',
  'Pedido do colaborador',
  'Abertura de posto',
  'Encerramento do posto',
  'Cobertura definitiva',
  'Promoção / mudança de função',
  'Outro',
] as const;

export interface ColaboradorTroca {
  id: string; nome: string; matricula: number; num_emp: number; tip_col: number;
  cargo: string | null; uf: string | null; local: string | null; empresa: string | null;
  posto_estrutura: number | null; posto_codigo: string | null; posto_descricao: string | null;
  escala_codigo: number | null; escala_nome: string | null;
  /** Código da troca pendente deste colaborador, se houver. */
  pendente: string | null;
  cod_cargo?: string | null; centro_custo?: string | null;
}
/** empresas: empresas de quem está lotado no posto hoje (o posto só serve para essas). */
export interface PostoSenior { estrutura: number; codigo: string; descricao: string | null; uf: string | null; colaboradores: number; empresas?: number[] }

/** Posto serve para o colaborador: mesma empresa e mesma estrutura de postos. */
export const postoDaMesmaEmpresa = (p: PostoSenior, c: { num_emp: number; posto_estrutura: number | null }) =>
  c.posto_estrutura != null && p.estrutura === c.posto_estrutura && (!p.empresas || p.empresas.includes(c.num_emp));
export interface EscalaSenior { codigo: number; nome: string | null; colaboradores: number }

export interface TrocaPosto {
  id: string; codigo: string; created_at: string; status: StatusTroca;
  colaborador_senior_id: string | null; num_emp: number; tip_col: number; num_cad: number;
  colaborador_nome: string; cargo: string | null; uf: string | null;
  posto_atual_estrutura: number | null; posto_atual_codigo: string | null; posto_atual_descricao: string | null;
  escala_atual_codigo: number | null; escala_atual_nome: string | null; local_atual: string | null;
  posto_novo_estrutura: number; posto_novo_codigo: string; posto_novo_descricao: string | null;
  escala_nova_codigo: number | null; escala_nova_nome: string | null;
  data_inicio: string; motivo: string; observacao: string | null;
  solicitante_id: string | null; solicitante_nome: string | null;
  decidido_por: string | null; decidido_nome: string | null; decidido_em: string | null; decisao_obs: string | null;
  senior_enviado_em: string | null; senior_resposta: string | null;
  motivo_senior: number | null; manter_cargo: boolean; cargo_atual_codigo: string | null;
  centro_custo_atual: string | null; padrao_posto: PadraoComNomes | null;
  senior_enviado_por: string | null; senior_desfeito_em: string | null; senior_envio_iniciado_em?: string | null;
  senior_lido: (Partial<SituacaoSenior> & { erro_leitura?: string }) | null;
}

/** O que a Senior aplica com o posto, com os nomes que conhecemos. */
export interface PadraoComNomes extends PadraoPosto { cargo_nome?: string | null; centro_custo_nome?: string | null }

export interface DadosSolicitacao {
  colaborador_senior_id: string;
  posto_estrutura: number; posto_codigo: string;
  escala_codigo: number | null;
  data_inicio: string; motivo: string; observacao: string;
  motivo_senior: number; manter_cargo: boolean; padrao_posto: PadraoComNomes | null;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, (args ?? {}) as never);
  if (error) throw new Error(error.message?.includes('Failed to fetch') ? 'Sem conexão com o servidor.' : error.message);
  return data as T;
}

export const buscarColaborador = (busca: string) => rpc<ColaboradorTroca[]>('troca_posto_buscar_colaborador', { _busca: busca });
export const opcoesSenior = () => rpc<{ postos: PostoSenior[]; escalas: EscalaSenior[] }>('troca_posto_opcoes');
export const solicitarTroca = (d: DadosSolicitacao) => rpc<{ id: string; codigo: string }>('troca_posto_solicitar', { _dados: d });
export const decidirTroca = (id: string, aprovar: boolean, obs: string) => rpc<void>('troca_posto_decidir', { _id: id, _aprovar: aprovar, _obs: obs });
export const cancelarTroca = (id: string) => rpc<void>('troca_posto_cancelar', { _id: id });

// ---------- Link do fiscal (/movimentacao-diaria, aba "Troca de posto") ----------
/** Pedido feito pelo fiscal no link (o que ele vê na aba). */
export interface TrocaDoFiscal {
  codigo: string; criado_em: string; status: StatusTroca; colaborador_nome: string; matricula: number;
  posto_atual: string | null; posto_atual_codigo: string | null; posto_novo: string | null; posto_novo_codigo: string;
  data_inicio: string; motivo: string; decisao_obs: string | null;
}
export interface DadosPedidoFiscal {
  colaborador_senior_id: string; posto_estrutura: number; posto_codigo: string;
  data_inicio: string; motivo: string; observacao: string; motivo_senior: number;
}
type Fiscal = { matricula?: number; cpf?: string };
async function publica<T>(fn: string, s: Fiscal, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rpc<(T & { erro?: string }) | null>(fn, { _sol_matricula: s.matricula ?? null, _sol_cpf: s.cpf ?? null, ...args });
  if (r && typeof r === 'object' && !Array.isArray(r) && (r as { erro?: string }).erro) throw new Error((r as { erro: string }).erro);
  return r as T;
}
export const fiscalBuscarColaborador = (s: Fiscal, busca: string) => publica<ColaboradorTroca[]>('movimentacao_troca_buscar', s, { _busca: busca });
export const fiscalPostos = (s: Fiscal, colaboradorId: string) => publica<PostoSenior[]>('movimentacao_troca_postos', s, { _colaborador: colaboradorId });
export const fiscalMinhasTrocas = (s: Fiscal) => publica<TrocaDoFiscal[]>('movimentacao_troca_minhas', s);
export const fiscalSolicitarTroca = (s: Fiscal, d: DadosPedidoFiscal) =>
  publica<{ ok: true; codigo: string; minhas: TrocaDoFiscal[] }>('movimentacao_troca_solicitar', s, { _dados: d });

/** Tabela nova ainda fora do types.ts gerado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase as unknown as { from: (t: string) => any }).from(nome);

const SEM_RESPOSTA = 'O servidor não recebeu resposta da Senior a tempo (ela pode estar lenta). Use "Conferir na Senior" antes de tentar de novo.';

/** Chamada à Senior: no npm run dev sai do PC (vite); na produção, pela função troca-posto-senior. */
async function senior<T>(corpo: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    const res = await fetch('/__senior/troca-posto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.error || `Senior: HTTP ${res.status}`);
    return r as T;
  }
  const { data, error } = await supabase.functions.invoke('troca-posto-senior', { body: corpo });
  if (error) {
    // Função cortada pelo limite de tempo da VM: a resposta não é JSON.
    const corpoErro = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corpoErro?.error ?? SEM_RESPOSTA);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Cargo, local e centro de custo que a Senior aplica com o posto (com os nomes). */
export async function padraoDoPosto(estrutura: number, posto: string): Promise<PadraoComNomes | null> {
  const { padrao } = await senior<{ padrao: PadraoPosto[] }>({ acao: 'padrao', estrutura, posto });
  const p = padrao[0];
  if (!p) return null;
  const nomes = await rpc<{ cargos: Record<string, string>; centros: Record<string, string> }>('troca_posto_nomes',
    { _cargos: padrao.map(x => x.cargo).filter(Boolean), _centros: padrao.map(x => x.centroCusto).filter(Boolean) }).catch(() => null);
  return { ...p, cargo_nome: p.cargo ? nomes?.cargos[p.cargo] ?? null : null, centro_custo_nome: p.centroCusto ? nomes?.centros[p.centroCusto] ?? null : null };
}

/**
 * Envia (ou desfaz) a troca na Senior: UMA chamada à Senior. Devolve a troca
 * atualizada, o erro da Senior (recusou) ou pendente = a Senior não respondeu a
 * tempo (a troca fica "enviando"; confira com conferirSenior).
 */
export async function acaoSenior(t: TrocaPosto, acao: 'enviar' | 'desfazer'): Promise<{ erro: string | null; pendente: boolean; troca: TrocaPosto }> {
  if (import.meta.env.DEV) {
    if (acao === 'enviar') await rpc<TrocaPosto>('troca_posto_marcar_enviando', { _id: t.id });
    const r = await senior<{ erro: string | null; pendente?: boolean }>({ acao, troca: t });
    const troca = await rpc<TrocaPosto>('troca_posto_registrar_senior', {
      _id: t.id, _acao: r.pendente ? (acao === 'enviar' ? 'demorou' : 'desfazer_demorou') : acao, _erro: r.erro, _lido: null,
    });
    return { erro: r.erro, pendente: !!r.pendente, troca };
  }
  const r = await senior<{ erro: string | null; pendente?: boolean; troca: TrocaPosto }>({ acao, id: t.id });
  return { erro: r.erro, pendente: !!r.pendente, troca: r.troca };
}

/** Relê o colaborador na Senior e confirma se a troca gravou (ou se desfez). */
export async function conferirSenior(t: TrocaPosto): Promise<TrocaPosto> {
  if (import.meta.env.DEV) {
    const r = await senior<{ lido: unknown }>({ acao: 'conferir', troca: t });
    return rpc<TrocaPosto>('troca_posto_registrar_senior', { _id: t.id, _acao: 'conferir', _erro: null, _lido: r.lido });
  }
  return (await senior<{ troca: TrocaPosto }>({ acao: 'conferir', id: t.id })).troca;
}

/** "Enviando" parado há mais de 3 min pode ser reenviado (o servidor também confere). */
export const envioParado = (t: Pick<TrocaPosto, 'status' | 'senior_envio_iniciado_em'>, agora = Date.now()) =>
  t.status === 'enviando' && (!t.senior_envio_iniciado_em || agora - new Date(t.senior_envio_iniciado_em).getTime() > 3 * 60 * 1000);

export async function listarTrocas(): Promise<TrocaPosto[]> {
  const { data, error } = await tabela('trocas_posto').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------- Regras puras (testadas) ----------

export const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const dataHoraBr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';

/** "Descrição (estrutura/código)" ou só o código. */
export const nomePosto = (descricao: string | null | undefined, estrutura: number | null | undefined, codigo: string | null | undefined) =>
  !codigo ? 'sem posto na Senior' : `${descricao?.trim() || 'Posto sem nome'} (${estrutura ?? '?'}/${codigo})`;

const NOTAS: Record<string, string> = {
  numEmp: 'empresa', tipCol: 'tipo de colaborador', numCad: 'matrícula', iniAtu: 'início no posto novo',
  posTra: 'posto novo', motPos: 'motivo na Senior', obsPos: 'observação', codEsc: 'escala nova',
  codCar: 'mantém o cargo', tipOpe: 'incluir',
};

/** Exatamente o que vai para a Senior (serviço historicos, operação Posto_4). */
export function previaSenior(t: Pick<TrocaPosto, 'codigo' | 'num_emp' | 'tip_col' | 'num_cad' | 'posto_novo_codigo' | 'data_inicio' | 'motivo'
  | 'observacao' | 'motivo_senior' | 'escala_nova_codigo' | 'manter_cargo' | 'cargo_atual_codigo'>) {
  return Object.entries(parametrosEnvio(t)).map(([campo, v]) => ({
    campo, valor: campo === 'motPos' ? `${v} - ${MOTIVOS_SENIOR[Number(v)] ?? ''}` : String(v), nota: NOTAS[campo] ?? '',
  }));
}

/** Filtro da lista: status + texto (nome, matrícula, código, posto). */
export function filtrarTrocas(ts: TrocaPosto[], status: StatusTroca | 'todas', busca: string) {
  const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const palavras = sem(busca).split(/\s+/).filter(Boolean);
  return ts.filter(t => (status === 'todas' || t.status === status) && palavras.every(p => sem([
    t.colaborador_nome, t.num_cad, t.codigo, t.posto_atual_descricao, t.posto_novo_descricao, t.posto_novo_codigo, t.motivo, t.solicitante_nome,
  ].filter(v => v != null).join(' ')).includes(p)));
}
