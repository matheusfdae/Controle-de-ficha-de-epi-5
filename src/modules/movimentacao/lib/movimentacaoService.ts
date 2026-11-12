import { supabase } from '@/integrations/supabase/client';
import type { Solicitante } from '@/modules/crachas/lib/solicitacaoService';
import type { LancamentoAviso } from '../../../../supabase/functions/_shared/avisoMovimentacao';

/**
 * Controle de Movimentação Diária: o fiscal lança quem faltou e quem cobriu.
 * Status: data informada = dia do lançamento → OK; senão DIVERGENTE (e-mail).
 */

export const EMPRESAS = ['MATRIZ', 'APOIO'] as const;
export const MOTIVOS = ['FALTA', 'TREINAMENTO', 'REFORÇO', 'SDF'] as const;
export const HORARIOS = [
  '07:00 AS 19:00', '08:00 AS 20:00', '10:00 AS 22:00', '13:00 AS 01:00',
  '19:00 AS 07:00', '20:00 AS 08:00', '22:00 AS 10:00',
] as const;
export const TURNOS = ['DIURNO', 'NOTURNO'] as const;

/** Turno provável do horário (entrada das 18h em diante = noturno). */
export const turnoDoHorario = (h: string): (typeof TURNOS)[number] | null => {
  const m = /^(\d{1,2})[:h]/.exec(h.trim());
  if (!m) return null;
  const ent = Number(m[1]);
  return ent >= 18 || ent < 5 ? 'NOTURNO' : 'DIURNO';
};

export type StatusMov = 'ok' | 'divergente';

export interface LancamentoDoFiscal {
  id: string; codigo: string; criado_em: string; data: string; status: StatusMov;
  posto: string; motivo: string; falta_nome: string; cobertura_nome: string | null; horario: string; turno: string;
  ok_pelo_plantao?: boolean;
}
/** Plantão do fiscal agora. Noturno depois da meia-noite: data_plantao = ontem (também fica OK). */
export interface PlantaoFiscal {
  noturno: boolean; data_plantao: string;
  entrada?: string; saida?: string; tolerancia_min?: number; aceita_ate?: string;
}
export interface FiscalIdentificado {
  nome: string; matricula: number; cargo: string | null; uf: string | null; hoje: string;
  plantao?: PlantaoFiscal;
  postos: { id: string; nome: string }[];
  lancamentos: LancamentoDoFiscal[];
}
export interface DadosLancamento {
  empresa: string; data: string;
  falta_senior_id: string;
  sem_cobertura: boolean; cobertura_senior_id: string | null;
  posto_id: string | null; posto_nome: string;
  motivo: string; justificativa: string; horario: string; turno: string;
  cobertura_por_extra: boolean | null; ocorrencias: number | null;
}

const args = (s: Solicitante) => ({ _matricula: s.matricula ?? null, _cpf: s.cpf ?? null });
const argsSol = (s: Solicitante) => ({ _sol_matricula: s.matricula ?? null, _sol_cpf: s.cpf ?? null });

async function chamar<T>(fn: 'movimentacao_identificar' | 'movimentacao_buscar_colaborador' | 'movimentacao_enviar', a: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, a as never);
  if (error) throw new Error(error.message?.includes('Failed to fetch') ? 'Sem conexão com o servidor. Verifique a internet.' : error.message);
  const r = data as { erro?: string } | null;
  if (r?.erro) throw new Error(r.erro);
  return r as T;
}

export const identificarFiscal = (s: Solicitante) => chamar<FiscalIdentificado>('movimentacao_identificar', args(s));

/** Colaborador ativo da Senior (sem CPF). */
export interface ColaboradorSenior { id: string; nome: string; matricula: number; cargo: string | null; local: string | null }
export type ModoBusca = 'nome' | 'matricula' | 'cpf';

export const buscarColaborador = (s: Solicitante, modo: ModoBusca, busca: string) =>
  chamar<ColaboradorSenior[]>('movimentacao_buscar_colaborador', { ...argsSol(s), _modo: modo, _busca: busca });

export const enviarLancamento = (s: Solicitante, d: DadosLancamento) =>
  chamar<{ ok: true; codigo: string; status: StatusMov; data: string; data_lancamento: string; ok_pelo_plantao?: boolean; lancamentos: LancamentoDoFiscal[] }>(
    'movimentacao_enviar', { ...argsSol(s), _dados: d });

