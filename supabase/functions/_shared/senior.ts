// Cliente SOAP mínimo para os web services do Senior G5 (Rubi).
// Sem imports de Deno/npm de propósito: o parser é testado pelo vitest
// (src/test/senior.test.ts) além de rodar dentro da Edge Function.

export interface SeniorConfig {
  /** Base dos serviços, ex.: http://servidor:8080/g5-senior-services */
  baseUrl: string;
  /** Prefixo do módulo no endpoint (Rubi = "rubi"). */
  module: string;
  user: string;
  password: string;
}

export interface Matricula {
  numEmp: number;
  tipCol: number;
  numCad: number;
}

/** Só os campos de TMCSColaboradores que o sistema de EPI usa (minimização LGPD). */
export interface ColaboradorSenior extends Matricula {
  nome: string;
  cpf: string | null;
  /** Número do RG (numCid), impresso no crachá. */
  rg: string | null;
  telefone: string | null;
  email: string | null;
  dataAdmissao: string | null;
  empresaNome: string | null;
  codFil: number | null;
  razaoSocial: string | null;
  /** CNPJ da filial (numCgc), só dígitos. */
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
}

export class SeniorError extends Error {}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function unescapeXml(s: string) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Endpoint no padrão do G5: <base>/<modulo>_Sync<servico com _ no lugar de .> */
export function seniorEndpoint(cfg: SeniorConfig, service: string) {
  return `${cfg.baseUrl.replace(/\/+$/, '')}/${cfg.module}_Sync${service.replace(/\./g, '_')}`;
}

