// deno-lint-ignore-file
// Troca de posto gravada na Senior (serviço com.senior.g5.rh.fp.historicos,
// operação Posto_4). Usado pela função troca-posto-senior (VM) e pelo
// vite.config.ts (localhost). Testado em 13/11/2026 na matrícula 3/3008990:
//  * motPos é obrigatório (motivos da Senior: 002, 004, 010, 998...);
//  * a Senior aplica junto o cargo, o local e o centro de custo do posto
//    (tabela R017CAR); codCar no envio mantém o cargo informado;
//  * desfazer = tipOpe "E" com excHis "S" (apaga também local/cargo/CC da data).
// As regras puras (parâmetros) são testadas no vitest.

import { allBlocks, buildEnvelope, consultarTabela, readFields, seniorEndpoint, SeniorError, type SeniorConfig } from './senior.ts';

export const SERVICO_HISTORICOS = 'com.senior.g5.rh.fp.historicos';

/** Motivos de alteração de posto da Senior que o sistema usa (lupa "Mot. alt." no G5). */
export const MOTIVOS_SENIOR: Record<number, string> = {
  2: 'Promoção',
  4: 'Reest. postos de trabalho',
  10: 'Substituição - Férias',
  998: 'Movimentação 5 Estrelas',
};

/** Motivo da tela -> código da Senior. */
export function motivoSenior(motivo: string): number {
  if (/abertura|encerramento/i.test(motivo)) return 4;
  if (/promo/i.test(motivo)) return 2;
  return 998;
}

export interface TrocaParaSenior {
  codigo: string; num_emp: number; tip_col: number; num_cad: number;
  posto_novo_codigo: string; data_inicio: string; motivo: string; observacao: string | null;
  motivo_senior: number | null; escala_nova_codigo: number | null;
  manter_cargo: boolean; cargo_atual_codigo: string | null;
}

const dataSenior = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Troca fictícia (dados de demonstração) nunca vai para a Senior: o colaborador é real. */
export const ehDemo = (t: { codigo?: string | null }) => /^TP-DEMO/i.test(t.codigo ?? '');

/**
 * Localhost: só envia para as matrículas liberadas (empresa/matrícula, separadas
 * por vírgula; padrão = a matrícula do teste de 13/11). Produção não usa isto.
 */
export function liberadaNoLocalhost(t: { num_emp: number; num_cad: number }, lista = '3/3008990') {
  return lista.split(/[,;\s]+/).filter(Boolean).some(x => x === `${t.num_emp}/${t.num_cad}`);
}

/**
 * Movimentação entre empresas não é permitida (empresa 1 só para a 1, empresa 3 só para a 3).
 * Na hora do envio confere pela estrutura de postos (101 = empresa 1, 103 = empresa 3):
 * posto de outra estrutura é de outra empresa. O pedido já confere a empresa no banco.
 */
export function erroEstrutura(t: { posto_atual_estrutura: number | null; posto_novo_estrutura: number; num_emp?: number }): string | null {
  if (t.posto_atual_estrutura == null) return 'Colaborador sem posto na Senior: não dá para conferir a empresa do posto.';
  return t.posto_atual_estrutura === t.posto_novo_estrutura ? null
    : `Movimentação entre empresas não é permitida: o posto novo é de outra empresa (estrutura ${t.posto_novo_estrutura}; a do colaborador${t.num_emp ? `, empresa ${t.num_emp},` : ''} é ${t.posto_atual_estrutura}). Não enviado.`;
}

/** Parâmetros do Posto_4 para incluir a troca. */
export function parametrosEnvio(t: TrocaParaSenior): Record<string, string | number> {
  const p: Record<string, string | number> = {
    numEmp: t.num_emp, tipCol: t.tip_col, numCad: t.num_cad,
    iniAtu: dataSenior(t.data_inicio), posTra: t.posto_novo_codigo,
    motPos: t.motivo_senior ?? motivoSenior(t.motivo),
    obsPos: [`${t.codigo} - ${t.motivo}`, t.observacao?.trim()].filter(Boolean).join(' - ').slice(0, 250),
    tipOpe: 'I',
  };
  if (t.escala_nova_codigo != null) p.codEsc = t.escala_nova_codigo;
  if (t.manter_cargo && t.cargo_atual_codigo) p.codCar = t.cargo_atual_codigo;
  return p;
}

