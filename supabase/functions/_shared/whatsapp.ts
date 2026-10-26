// deno-lint-ignore-file
// Convocação de troca de uniforme pelo WhatsApp, via WA-AKG (gateway próprio,
// não é a API oficial da Meta). Sem dependências: usado pela Edge Function e,
// no localhost, pelo vite.config.ts.
//
// Contra banimento do número: o disparo é mensal e cada mensagem é AGENDADA no
// WA-AKG com um intervalo (padrão 60–90 s) entre uma e outra, em vez de sair
// tudo de uma vez. O agendador do WA-AKG manda no máximo 1 por vez a cada 30 s.
import { formatarData, ConvocacaoUniforme } from './convocacaoUniforme.ts';

export interface ContaWhatsApp { url: string; sessao: string; apiKey: string }

export class ErroWhatsApp extends Error {}

export const INTERVALO_PADRAO_SEG = 60;

/**
 * Celular brasileiro em formato internacional ("55" + DDD + 9 dígitos).
 * Aceita com ou sem 55, zeros, máscara, e o formato antigo sem o 9
 * ("61 9649-4477": 8 dígitos começando com 6–9 é celular; fixo começa com 2–5).
 * Fixo ou incompleto: null.
 */
export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  let d = (telefone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  if (d.length !== 11 || d[2] !== '9') return null;
  return `55${d}`;
}

/**
 * Celular do convocado: o da Senior (atualizado todo dia); se lá não houver um
 * celular válido, o mais recente digitado nas fichas dele.
 */
export function celularDe(t: Pick<ConvocacaoUniforme, 'telefone' | 'telefonesFicha'>): { numero: string; origem: 'senior' | 'ficha' } | null {
  const daSenior = numeroWhatsApp(t.telefone);
  if (daSenior) return { numero: daSenior, origem: 'senior' };
  for (const tel of t.telefonesFicha ?? []) {
    const n = numeroWhatsApp(tel);
    if (n) return { numero: n, origem: 'ficha' };
  }
  return null;
}

/** Campos que o modelo da mensagem aceita, trocados pelos dados de cada colaborador. */
export const CAMPOS_MENSAGEM: { campo: string; descricao: string }[] = [
  { campo: '{nome}', descricao: 'primeiro nome (Maria)' },
  { campo: '{nome_completo}', descricao: 'nome completo' },
  { campo: '{situacao}', descricao: '"está vencida desde 02/08/2026" ou "vence em 20/11/2026"' },
  { campo: '{data}', descricao: 'data da troca (02/08/2026)' },
  { campo: '{posto}', descricao: 'posto de trabalho' },
];

export const MODELO_PADRAO = 'Olá, {nome}! Aqui é do Grupo 5 Estrelas.\n\n'
  + 'A troca do seu uniforme {situacao}.\n'
  + 'Procure seu supervisor para combinar a troca.\n\n'
  + 'Esta é uma mensagem automática, não é preciso responder.';

/** Texto enviado ao colaborador, a partir do modelo. Sem CPF, como no e-mail. */
export function montarMensagem(
  t: Pick<ConvocacaoUniforme, 'nome' | 'dataTroca' | 'diasRestantes'> & { posto?: string },
  modelo: string = MODELO_PADRAO,
): string {
  const primeiro = (t.nome || '').trim().split(/\s+/)[0] ?? '';
  const valores: Record<string, string> = {
    nome: primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase(),
    nome_completo: (t.nome || '').trim(),
    situacao: t.diasRestantes <= 0 ? `está vencida desde ${formatarData(t.dataTroca)}` : `vence em ${formatarData(t.dataTroca)}`,
    data: formatarData(t.dataTroca),
    posto: (t.posto || '').trim(),
  };
  return modelo.replace(/\{(\w+)\}/g, (campo, chave) => valores[chave] ?? campo).trim();
}

export interface EnvioWhatsApp { nome: string; numero: string; texto: string; origem?: 'senior' | 'ficha' }

/** Monta os envios da lista; quem não tem celular válido vai para `semCelular`. */
export function prepararEnvios(lista: ConvocacaoUniforme[], modelo: string = MODELO_PADRAO) {
  const envios: EnvioWhatsApp[] = [];
  const semCelular: string[] = [];
  const vistos = new Set<string>();
  for (const t of lista) {
    const cel = celularDe(t);
    if (!cel) { semCelular.push(t.nome); continue; }
    if (vistos.has(cel.numero)) continue; // mesmo celular em dois cadastros: uma mensagem só
    vistos.add(cel.numero);
    envios.push({ nome: t.nome, numero: cel.numero, texto: montarMensagem(t, modelo), origem: cel.origem });
  }
  return { envios, semCelular };
}