export function buildEnvelope(port: string, cfg: SeniorConfig, params: Record<string, string | number>) {
  const body = Object.entries(params)
    .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`).join('');
  return '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ser="http://services.senior.com.br"><soapenv:Body>' +
    `<ser:${port}><user>${escapeXml(cfg.user)}</user><password>${escapeXml(cfg.password)}</password>` +
    `<encryption>0</encryption><parameters>${body}</parameters></ser:${port}>` +
    '</soapenv:Body></soapenv:Envelope>';
}

/** Conteúdo de cada ocorrência de <[prefixo:]tag>...</[prefixo:]tag>, ignorando namespace. */
export function allBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g');
  return [...xml.matchAll(re)].map(m => m[1]);
}

/** Campos simples (sem filhos) de um bloco XML, por nome local. */
export function readFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<(?:[\w-]+:)?(\w+)(?:\s[^>]*)?>([^<]*)<\/(?:[\w-]+:)?\1>/g;
  for (const m of block.matchAll(re)) out[m[1]] = unescapeXml(m[2]).trim();
  return out;
}

const str = (v?: string) => (v && v.length ? v : null);
const num = (v?: string) => (v && v.length && !Number.isNaN(Number(v)) ? Number(v) : null);

/** A Senior manda datas como dd/mm/aaaa; "31/12/1900" é o "vazio" do Rubi. */
export function parseSeniorDate(v?: string): string | null {
  if (!v) return null;
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : v.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!iso || iso <= '1900-12-31') return null;
  return iso;
}

/** CPF vem numérico, às vezes sem os zeros à esquerda. */
export function normalizeCpf(v?: string): string | null {
  const d = (v || '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d)) return null;
  return d.padStart(11, '0');
}

export function formatTelefone(ddi?: string, ddd?: string, numero?: string): string | null {
  const n = (numero || '').replace(/\D/g, '');
  if (!n || /^0+$/.test(n)) return null;
  const d = (ddd || '').replace(/\D/g, '').replace(/^0+/, '');
  const i = (ddi || '').replace(/\D/g, '').replace(/^0+/, '');
  return (i && i !== '55' ? `+${i} ` : '') + (d ? `(${d}) ` : '') + n;
}

/**
 * O serviço rh.fp.consultarColaborador da Senior Cloud manda os campos em
 * camelCase (numCad, nomFun); versões antigas mandavam NumCad, NomFun.
 * Lê sem diferenciar maiúsculas para aceitar as duas.
 */
export function mapColaborador(campos: Record<string, string>): ColaboradorSenior {
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos)) f[k.toLowerCase()] = v;
  return {
    numEmp: num(f.numemp) ?? 0,
    tipCol: num(f.tipcol) ?? 0,
    numCad: num(f.numcad) ?? 0,
    nome: f.nomfun || '',
    cpf: normalizeCpf(f.numcpf),
    rg: str(f.numcid?.trim()),
    telefone: formatTelefone(f.dditel, f.dddtel, f.numtel),
    email: str(f.emacom),
    dataAdmissao: parseSeniorDate(f.datadm),
    empresaNome: str(f.nomemp),
    codFil: num(f.codfil),
    razaoSocial: str(f.razsoc),
    cnpj: str((f.numcgc || '').replace(/\D/g, '').replace(/^0+$/, '')),
    codLocal: str(f.codloc),
    nomeLocal: str(f.nomloc),
    codCargo: str(f.codcar),
    cargo: str(f.titcar),
    codCentroCusto: str(f.codccu),
    centroCusto: str(f.nomccu),
    situacao: num(f.sitafa),
    situacaoDescricao: str(f.dessit),
    dataAfastamento: parseSeniorDate(f.datafa),
  };
}

/** Interpreta a resposta de ConsultarColaborador. Lança SeniorError se a Senior reportou erro. */
export function parseConsultarColaborador(xml: string): ColaboradorSenior[] {
  const fault = allBlocks(xml, 'faultstring')[0];
  if (fault) throw new SeniorError(`Senior (SOAP Fault): ${unescapeXml(fault).trim()}`);

  const result = allBlocks(xml, 'result')[0] ?? xml;
  const erro = readFields(result).erroExecucao;
  if (erro) throw new SeniorError(`Senior: ${erro}`);

  return allBlocks(result, 'TMCSColaboradores')
    .map(readFields)
    .filter(f => f.numCad || f.NumCad)
    .map(mapColaborador);
}

/** Serviço "AP - Consultar colaborador" do Rubi (módulo FP; o rh.hr não existe na Senior Cloud). */
export const SERVICO_CONSULTAR_COLABORADOR = 'com.senior.g5.rh.fp.consultarColaborador';
export const SERVICO_CONSULTAR_POR_CPF = 'com.senior.g5.rh.fp.consultarColaboradorPorCPF';

/** SitAfa 7 = "Demitido" no Rubi. */
export const SITUACAO_DEMITIDO = 7;

async function chamarConsulta(
  cfg: SeniorConfig, servico: string, porta: string, params: Record<string, string | number>, timeoutMs: number,
) {
  const res = await fetch(seniorEndpoint(cfg, servico), {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: buildEnvelope(porta, cfg, params),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const xml = await res.text();
  // SOAP Fault vem com HTTP 500 — deixa o parser extrair a mensagem antes de desistir.
  if (!res.ok && !/faultstring/i.test(xml)) {
    throw new SeniorError(`Senior respondeu HTTP ${res.status}`);
  }
  return parseConsultarColaborador(xml);
}

export function consultarColaborador(cfg: SeniorConfig, m: Matricula, timeoutMs = 30000) {
  return chamarConsulta(cfg, SERVICO_CONSULTAR_COLABORADOR, 'ConsultarColaborador',
    { numEmp: m.numEmp, tipCol: m.tipCol, numCad: m.numCad }, timeoutMs);
}

/** Pode voltar mais de um cadastro (readmissão, outra empresa): use escolherCadastro. */
export function consultarColaboradorPorCpf(cfg: SeniorConfig, cpf: string, timeoutMs = 30000) {
  return chamarConsulta(cfg, SERVICO_CONSULTAR_POR_CPF, 'ConsultarColaboradorPorCPF',
    { numCpf: cpf.replace(/\D/g, '') }, timeoutMs);
}

/** Entre vários cadastros do mesmo CPF: o não demitido mais recente; senão, o mais recente. */
export function escolherCadastro(lista: ColaboradorSenior[]): ColaboradorSenior | undefined {
  const recente = (a: ColaboradorSenior, b: ColaboradorSenior) =>
    (b.dataAdmissao ?? '').localeCompare(a.dataAdmissao ?? '');
  const ativos = lista.filter(c => c.situacao !== SITUACAO_DEMITIDO).sort(recente);
  return ativos[0] ?? [...lista].sort(recente)[0];
}

/** CPF com 11 dígitos e dígitos verificadores válidos. */
export function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// ---------- Lista completa (módulo Colaboradores Senior) ----------

export const SERVICO_ADMITIDOS = 'com.senior.g5.rh.fp.colaboradoresAdmitidos';

/** Empresas da Senior que entram na lista: 1 = Segurança (MATRIZ), 3 = Serviços de Apoio. */
export const EMPRESAS_SENIOR = [1, 3];

/** Filial (numEmp-codFil) -> estado. Conferido com os locais da Senior em 2026-10-09. */
const UF_DA_FILIAL: Record<string, string> = {
  '1-1': 'DF', '1-2': 'GO', '1-6': 'SP', '1-15': 'MT', '1-18': 'MG', '3-1': 'DF',
};

/** Estado do colaborador: pela filial; se a filial for nova, pela sigla no fim do local. */
export function ufDoColaborador(c: Pick<ColaboradorSenior, 'numEmp' | 'codFil' | 'nomeLocal'>): string | null {
  const porFilial = UF_DA_FILIAL[`${c.numEmp}-${c.codFil}`];
  if (porFilial) return porFilial;
  const sigla = (c.nomeLocal ?? '').toUpperCase().match(/\b(DF|GO|MT|SP|MG)\b/);
  return sigla ? sigla[1] : null;
}

const dataSenior = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Todos os colaboradores não demitidos de uma empresa (admitidos de 1950 até hoje).
 * A empresa 1 (~2.200 pessoas) leva uns 25 s na Senior Cloud.
 */
export function listarColaboradoresEmpresa(cfg: SeniorConfig, numEmp: number, timeoutMs = 180000) {
  return chamarConsulta(cfg, SERVICO_ADMITIDOS, 'ColaboradoresAdmitidos', {
    numEmp, abrTipCol: '1', iniPer: '01/01/1950', fimPer: dataSenior(new Date()),
  }, timeoutMs);
}

/**
 * Períodos de admissão em que a lista é dividida, para cada chamada caber no
 * limite de 60 s das Edge Functions (a empresa 1 inteira passa disso na VM).
 * Somados, cobrem de 1950 até hoje.
 */
export function periodosAdmissao(hoje = new Date()): [string, string][] {
  return [['01/01/1950', '31/12/2021'], ['01/01/2022', '31/12/2024'], ['01/01/2025', dataSenior(hoje)]];
}

/** Não demitidos de uma empresa admitidos num dos períodos de periodosAdmissao(). */
export async function listarColaboradoresPeriodo(cfg: SeniorConfig, numEmp: number, periodo: number) {
  const faixa = periodosAdmissao()[periodo];
  if (!faixa) throw new SeniorError(`Período ${periodo} inválido`);
  const lista = await chamarConsulta(cfg, SERVICO_ADMITIDOS, 'ColaboradoresAdmitidos', {
    numEmp, abrTipCol: '1', iniPer: faixa[0], fimPer: faixa[1],
  }, 55000);
  return lista.map(c => ({ ...c, uf: ufDoColaborador(c) }));
}

/** Lista de todas as empresas, já com o estado; as empresas são buscadas em paralelo. */
export async function listarTodosColaboradores(cfg: SeniorConfig, empresas = EMPRESAS_SENIOR) {
  const listas = await Promise.all(empresas.map(e => listarColaboradoresEmpresa(cfg, e)));
  return listas.flat().map(c => ({ ...c, uf: ufDoColaborador(c) }));
}

// ---------- Consulta de tabelas (posto de trabalho e escala) ----------
// Web service com.senior.g5.rh.fp.integracoes, porta ConsultarTabelas: só
// leitura, e só das tabelas cadastradas em "Integrações de consulta tabelas"
// (FR320CON) na Senior — hoje R017CAR, R017POS, R034FUN e R006ESC.

export const SERVICO_INTEGRACOES = 'com.senior.g5.rh.fp.integracoes';

export interface FiltroTabela { campo: string; condicao: '=' | '<>' | '>' | '>=' | '<' | '<=' | 'IN'; valor: string }

/** Linhas da tabela, com os nomes dos campos em maiúsculas (como a Senior devolve). */
export async function consultarTabela(
  cfg: SeniorConfig, tabela: string, campos: string[], filtros: FiltroTabela[], timeoutMs = 55000,
): Promise<Record<string, string>[]> {
  const filtroXml = filtros.map(f =>
    `<filtro><campo>${escapeXml(f.campo)}</campo><condicao>${escapeXml(f.condicao)}</condicao>` +
    `<valor>${escapeXml(f.valor)}</valor></filtro>`).join('');
  const corpo = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ser="http://services.senior.com.br"><soapenv:Body><ser:ConsultarTabelas>' +
    `<user>${escapeXml(cfg.user)}</user><password>${escapeXml(cfg.password)}</password><encryption>0</encryption>` +
    `<parameters><consulta><id>1</id><tabela>${escapeXml(tabela)}</tabela><campos>${escapeXml(campos.join(','))}</campos>` +
    `${filtroXml}</consulta></parameters></ser:ConsultarTabelas></soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(seniorEndpoint(cfg, SERVICO_INTEGRACOES), {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body: corpo,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const xml = await res.text();
  const fault = allBlocks(xml, 'faultstring')[0];
  if (fault) throw new SeniorError(`Senior (SOAP Fault): ${unescapeXml(fault).trim()}`);
  if (!res.ok) throw new SeniorError(`Senior respondeu HTTP ${res.status}`);
  const erro = readFields(allBlocks(xml, 'result')[0] ?? '').erroExecucao;
  if (erro) throw new SeniorError(`Senior: ${erro}`);
  const ocorrencia = allBlocks(xml, 'ocorrencia')[0] ?? '';
  const mensagem = readFields(ocorrencia.replace(/<resultado>[\s\S]*<\/resultado>/g, '')).mensagem;
  if (mensagem) throw new SeniorError(`Senior (${tabela}): ${mensagem}`);
  return allBlocks(ocorrencia, 'resultado').map(r => {
    const linha: Record<string, string> = {};
    for (const campo of allBlocks(r, 'campo')) {
      const f = readFields(campo);
      if (f.nome) linha[f.nome.toUpperCase()] = f.valor ?? '';
    }
    return linha;
  });
}

const aspas = (v: string) => `'${v.replace(/'/g, "''")}'`;
const emPartes = <T>(lista: T[], tamanho: number) =>
  Array.from({ length: Math.ceil(lista.length / tamanho) }, (_, i) => lista.slice(i * tamanho, (i + 1) * tamanho));

export interface PostoEscala {
  postoEstrutura: number | null;
  postoCodigo: string | null;
  postoDescricao: string | null;
  escalaCodigo: number | null;
  escalaNome: string | null;
}

/** Postos de trabalho (R017POS) por (estrutura, código): "103|PO0175" -> descrição. */
export async function descreverPostos(cfg: SeniorConfig, codigos: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(codigos.filter(Boolean))];
  const partes = await Promise.all(emPartes(unicos, 200).map(p => consultarTabela(cfg, 'R017POS',
    ['ESTPOS', 'POSTRA', 'DESPOS'], [{ campo: 'POSTRA', condicao: 'IN', valor: p.map(aspas).join(',') }])));
  return new Map(partes.flat().map(l => [`${Number(l.ESTPOS)}|${l.POSTRA}`, (l.DESPOS ?? '').trim()]));
}

/** Escalas (R006ESC): código -> nome ("07:00 - 19:00 C/ INTRA - 12X36"). */
export async function descreverEscalas(cfg: SeniorConfig, codigos: number[]): Promise<Map<number, string>> {
  const unicos = [...new Set(codigos.filter(n => Number.isInteger(n) && n > 0))];
  const partes = await Promise.all(emPartes(unicos, 300).map(p => consultarTabela(cfg, 'R006ESC',
    ['CODESC', 'NOMESC'], [{ campo: 'CODESC', condicao: 'IN', valor: p.join(',') }])));
  return new Map(partes.flat().map(l => [Number(l.CODESC), (l.NOMESC ?? '').trim()]));
}

/** Posto e escala atuais de um colaborador (3 consultas rápidas). */
export async function postoEscalaDoColaborador(cfg: SeniorConfig, m: Matricula): Promise<PostoEscala | null> {
  const [fun] = await consultarTabela(cfg, 'R034FUN', ['ESTPOS', 'POSTRA', 'CODESC'], [
    { campo: 'NUMEMP', condicao: '=', valor: String(m.numEmp) },
    { campo: 'TIPCOL', condicao: '=', valor: String(m.tipCol) },
    { campo: 'NUMCAD', condicao: '=', valor: String(m.numCad) },
  ], 20000);
  if (!fun) return null;
  const postoCodigo = fun.POSTRA?.trim() || null;
  const postoEstrutura = fun.ESTPOS ? Number(fun.ESTPOS) : null;
  const escalaCodigo = fun.CODESC ? Number(fun.CODESC) : null;
  const [postos, escalas] = await Promise.all([
    postoCodigo ? descreverPostos(cfg, [postoCodigo]) : Promise.resolve(new Map<string, string>()),
    escalaCodigo ? descreverEscalas(cfg, [escalaCodigo]) : Promise.resolve(new Map<number, string>()),
  ]);
  return {
    postoEstrutura, postoCodigo,
    postoDescricao: postos.get(`${postoEstrutura}|${postoCodigo}`) ?? null,
    escalaCodigo, escalaNome: escalaCodigo ? escalas.get(escalaCodigo) ?? null : null,
  };
}

/** Matrículas por chamada na etapa de postos (a empresa 1 inteira passa de 60 s na VM). */
export const MATRICULAS_POR_LOTE = 400;

/** Posto e escala de um lote de matrículas de uma empresa. */
export async function postosEscalasDaEmpresa(cfg: SeniorConfig, numEmp: number, matriculas: number[]) {
  const lote = [...new Set(matriculas.filter(n => Number.isInteger(n) && n > 0))];
  if (!lote.length) return [];
  if (lote.length > MATRICULAS_POR_LOTE) throw new SeniorError(`Máximo de ${MATRICULAS_POR_LOTE} matrículas por vez`);
  const linhas = await consultarTabela(cfg, 'R034FUN', ['NUMEMP', 'TIPCOL', 'NUMCAD', 'ESTPOS', 'POSTRA', 'CODESC'], [
    { campo: 'NUMEMP', condicao: '=', valor: String(numEmp) },
    { campo: 'NUMCAD', condicao: 'IN', valor: lote.join(',') },
  ], 55000);
  return linhas.map(l => ({
    num_emp: Number(l.NUMEMP), tip_col: Number(l.TIPCOL), num_cad: Number(l.NUMCAD),
    posto_estrutura: l.ESTPOS ? Number(l.ESTPOS) : null, posto_codigo: l.POSTRA?.trim() || null,
    escala_codigo: l.CODESC ? Number(l.CODESC) : null,
  }));
}

/** "0003-0001-IDP NORTE - AGENTE DE PORTARIA - DIU 12 - C/INTRA" -> sem o "empresa-filial-" do começo. */
export function nomePostoTrabalho(descricao: string | null | undefined): string {
  return (descricao ?? '').replace(/^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*/, '').trim();
}

/** Turno pela escala: hora de entrada entre 05h e 17h59 = diurno; senão noturno. */
export function turnoDaEscala(nome: string | null | undefined): 'diurno' | 'noturno' | null {
  const n = (nome ?? '').toUpperCase();
  const hora = n.match(/\b(\d{1,2})[:H]\d{2}\b/);
  if (hora) {
    const h = Number(hora[1]);
    return h >= 5 && h < 18 ? 'diurno' : 'noturno';
  }
  if (/\bNOT(URNO)?\b/.test(n)) return 'noturno';
  if (/\bDIU(RNO)?\b/.test(n)) return 'diurno';
  return null;
}

// ---------- Etapas da atualização da lista (cada uma cabe em < 60 s) ----------

/** Linha para a função sincronizar_colaboradores_senior. */
export function linhaColaborador(c: ColaboradorSenior & { uf: string | null }) {
  return {
    num_emp: c.numEmp, tip_col: c.tipCol, num_cad: c.numCad, nome: c.nome, cpf: c.cpf, rg: c.rg,
    telefone: c.telefone, email: c.email, data_admissao: c.dataAdmissao, empresa_nome: c.empresaNome,
    cod_fil: c.codFil, razao_social: c.razaoSocial, cod_local: c.codLocal, nome_local: c.nomeLocal,
    cod_cargo: c.codCargo, cargo: c.cargo, cod_centro_custo: c.codCentroCusto, centro_custo: c.centroCusto,
    situacao: c.situacao, situacao_descricao: c.situacaoDescricao, data_afastamento: c.dataAfastamento, uf: c.uf,
  };
}

export type PedidoEtapa =
  | { etapa: 'colaboradores'; empresa: number; periodo: number }
  | { etapa: 'postos'; empresa: number; matriculas: number[] }
  | { etapa: 'descricoes'; postos: string[]; escalas: number[] };

/** Divide uma lista em partes de `tamanho`. */
export function emLotes<T>(lista: T[], tamanho: number): T[][] {
  return Array.from({ length: Math.ceil(lista.length / tamanho) }, (_, i) => lista.slice(i * tamanho, (i + 1) * tamanho));
}

/**
 * Busca na Senior os dados de uma etapa (cada chamada cabe em < 60 s):
 *  1. colaboradores — uma empresa, um período de admissão (sincronizar_colaboradores_senior);
 *     depois de todos os períodos, senior_inativar_ausentes marca os desligados;
 *  2. postos — posto e escala de um lote de matrículas (senior_gravar_postos_escalas);
 *  3. descricoes — nome dos postos e escalas usados (senior_gravar_descricoes).
 */
export async function buscarEtapa(cfg: SeniorConfig, p: PedidoEtapa) {
  if (p.etapa !== 'descricoes' && !EMPRESAS_SENIOR.includes(p.empresa)) {
    throw new SeniorError(`Empresa ${p.empresa} fora da lista`);
  }
  if (p.etapa === 'colaboradores') {
    const lista = await listarColaboradoresPeriodo(cfg, p.empresa, p.periodo);
    return { empresa: p.empresa, periodo: p.periodo, dados: lista.map(linhaColaborador) };
  }
  if (p.etapa === 'postos') {
    return { empresa: p.empresa, dados: await postosEscalasDaEmpresa(cfg, p.empresa, p.matriculas ?? []) };
  }
  const codigos = [...new Set(p.postos.map(k => k.split('|')[1]).filter(Boolean))];
  const [postos, escalas] = await Promise.all([descreverPostos(cfg, codigos), descreverEscalas(cfg, p.escalas)]);
  return {
    postos: [...postos].map(([k, descricao]) => {
      const [est, cod] = k.split('|');
      return { posto_estrutura: Number(est), posto_codigo: cod, descricao };
    }),
    escalas: [...escalas].map(([codigo, nome]) => ({ codigo, nome })),
  };
}

// ---------- Busca na lista já gravada (colaboradores_senior) ----------

/** Linha da tabela colaboradores_senior (só os campos usados aqui). */
export interface LinhaListaSenior {
  num_emp: number; tip_col: number; num_cad: number; nome: string; cpf: string | null; rg?: string | null;
  telefone: string | null; email: string | null; data_admissao: string | null; empresa_nome: string | null;
  cod_fil: number | null; razao_social: string | null; cod_local: string | null; nome_local: string | null;
  cod_cargo: string | null; cargo: string | null; cod_centro_custo: string | null; centro_custo: string | null;
  situacao: number | null; situacao_descricao: string | null; data_afastamento: string | null;
  posto_estrutura: number | null; posto_codigo: string | null; posto_descricao: string | null;
  escala_codigo: number | null; escala_nome: string | null;
}

/** Converte a linha gravada no mesmo formato da consulta à Senior (com posto e escala). */
export function colaboradorDaLista(l: LinhaListaSenior): ColaboradorSenior & PostoEscala {
  return {
    numEmp: l.num_emp, tipCol: l.tip_col, numCad: l.num_cad, nome: l.nome, cpf: l.cpf, rg: l.rg ?? null,
    telefone: l.telefone,
    email: l.email, dataAdmissao: l.data_admissao, empresaNome: l.empresa_nome, codFil: l.cod_fil,
    razaoSocial: l.razao_social, cnpj: null, codLocal: l.cod_local, nomeLocal: l.nome_local,
    codCargo: l.cod_cargo, cargo: l.cargo, codCentroCusto: l.cod_centro_custo, centroCusto: l.centro_custo,
    situacao: l.situacao, situacaoDescricao: l.situacao_descricao, dataAfastamento: l.data_afastamento,
    postoEstrutura: l.posto_estrutura, postoCodigo: l.posto_codigo, postoDescricao: l.posto_descricao,
    escalaCodigo: l.escala_codigo, escalaNome: l.escala_nome,
  };
}