/** Parâmetros do Posto_4 para apagar a troca (e o local/cargo/CC lançados junto). */
export function parametrosDesfazer(t: TrocaParaSenior): Record<string, string | number> {
  return {
    numEmp: t.num_emp, tipCol: t.tip_col, numCad: t.num_cad,
    iniAtu: dataSenior(t.data_inicio), posTra: t.posto_novo_codigo,
    motPos: t.motivo_senior ?? motivoSenior(t.motivo), excHis: 'S', tipOpe: 'E',
  };
}

/**
 * Tempo máximo de cada chamada à Senior: as Edge Functions da VM são cortadas
 * em 60 s, então cada passo (gravar, conferir) faz UMA chamada e para antes.
 */
export const LIMITE_SENIOR_MS = 48000;

/** A chamada passou do tempo (ou a conexão caiu): não dá para saber se a Senior gravou. */
export const semResposta = (e: unknown) =>
  e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError' || /timed out|aborted|network|fetch failed|connection/i.test(e.message));

/** Chama o Posto_4. Devolve a mensagem de erro da Senior, ou null se gravou. */
export async function chamarPosto4(cfg: SeniorConfig, params: Record<string, string | number>, timeoutMs = LIMITE_SENIOR_MS): Promise<string | null> {
  const res = await fetch(seniorEndpoint(cfg, SERVICO_HISTORICOS), {
    method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: buildEnvelope('Posto_4', cfg, params), signal: AbortSignal.timeout(timeoutMs),
  });
  const xml = await res.text();
  const fault = allBlocks(xml, 'faultstring')[0];
  if (fault) return `SOAP Fault: ${fault.trim()}`;
  const r = allBlocks(xml, 'result')[0];
  if (r === undefined) return res.ok ? 'Resposta da Senior sem resultado.' : `Senior respondeu HTTP ${res.status}`;
  return readFields(r).erroExecucao?.trim() || null;
}

export interface SituacaoSenior { posto: string | null; estrutura: number | null; cargo: string | null; local: string | null; centroCusto: string | null; escala: number | null }

/** Situação atual do colaborador na Senior (R034FUN). */
export async function lerSituacao(cfg: SeniorConfig, numEmp: number, numCad: number, tipCol = 1, timeoutMs = LIMITE_SENIOR_MS): Promise<SituacaoSenior | null> {
  const [f] = await consultarTabela(cfg, 'R034FUN', ['ESTPOS', 'POSTRA', 'CODCAR', 'NUMLOC', 'CODCCU', 'CODESC'], [
    { campo: 'NUMEMP', condicao: '=', valor: String(numEmp) },
    { campo: 'TIPCOL', condicao: '=', valor: String(tipCol) },
    { campo: 'NUMCAD', condicao: '=', valor: String(numCad) },
  ], timeoutMs);
  if (!f) return null;
  return {
    posto: f.POSTRA?.trim() || null, estrutura: f.ESTPOS ? Number(f.ESTPOS) : null, cargo: f.CODCAR?.trim() || null,
    local: f.NUMLOC?.trim() || null, centroCusto: f.CODCCU?.trim() || null, escala: f.CODESC ? Number(f.CODESC) : null,
  };
}

export interface PadraoPosto { cargo: string | null; local: string | null; centroCusto: string | null }

/** Cargo, local e centro de custo que a Senior aplica com o posto (R017CAR). */
export async function padraoDoPosto(cfg: SeniorConfig, estrutura: number, posto: string): Promise<PadraoPosto[]> {
  try {
    const linhas = await consultarTabela(cfg, 'R017CAR', ['CODCAR', 'NUMLOC', 'CODCCU'], [
      { campo: 'ESTPOS', condicao: '=', valor: String(estrutura) },
      { campo: 'POSTRA', condicao: '=', valor: posto },
    ], LIMITE_SENIOR_MS);
    return linhas.map(l => ({ cargo: l.CODCAR?.trim() || null, local: l.NUMLOC?.trim() || null, centroCusto: l.CODCCU?.trim() || null }));
  } catch (e) {
    if (e instanceof SeniorError && /Não houve resultados/i.test(e.message)) return [];
    throw e;
  }
}