// ---------- Tela interna ----------
export interface Movimentacao extends LancamentoAviso {
  status: StatusMov;
  uf: string | null;
  posto_id: string | null;
  ocorrencias_plantao: number | null;
  email_avisado_em: string | null;
  ok_pelo_plantao?: boolean;
}

/** Tabela nova ainda fora do types.ts gerado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase as unknown as { from: (t: string) => any }).from(nome);

export async function listarMovimentacoes(de: string, ate: string): Promise<Movimentacao[]> {
  const todas: Movimentacao[] = [];
  for (let pag = 0; ; pag++) {
    const { data, error } = await tabela('movimentacoes_diarias').select('*')
      .gte('data_movimentacao', de).lte('data_movimentacao', ate)
      .order('data_movimentacao', { ascending: false }).order('created_at', { ascending: false })
      .range(pag * 1000, pag * 1000 + 999);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) return todas;
  }
}

export async function excluirMovimentacao(id: string) {
  const { error } = await tabela('movimentacoes_diarias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function lerEmailsAviso(): Promise<string[]> {
  const { data, error } = await tabela('movimentacao_config').select('emails_divergencia').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.emails_divergencia ?? [];
}

export async function salvarEmailsAviso(emails: string[]) {
  const { error } = await tabela('movimentacao_config').update({ emails_divergencia: emails, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw new Error(error.message);
}

/**
 * Manda agora os avisos dos divergentes pendentes. Na produção, a função
 * avisar-movimentacao (que também roda a cada 5 min); no `npm run dev`, o
 * vite.config.ts envia daqui do PC e a tela marca como avisado.
 */
export async function enviarAvisosAgora(): Promise<{ enviados: number; motivo?: string }> {
  if (import.meta.env.DEV) {
    const { data: pend, error } = await tabela('movimentacoes_diarias').select('*')
      .eq('status', 'divergente').is('email_avisado_em', null).order('created_at').limit(50);
    if (error) throw new Error(error.message);
    if (!pend?.length) return { enviados: 0, motivo: 'Nenhum lançamento divergente esperando aviso.' };
    const destinatarios = await lerEmailsAviso();
    const res = await fetch('/__email/avisar-movimentacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatarios, lancamentos: pend, link: `${window.location.origin}/movimentacao` }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(r.error || `Falha ao enviar (${res.status})`);
    const ids: string[] = r.ids ?? [];
    if (ids.length) {
      const { error: e2 } = await supabase.rpc('movimentacao_marcar_avisado' as never, { _ids: ids } as never);
      if (e2) throw new Error(e2.message);
    }
    return { enviados: ids.length };
  }
  const { data, error } = await supabase.functions.invoke('avisar-movimentacao', { body: { modo: 'manual' } });
  if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error ?? error.message);
  if (data?.error) throw new Error(data.error);
  return { enviados: data?.lancamentos?.length ?? 0, motivo: data?.enviado ? undefined : data?.motivo };
}

// ---------- Plantão noturno (12 h) ----------
export interface FiscalNoturno {
  senior_id: string; nome: string; matricula: number; cargo: string | null; uf: string | null; local: string | null;
  ativo: boolean; entrada: string; saida: string;
}
export interface CandidatoNoturno { id: string; nome: string; matricula: number; cargo: string | null; local: string | null; uf: string | null; noturno: boolean }

async function rpc<T>(fn: string, a?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, (a ?? {}) as never);
  if (error) throw new Error(error.message);
  return data as T;
}
export const listarNoturnos = () => rpc<{ tolerancia_min: number; fiscais: FiscalNoturno[] }>('movimentacao_noturnos_listar');
export const buscarCandidatoNoturno = (busca: string) => rpc<CandidatoNoturno[]>('movimentacao_noturnos_buscar', { _busca: busca });
export const salvarNoturno = (seniorId: string, entrada: string) => rpc<void>('movimentacao_noturnos_salvar', { _senior_id: seniorId, _entrada: entrada });
export const removerNoturno = (seniorId: string) => rpc<void>('movimentacao_noturnos_remover', { _senior_id: seniorId });
export async function salvarTolerancia(min: number) {
  const { error } = await tabela('movimentacao_config').update({ tolerancia_noturno_min: min, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) throw new Error(error.message);
}
/** Saída do plantão de 12 h a partir da entrada ("19:00" -> "07:00"). */
export const saidaDe = (entrada: string) => {
  const [h, m] = entrada.split(':').map(Number);
  return `${String((h + 12) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};

export const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export const horaBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
