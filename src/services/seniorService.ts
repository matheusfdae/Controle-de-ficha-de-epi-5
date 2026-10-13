import { supabase } from '@/integrations/supabase/client';

/** Espelha ColaboradorSenior de supabase/functions/_shared/senior.ts. */
export interface ColaboradorSenior {
  numEmp: number;
  tipCol: number;
  numCad: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  dataAdmissao: string | null;
  empresaNome: string | null;
  codFil: number | null;
  razaoSocial: string | null;
  cnpj: string | null;
  codLocal: string | null;
  nomeLocal: string | null;
  codCargo: string | null;
  cargo: string | null;
  codCentroCusto: string | null;
  centroCusto: string | null;
  situacao: number | null;
  situacaoDescricao: string | null;
  dataAfastamento: string | null;
  /** Posto de trabalho e escala (tabelas R034FUN/R017POS/R006ESC); ausentes se a consulta falhar. */
  postoEstrutura?: number | null;
  postoCodigo?: string | null;
  postoDescricao?: string | null;
  escalaCodigo?: number | null;
  escalaNome?: string | null;
}

export { nomePostoTrabalho, turnoDaEscala } from '../../supabase/functions/_shared/senior';

/** SitAfa 1 = "Trabalhando" no Rubi; qualquer outra merece aviso na tela. */
export const SITUACAO_TRABALHANDO = 1;

export function formatCpf(cpf: string | null) {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d;
}

type BuscaSenior = { num_emp: number; tip_col: number; num_cad: number } | { cpf: string; sem_posto?: boolean };

async function consultarSenior(busca: BuscaSenior): Promise<ColaboradorSenior> {
  if (import.meta.env.DEV) {
    // No localhost a consulta sai do próprio PC (vite.config.ts > seniorLocal).
    const res = await fetch('/__senior/consultar-colaborador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(busca),
    });
    const resp = await res.json().catch(() => null) as { colaborador?: ColaboradorSenior; error?: string } | null;
    if (!resp?.colaborador) throw new Error(resp?.error || `Falha ao consultar a Senior (HTTP ${res.status})`);
    return resp.colaborador;
  }
  const { data, error } = await supabase.functions.invoke('senior-consultar-colaborador', { body: busca });
  if (error) {
    // Em respostas não-2xx o corpo com a mensagem útil fica em error.context.
    const ctx = (error as { context?: Response }).context;
    const body: { error?: string } | null = await ctx?.json?.().catch(() => null) ?? null;
    throw new Error(body?.error || error.message || 'Falha ao consultar a Senior');
  }
  const resp = data as { colaborador?: ColaboradorSenior; error?: string } | null;
  if (!resp?.colaborador) throw new Error(resp?.error || 'Resposta inválida da Senior');
  return resp.colaborador;
}

export function consultarColaboradorSenior(numEmp: number, numCad: number, tipCol = 1) {
  return consultarSenior({ num_emp: numEmp, tip_col: tipCol, num_cad: numCad });
}

/** Se o CPF tiver mais de um cadastro, o servidor devolve o ativo mais recente. */
export function consultarColaboradorSeniorPorCpf(cpf: string, opcoes: { semPosto?: boolean } = {}) {
  return consultarSenior({ cpf: cpf.replace(/\D/g, ''), sem_posto: opcoes.semPosto });
}