/** Confere os envios montados na tela antes de agendar (o servidor não confia no navegador). */
export function validarEnvios(envios: unknown, limite = 500): EnvioWhatsApp[] {
  if (!Array.isArray(envios) || envios.length === 0) throw new ErroWhatsApp('Nenhum colaborador selecionado');
  if (envios.length > limite) throw new ErroWhatsApp(`Máximo de ${limite} mensagens por envio`);
  const vistos = new Set<string>();
  const ok: EnvioWhatsApp[] = [];
  for (const e of envios as any[]) {
    const numero = numeroWhatsApp(String(e?.numero ?? ''));
    const texto = String(e?.texto ?? '').trim();
    if (!numero) throw new ErroWhatsApp(`Celular inválido: ${e?.nome ?? ''} (${e?.numero ?? ''})`);
    if (!texto || texto.length > 2000) throw new ErroWhatsApp(`Mensagem vazia ou longa demais (máx. 2.000 letras): ${e?.nome ?? ''}`);
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    ok.push({ nome: String(e?.nome ?? ''), numero, texto });
  }
  return ok;
}

async function chamar(conta: ContaWhatsApp, caminho: string, corpo?: unknown, metodo = 'POST') {
  const base = conta.url.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/api${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'x-api-key': conta.apiKey },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch (e) {
    throw new ErroWhatsApp(`WA-AKG fora do ar (${base}): ${e instanceof Error ? e.message : e}`);
  }
  const r: any = await res.json().catch(() => null);
  if (!res.ok || !r?.status) {
    if (res.status === 401) throw new ErroWhatsApp('Chave de API do WA-AKG inválida');
    if (res.status === 503) throw new ErroWhatsApp('O WhatsApp do WA-AKG está desconectado: escaneie o QR code de novo no painel');
    throw new ErroWhatsApp(r?.message || r?.error || `WA-AKG respondeu HTTP ${res.status}`);
  }
  return r.data;
}

/**
 * Confere no WhatsApp quais números existem e devolve o JID certo de cada um
 * (conta antiga pode estar registrada sem o 9). Até 50 por chamada no WA-AKG.
 */
async function conferirNumeros(conta: ContaWhatsApp, numeros: string[]): Promise<Map<string, string>> {
  const jids = new Map<string, string>();
  for (let i = 0; i < numeros.length; i += 50) {
    const r = await chamar(conta, `/chat/${encodeURIComponent(conta.sessao)}/check`, { numbers: numeros.slice(i, i + 50) });
    for (const x of r?.results ?? []) if (x.exists && x.jid) jids.set(x.number, x.jid);
  }
  return jids;
}

/** Código do lote: "convocacao-2026-10-26-1413-x7k2" (data/hora de Brasília). */
export function novoLote(agora = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(agora).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return `convocacao-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Agenda uma mensagem por colaborador no WA-AKG, a primeira daqui a 1 minuto e
 * as outras espaçadas por `intervaloSeg` + até 50% a mais, sorteado. Todas do
 * mesmo `lote`, para acompanhar a situação depois (listarLotes / lerLote).
 */
export async function agendarEnvios(conta: ContaWhatsApp, envios: EnvioWhatsApp[], intervaloSeg = INTERVALO_PADRAO_SEG, lote = novoLote()) {
  const jids = await conferirNumeros(conta, envios.map(e => e.numero));
  const semWhatsApp = envios.filter(e => !jids.has(e.numero)).map(e => e.nome);
  let quando = Date.now() + 60_000;
  let agendados = 0;
  let ultimo = '';
  for (const e of envios) {
    const jid = jids.get(e.numero);
    if (!jid) continue;
    ultimo = new Date(quando).toISOString();
    await chamar(conta, `/scheduler/${encodeURIComponent(conta.sessao)}`, { jid, content: e.texto, sendAt: ultimo, batchId: lote, label: e.nome });
    agendados++;
    quando += (intervaloSeg + Math.random() * intervaloSeg * 0.5) * 1000;
  }
  return { lote, agendados, semWhatsApp, termina: ultimo || null };
}

/** agendada → enviada (1 tique) → entregue (2 tiques) → lida (azul); ou falhou. */
export type SituacaoMensagem = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface ResumoLote {
  batchId: string;
  createdAt: string;
  firstSendAt: string;
  lastSendAt: string;
  total: number;
  PENDING: number; SENT: number; DELIVERED: number; READ: number; FAILED: number;
}

export interface MensagemLote {
  id: string;
  jid: string;
  label: string | null;
  content: string | null;
  sendAt: string;
  delivery: SituacaoMensagem;
  error: string | null;
}

const lotes = (conta: ContaWhatsApp) => `/scheduler/${encodeURIComponent(conta.sessao)}/batches`;

/** Os últimos envios (lotes), mais novo primeiro. */
export async function listarLotes(conta: ContaWhatsApp, limite = 12): Promise<ResumoLote[]> {
  return chamar(conta, `${lotes(conta)}?limit=${limite}`, undefined, 'GET');
}

/** Cada mensagem de um lote, na ordem de envio. */
export async function lerLote(conta: ContaWhatsApp, lote: string): Promise<MensagemLote[]> {
  return chamar(conta, `${lotes(conta)}?batchId=${encodeURIComponent(lote)}`, undefined, 'GET');
}

/** Cancela as mensagens do lote que ainda não saíram. */
export async function cancelarLote(conta: ContaWhatsApp, lote: string): Promise<{ cancelled: number }> {
  return chamar(conta, `${lotes(conta)}?batchId=${encodeURIComponent(lote)}`, undefined, 'DELETE');
}
