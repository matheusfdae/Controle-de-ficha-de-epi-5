import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { normalizar } from '@/lib/nfe';

/**
 * Pedidos — materiais de limpeza (migration 20261030120000_pedidos_material).
 * O encarregado pede pelo link público; conferência, orçamento, aprovação do
 * excesso de teto, faturamento e relatórios ficam nas telas do sistema.
 * Mudança de etapa só pelas funções do banco.
 */

// ---------- Papéis e etapas ----------

export type Papel = 'supervisor' | 'compras' | 'comercial' | 'gerencia';
export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: 'supervisor', rotulo: 'Supervisor', descricao: 'confere o material, ajusta quantidades ou devolve ao encarregado' },
  { valor: 'compras', rotulo: 'Compras', descricao: 'orça, fatura e mantém itens, tabela de preços e tetos' },
  { valor: 'comercial', rotulo: 'Comercial', descricao: 'aprova ou reprova pedido que excede o teto' },
  { valor: 'gerencia', rotulo: 'Gerência', descricao: 'vê tudo do estado, aprova excesso e pode cancelar' },
];
export const rotuloPapel = (p: string | null | undefined) => PAPEIS.find(x => x.valor === p)?.rotulo ?? (p === 'encarregado' ? 'Encarregado' : p ?? '');

export type StatusPedido = 'enviada' | 'devolvida' | 'em_orcamento' | 'aguardando_aprovacao' | 'a_faturar' | 'faturada' | 'reprovada' | 'cancelada';
export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  enviada: 'Aguardando conferência',
  devolvida: 'Devolvida ao encarregado',
  em_orcamento: 'Em orçamento',
  aguardando_aprovacao: 'Aguardando aprovação do excesso',
  a_faturar: 'A faturar',
  faturada: 'Faturada',
  reprovada: 'Reprovada',
  cancelada: 'Cancelada',
};
/** Quem age em cada status (igual a _pm_responsaveis no banco). */
export const RESPONSAVEIS: Partial<Record<StatusPedido, Papel[]>> = {
  enviada: ['supervisor'], em_orcamento: ['compras'], aguardando_aprovacao: ['comercial', 'gerencia'], a_faturar: ['compras'],
};
/** Filas de trabalho, na ordem do fluxo. */
export const FILAS: { status: StatusPedido; rotulo: string }[] = [
  { status: 'enviada', rotulo: 'Conferência' },
  { status: 'em_orcamento', rotulo: 'Orçamento' },
  { status: 'aguardando_aprovacao', rotulo: 'Aprovação do excesso' },
  { status: 'a_faturar', rotulo: 'Faturamento' },
];
/** Etapas da linha do tempo (sem desvios). */
export const ETAPAS: StatusPedido[] = ['enviada', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar', 'faturada'];

export type Frequencia = 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal';
export const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: 'unica', rotulo: 'Só desta vez' },
  { valor: 'diaria', rotulo: 'Todo dia' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
];
export const rotuloFrequencia = (f: string) => FREQUENCIAS.find(x => x.valor === f)?.rotulo ?? f;

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarMoeda = (v: number | null | undefined) => (v == null ? '—' : moeda.format(v));
export const formatarNumero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const dataBr = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('pt-BR') : '';

// ---------- Cálculos (puros, testados em src/test/pedidosMaterial.test.ts) ----------

/** Valor que conta no teto: nota, senão orçado, senão estimado (igual a _pm_valor). */
export const valorDoPedido = (p: { valor_real: number | null; valor_orcado?: number | null; valor_estimado: number }) =>
  Number(p.valor_real ?? p.valor_orcado ?? p.valor_estimado);

/** Primeiro dia do mês (AAAA-MM-01) de uma data AAAA-MM-DD. */
export const inicioDoMes = (data: string) => data.slice(0, 8) + '01';

/** Hoje em Brasília (AAAA-MM-DD), igual a _pm_hoje() no banco. */
export const hojeBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export interface TetoPosto { posto_id: string; vigente_desde: string; valor: number }

/** Teto do posto no mês: a última definição com vigência até o mês (igual a teto_do_posto). */
export function tetoNoMes(tetos: TetoPosto[], postoId: string, data: string): number | null {
  const mes = inicioDoMes(data);
  let achado: TetoPosto | null = null;
  for (const t of tetos) {
    if (t.posto_id !== postoId || t.vigente_desde > mes) continue;
    if (!achado || t.vigente_desde > achado.vigente_desde) achado = t;
  }
  return achado ? Number(achado.valor) : null;
}

export type Agrupamento = 'dia' | 'quinzena' | 'mes';

export interface PontoSerie { chave: string; rotulo: string; inicio: string; gasto: number; teto: number | null; acumulado: number }

const somaDias = (data: string, dias: number) => {
  const d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const somaMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Chave do período de uma data: o próprio dia, a quinzena (dia 1 ou 16) ou o mês. */
export function chavePeriodo(data: string, ag: Agrupamento): string {
  if (ag === 'dia') return data;
  if (ag === 'mes') return inicioDoMes(data);
  return data.slice(0, 8) + (Number(data.slice(8, 10)) <= 15 ? '01' : '16');
}

function rotuloPeriodo(chave: string, ag: Agrupamento): string {
  const [a, m, d] = chave.split('-');
  if (ag === 'dia') return `${d}/${m}`;
  if (ag === 'mes') return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
  return `${d === '01' ? '1ª' : '2ª'} quinz. ${MESES[Number(m) - 1]}`;
}

/**
 * Gasto de um posto por dia, quinzena ou mês entre `inicio` e `fim` (inclusive),
 * com todos os períodos (zerados quando não houve gasto). `acumulado` soma
 * dentro do mês (zera na virada) para comparar com o teto mensal; `teto` é o
 * teto do mês do período.
 */
export function serieGastos(
  pedidos: { data_aprovacao: string | null; valor_real: number | null; valor_orcado?: number | null; valor_estimado: number }[],
  inicio: string, fim: string, ag: Agrupamento,
  teto: (mes: string) => number | null,
): PontoSerie[] {
  const porChave = new Map<string, number>();
  for (const p of pedidos) {
    if (!p.data_aprovacao || p.data_aprovacao < inicio || p.data_aprovacao > fim) continue;
    const k = chavePeriodo(p.data_aprovacao, ag);
    porChave.set(k, (porChave.get(k) ?? 0) + valorDoPedido(p));
  }
  const pontos: PontoSerie[] = [];
  let k = chavePeriodo(inicio, ag);
  let acumulado = 0;
  let mesAtual = '';
  while (k <= fim) {
    const mes = inicioDoMes(k);
    if (mes !== mesAtual) { acumulado = 0; mesAtual = mes; }
    const gasto = Math.round((porChave.get(k) ?? 0) * 100) / 100;
    acumulado = Math.round((acumulado + gasto) * 100) / 100;
    pontos.push({ chave: k, rotulo: rotuloPeriodo(k, ag), inicio: k, gasto, teto: teto(mes), acumulado });
    k = ag === 'dia' ? somaDias(k, 1) : ag === 'mes' ? somaMes(k) : k.endsWith('-01') ? k.slice(0, 8) + '16' : somaMes(k);
  }
  return pontos;
}

export type TipoVariacao = 'aumentou' | 'manteve' | 'baixou' | 'primeira';
export const ROTULO_VARIACAO: Record<TipoVariacao, string> = {
  aumentou: 'Aumentou', manteve: 'Mesmo preço', baixou: 'Baixou', primeira: 'Primeira compra',
};

/** Compara o preço com a compra anterior (4 casas, como no banco). */
export function classificarVariacao(atual: number, anterior: number | null): { tipo: TipoVariacao; percentual: number | null } {
  if (anterior == null) return { tipo: 'primeira', percentual: null };
  const a = Math.round(Number(atual) * 10000);
  const b = Math.round(Number(anterior) * 10000);
  if (a === b) return { tipo: 'manteve', percentual: 0 };
  const percentual = b === 0 ? null : Math.round(((a - b) / b) * 10000) / 100;
  return { tipo: a > b ? 'aumentou' : 'baixou', percentual };
}

/** Variação do orçado em relação à tabela, em % (null sem os dois preços). */
export const variacaoTabela = (orcado: number | null | undefined, tabela: number | null | undefined) =>
  orcado == null || tabela == null || Number(tabela) === 0 ? null : Math.round(((Number(orcado) - Number(tabela)) / Number(tabela)) * 10000) / 100;

/**
 * Item do catálogo mais parecido com a descrição da nota: todas as palavras
 * do nome aparecem na descrição (o nome mais longo vence). Sem isso, nenhuma
 * sugestão — melhor deixar em branco que errar.
 */
export function sugerirMaterial(descricao: string, materiais: { id: string; nome: string; ativo?: boolean }[]): string | null {
  const desc = ` ${normalizar(descricao)} `;
  let melhor: { id: string; peso: number } | null = null;
  for (const m of materiais) {
    if (m.ativo === false) continue;
    const palavras = normalizar(m.nome).split(' ').filter(p => p.length >= 2);
    if (!palavras.length || !palavras.every(p => desc.includes(` ${p} `) || desc.includes(` ${p}s `))) continue;
    const peso = palavras.join('').length;
    if (!melhor || peso > melhor.peso) melhor = { id: m.id, peso };
  }
  return melhor?.id ?? null;
}

/** Converte um item da nota para a unidade do material (1 unidade da nota = `fator` do material). */
export function converterEmbalagem(qtdNota: number, valorNota: number, fator: number) {
  const f = fator > 0 ? fator : 1;
  return { quantidade: Math.round(qtdNota * f * 100) / 100, valor_unitario: Math.round((valorNota / f) * 10000) / 10000 };
}

// ---------- Catálogo ----------

export interface Material {
  id: string; nome: string; item_pai_id: string | null; unidade: string; categoria: string | null; is_epi: boolean; ativo: boolean;
}

/** "Detergente — 500 ml" para variação; o nome para item sem pai (igual a _pm_nome_material). */
export function nomeMaterial(m: Pick<Material, 'nome' | 'item_pai_id'> | undefined, todos: Pick<Material, 'id' | 'nome'>[]): string {
  if (!m) return '—';
  const pai = m.item_pai_id ? todos.find(x => x.id === m.item_pai_id) : undefined;
  return pai ? `${pai.nome} — ${m.nome}` : m.nome;
}

/** Itens que podem ser pedidos/orçados: ativos e sem variações ativas (o pai só agrupa). */
export const materiaisPediveis = (todos: Material[]) => todos.filter(m => m.ativo
  && (!m.item_pai_id || todos.some(p => p.id === m.item_pai_id && p.ativo))
  && !todos.some(f => f.item_pai_id === m.id && f.ativo));

// ---------- Link público ----------

export type Solicitante = { matricula: number; cpf?: undefined } | { cpf: string; matricula?: undefined };
const soDigitos = (v: string) => v.replace(/\D/g, '');
const solicitanteArgs = (s: Solicitante) => ({ _matricula: s.matricula ?? null, _cpf: s.cpf ? soDigitos(s.cpf) : null });

export interface MaterialPublico { id: string; nome: string; unidade: string; categoria: string | null; grupo: string | null }
export interface PostoPublico { id: string; nome: string; uf: string; sob_demanda: boolean; itens: string[] | null }
export interface PedidoDoSolicitante {
  id: string; codigo: string; status: StatusPedido; data_pedido: string; criado_em: string; posto_id: string;
  recorrente: boolean; posto: string; observacao: string | null;
  itens: { material_id: string; nome: string; unidade: string; quantidade: number; quantidade_pedida: number }[] | null;
  historico: { status: StatusPedido; em: string; comentario: string | null }[] | null;
}
export interface RecorrenciaDoSolicitante {
  id: string; frequencia: Frequencia; proxima_data: string; posto: string;
  itens: { nome: string; unidade: string; quantidade: number }[] | null;
}
export interface Identificado {
  nome: string; cargo: string | null; uf: string | null; posto_sugerido: string | null;
  postos: PostoPublico[];
  materiais: MaterialPublico[];
  pedidos: PedidoDoSolicitante[];
  recorrencias: RecorrenciaDoSolicitante[];
}
export const nomePublico = (m: MaterialPublico) => (m.grupo ? `${m.grupo} — ${m.nome}` : m.nome);
/** Catálogo do posto: posto sob demanda só vê os itens liberados. */
export const catalogoDoPosto = (materiais: MaterialPublico[], posto: PostoPublico | undefined) =>
  !posto?.sob_demanda ? materiais : materiais.filter(m => (posto.itens ?? []).includes(m.id));

type FuncaoPublica = 'pedido_material_identificar' | 'pedido_material_enviar' | 'pedido_material_cancelar' | 'pedido_material_reenviar';
async function chamarPublica<T>(fn: FuncaoPublica, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message?.includes('Failed to fetch') ? 'Sem conexão com o servidor. Verifique a internet.' : error.message);
  const r = data as { erro?: string } | null;
  if (r?.erro) throw new Error(r.erro);
  return r as T;
}

export const identificar = (s: Solicitante) => chamarPublica<Identificado>('pedido_material_identificar', solicitanteArgs(s));

export const enviarPedido = (s: Solicitante, dados: {
  telefone: string; postoId: string; itens: { material_id: string; quantidade: number }[];
  observacao: string; frequencia: Frequencia;
}) => chamarPublica<{ ok: true; codigo: string; recorrente: boolean }>('pedido_material_enviar', {
  ...solicitanteArgs(s), _telefone: soDigitos(dados.telefone), _posto_id: dados.postoId,
  _itens: dados.itens, _observacao: dados.observacao || null, _frequencia: dados.frequencia,
});

export const reenviarPedido = (s: Solicitante, pedidoId: string, itens: { material_id: string; quantidade: number }[], observacao: string) =>
  chamarPublica<{ ok: true }>('pedido_material_reenviar', {
    ...solicitanteArgs(s), _pedido_id: pedidoId, _itens: itens, _observacao: observacao || null,
  });

export const cancelarPedidoPublico = (s: Solicitante, alvo: { pedidoId?: string; recorrenciaId?: string }) =>
  chamarPublica<{ ok: true }>('pedido_material_cancelar', {
    ...solicitanteArgs(s), _pedido_id: alvo.pedidoId ?? null, _recorrencia_id: alvo.recorrenciaId ?? null,
  });

// ---------- Telas do sistema ----------

export interface ItemPedido {
  id: string; pedido_id: string; material_id: string; quantidade_pedida: number; quantidade: number;
  preco_ref: number | null; preco_orcado: number | null;
}
export interface EventoPedido {
  id: string; pedido_id: string; de_status: StatusPedido | null; para_status: StatusPedido; papel: string | null;
  comentario: string | null; payload: { ajustes?: { item: string; de: number; para: number }[]; teto?: number | null; consumido?: number; valor_orcado?: number } | null;
  usuario_nome: string | null; created_at: string;
}
export interface Compra { id: string; pedido_id: string | null; fornecedor_nome: string; fornecedor_cnpj: string | null; numero_nf: string | null; data_compra: string; observacao: string | null }
export interface CompraItem { id: string; compra_id: string; material_id: string; quantidade: number; valor_unitario: number }
export interface Pedido {
  id: string; codigo: string; ano: number; numero: number; posto_id: string; uf: string; recorrencia_id: string | null;
  data_pedido: string; status: StatusPedido; valor_estimado: number; valor_orcado: number | null; valor_real: number | null;
  excede_teto: boolean; sem_preco: boolean; tem_epi: boolean; data_aprovacao: string | null; faturada_em: string | null;
  cobrar_cliente: boolean; cobrado_em: string | null; cobranca_ref: string | null;
  observacao: string | null; solicitante_nome: string; solicitante_matricula: string | null;
  solicitante_cargo: string | null; solicitante_telefone: string | null; created_at: string;
}
export interface PedidoCompleto extends Pedido { itens: ItemPedido[]; eventos: EventoPedido[]; compras: (Compra & { itens: CompraItem[] })[] }

const num = <T extends Record<string, unknown>>(r: T, campos: (keyof T)[]) => {
  const c = { ...r };
  for (const k of campos) if (c[k] != null) (c as Record<string, unknown>)[k as string] = Number(c[k]);
  return c;
};

const ABERTOS: StatusPedido[] = ['enviada', 'devolvida', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar'];

/** Pedidos (com itens, histórico e compras) criados ou aprovados desde `desde`, mais todos os em aberto. */
export async function listPedidos(desde: string): Promise<PedidoCompleto[]> {
  // Recorrências vencidas viram pedidos antes de listar.
  await supabase.rpc('gerar_pedidos_recorrentes').then(() => undefined, () => undefined);
  const { data, error } = await supabase.from('pedidos_material').select('*')
    .or(`data_pedido.gte.${desde},data_aprovacao.gte.${desde},status.in.(${ABERTOS.join(',')})`)
    .order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  const pedidos = (data ?? []).map(p => num(p, ['valor_estimado', 'valor_orcado', 'valor_real'])) as unknown as Pedido[];
  const ids = pedidos.map(p => p.id);
  const itens: ItemPedido[] = [];
  const eventos: EventoPedido[] = [];
  const compras: Compra[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [it, ev, co] = await Promise.all([
      supabase.from('pedidos_material_itens').select('*').in('pedido_id', lote),
      supabase.from('pedido_eventos').select('*').in('pedido_id', lote).order('created_at'),
      supabase.from('material_compras').select('*').in('pedido_id', lote).order('data_compra'),
    ]);
    if (it.error) throw it.error;
    if (ev.error) throw ev.error;
    if (co.error) throw co.error;
    itens.push(...(it.data ?? []).map(x => num(x, ['quantidade', 'quantidade_pedida', 'preco_ref', 'preco_orcado'])) as ItemPedido[]);
    eventos.push(...(ev.data ?? []) as unknown as EventoPedido[]);
    compras.push(...(co.data ?? []) as Compra[]);
  }
  const compraItens: CompraItem[] = [];
  const compraIds = compras.map(c => c.id);
  for (let i = 0; i < compraIds.length; i += 200) {
    const { data: ci, error: e } = await supabase.from('material_compras_itens').select('*').in('compra_id', compraIds.slice(i, i + 200));
    if (e) throw e;
    compraItens.push(...(ci ?? []).map(x => num(x, ['quantidade', 'valor_unitario'])) as CompraItem[]);
  }
  return pedidos.map(p => ({
    ...p,
    itens: itens.filter(i => i.pedido_id === p.id),
    eventos: eventos.filter(e => e.pedido_id === p.id),
    compras: compras.filter(c => c.pedido_id === p.id).map(c => ({ ...c, itens: compraItens.filter(i => i.compra_id === c.id) })),
  }));
}

/** Pedidos que contam no teto (a faturar ou faturados, fora os cobrados do cliente) com data de aprovação no período. */
export async function listGastos(inicio: string, fim: string) {
  const { data, error } = await supabase.from('pedidos_material')
    .select('id, posto_id, uf, data_aprovacao, valor_estimado, valor_orcado, valor_real')
    .in('status', ['a_faturar', 'faturada']).eq('cobrar_cliente', false)
    .gte('data_aprovacao', inicio).lte('data_aprovacao', fim).limit(20000);
  if (error) throw error;
  return (data ?? []).map(p => num(p, ['valor_estimado', 'valor_orcado', 'valor_real'])) as
    { id: string; posto_id: string; uf: string; data_aprovacao: string; valor_estimado: number; valor_orcado: number | null; valor_real: number | null }[];
}

// ---------- Cobrança ao cliente (postos sob demanda) ----------

export interface LinhaCobranca {
  id: string; codigo: string; posto_id: string; uf: string; data_pedido: string; faturada_em: string;
  valor: number; cobrado_em: string | null; cobranca_ref: string | null; solicitante_nome: string;
  notas: { numero_nf: string | null; fornecedor_nome: string; data_compra: string }[];
}

/** Pedidos faturados de postos sob demanda com faturamento no período (datas de Brasília). */
export async function listCobranca(inicio: string, fim: string): Promise<LinhaCobranca[]> {
  const ate = new Date(fim + 'T12:00:00Z');
  ate.setUTCDate(ate.getUTCDate() + 1);
  const { data, error } = await supabase.from('pedidos_material')
    .select('id, codigo, posto_id, uf, data_pedido, faturada_em, valor_real, cobrado_em, cobranca_ref, solicitante_nome')
    .eq('cobrar_cliente', true).eq('status', 'faturada')
    .gte('faturada_em', `${inicio}T00:00:00-03:00`).lt('faturada_em', `${ate.toISOString().slice(0, 10)}T00:00:00-03:00`)
    .order('faturada_em').limit(5000);
  if (error) throw error;
  const ids = (data ?? []).map(p => p.id);
  const notas: { pedido_id: string | null; numero_nf: string | null; fornecedor_nome: string; data_compra: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: c, error: e } = await supabase.from('material_compras')
      .select('pedido_id, numero_nf, fornecedor_nome, data_compra').in('pedido_id', ids.slice(i, i + 200)).order('data_compra');
    if (e) throw e;
    notas.push(...(c ?? []));
  }
  return (data ?? []).map(p => ({
    id: p.id, codigo: p.codigo, posto_id: p.posto_id, uf: p.uf, data_pedido: p.data_pedido, faturada_em: p.faturada_em as string,
    valor: Number(p.valor_real ?? 0), cobrado_em: p.cobrado_em, cobranca_ref: p.cobranca_ref, solicitante_nome: p.solicitante_nome,
    notas: notas.filter(n => n.pedido_id === p.id).map(({ numero_nf, fornecedor_nome, data_compra }) => ({ numero_nf, fornecedor_nome, data_compra })),
  }));
}

/** Total a cobrar e já cobrado por posto, do maior a cobrar para o menor. */
export function resumoCobranca(linhas: Pick<LinhaCobranca, 'posto_id' | 'valor' | 'cobrado_em'>[]) {
  const por = new Map<string, { posto_id: string; pedidos: number; a_cobrar: number; cobrado: number }>();
  for (const l of linhas) {
    const r = por.get(l.posto_id) ?? { posto_id: l.posto_id, pedidos: 0, a_cobrar: 0, cobrado: 0 };
    r.pedidos++;
    if (l.cobrado_em) r.cobrado += l.valor; else r.a_cobrar += l.valor;
    por.set(l.posto_id, r);
  }
  const c = (v: number) => Math.round(v * 100) / 100;
  return [...por.values()].map(r => ({ ...r, a_cobrar: c(r.a_cobrar), cobrado: c(r.cobrado) }))
    .sort((a, b) => b.a_cobrar - a.a_cobrar || b.cobrado - a.cobrado);
}

export async function marcarCobrados(ids: string[], cobrado: boolean, referencia: string) {
  const { data, error } = await supabase.rpc('pedidos_material_marcar_cobrados', {
    _ids: ids, _cobrado: cobrado, _referencia: referencia.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

async function rpcFluxo<T>(fn: 'pedido_material_conferir' | 'pedido_material_orcar' | 'pedido_material_aprovar_excesso' | 'pedido_material_cancelar_interno', args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const conferirPedido = (pedidoId: string, conferido: boolean, comentario: string, quantidades?: { item_id: string; quantidade: number }[]) =>
  rpcFluxo<{ status: StatusPedido; excede_teto?: boolean }>('pedido_material_conferir', {
    _pedido_id: pedidoId, _conferido: conferido, _comentario: comentario.trim() || null,
    _quantidades: quantidades?.length ? quantidades : null,
  });

export const orcarPedido = (pedidoId: string, precos: { item_id: string; preco: number }[], comentario: string) =>
  rpcFluxo<{ status: StatusPedido; valor_orcado: number; teto: number | null; consumido: number }>('pedido_material_orcar', {
    _pedido_id: pedidoId, _precos: precos.map(p => ({ ...p, preco: Math.round(p.preco * 10000) / 10000 })), _comentario: comentario.trim() || null,
  });

export const aprovarExcesso = (pedidoId: string, aprovar: boolean, comentario: string) =>
  rpcFluxo<{ status: StatusPedido }>('pedido_material_aprovar_excesso', { _pedido_id: pedidoId, _aprovar: aprovar, _comentario: comentario.trim() });

export const cancelarPedido = (pedidoId: string, motivo: string) =>
  rpcFluxo<{ status: StatusPedido }>('pedido_material_cancelar_interno', { _pedido_id: pedidoId, _motivo: motivo.trim() });

export interface ItemCompra {
  material_id: string; quantidade: number; valor_unitario: number;
  codigo_fornecedor?: string | null; descricao_nf?: string | null; unidade_nf?: string | null; fator?: number;
}

export async function registrarCompra(dados: {
  pedidoId: string | null; fornecedorId: string | null; fornecedorNome: string; fornecedorCnpj?: string | null;
  chaveAcesso?: string | null; numeroNf: string; data: string; itens: ItemCompra[]; observacao: string;
}) {
  const { data, error } = await supabase.rpc('material_compra_registrar', {
    _pedido_id: dados.pedidoId, _fornecedor_id: dados.fornecedorId, _fornecedor_nome: dados.fornecedorNome || null,
    _numero_nf: dados.numeroNf || null, _data_compra: dados.data, _itens: dados.itens as unknown as Json,
    _observacao: dados.observacao || null, _fornecedor_cnpj: dados.fornecedorCnpj || null, _chave_acesso: dados.chaveAcesso || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** O que as notas anteriores do fornecedor ensinaram: código do produto -> item e embalagem. */
export async function codigosDoFornecedor(cnpj: string): Promise<Map<string, { material_id: string; fator: number }>> {
  const { data, error } = await supabase.from('material_codigos_fornecedor')
    .select('codigo_fornecedor, material_id, fator').eq('fornecedor_cnpj', cnpj);
  if (error) return new Map();
  return new Map((data ?? []).map(c => [c.codigo_fornecedor, { material_id: c.material_id, fator: Number(c.fator) }]));
}

export async function minhasPendencias(): Promise<number> {
  const { data, error } = await supabase.rpc('pedidos_material_minhas_pendencias');
  if (error) return 0;
  return Number(data ?? 0);
}

// ---------- Cadastro ----------

export async function listMateriais(): Promise<Material[]> {
  const { data, error } = await supabase.from('materiais').select('id, nome, item_pai_id, unidade, categoria, is_epi, ativo').order('nome');
  if (error) throw error;
  return (data ?? []) as Material[];
}

export async function salvarMaterial(m: Partial<Material> & { nome: string }) {
  const payload = {
    nome: m.nome.trim(), item_pai_id: m.item_pai_id || null, unidade: (m.unidade ?? 'un').trim() || 'un',
    categoria: m.categoria?.trim() || null, is_epi: !!m.is_epi, ativo: m.ativo ?? true,
  };
  const { error } = m.id
    ? await supabase.from('materiais').update(payload).eq('id', m.id)
    : await supabase.from('materiais').insert(payload);
  if (error) throw new Error(error.code === '23505' ? 'Já existe um item com esse nome (no mesmo grupo).' : error.message);
}

export async function listItensPorPosto(): Promise<{ posto_id: string; material_id: string }[]> {
  const { data, error } = await supabase.from('posto_materiais').select('posto_id, material_id');
  if (error) throw error;
  return data ?? [];
}

/** Marca o posto como sob demanda (ou não) e grava a lista de itens liberados. */
export async function salvarPostoSobDemanda(postoId: string, sobDemanda: boolean, materialIds: string[]) {
  const { data, error } = await supabase.from('postos').update({ sob_demanda: sobDemanda }).eq('id', postoId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Sem permissão para alterar o posto (precisa editar Configurações).');
  const { error: e1 } = await supabase.from('posto_materiais').delete().eq('posto_id', postoId);
  if (e1) throw new Error(e1.message);
  if (sobDemanda && materialIds.length) {
    const { error: e2 } = await supabase.from('posto_materiais').insert(materialIds.map(material_id => ({ posto_id: postoId, material_id })));
    if (e2) throw new Error(e2.message);
  }
}

export async function listTetos(): Promise<(TetoPosto & { id: string })[]> {
  const { data, error } = await supabase.from('posto_tetos').select('id, posto_id, vigente_desde, valor').order('vigente_desde');
  if (error) throw error;
  return (data ?? []).map(t => num(t, ['valor']));
}

/** Define o teto do posto a partir do mês informado (AAAA-MM). Mesmo mês = substitui. */
export async function salvarTeto(postoId: string, mes: string, valor: number, criadoPor: string | null) {
  const { error } = await supabase.from('posto_tetos').upsert(
    { posto_id: postoId, vigente_desde: `${mes}-01`, valor, criado_por: criadoPor },
    { onConflict: 'posto_id,vigente_desde' });
  if (error) throw new Error(error.message);
}

export async function excluirTeto(id: string) {
  const { error } = await supabase.from('posto_tetos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface Aprovador { id: string; user_id: string; nivel: Papel; uf: string; postos: string[] }

export async function listAprovadores(): Promise<Aprovador[]> {
  const { data, error } = await supabase.from('pedido_aprovadores').select('id, user_id, nivel, uf, postos');
  if (error) throw error;
  return (data ?? []) as Aprovador[];
}

export async function salvarAprovador(a: { user_id: string; nivel: Papel; uf: string; postos: string[] }) {
  const { error } = await supabase.from('pedido_aprovadores').upsert(a, { onConflict: 'user_id,nivel,uf' });
  if (error) throw new Error(error.message);
}

export async function excluirAprovador(id: string) {
  const { error } = await supabase.from('pedido_aprovadores').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listUsuarios(): Promise<{ id: string; nome: string; email: string | null }[]> {
  const { data, error } = await supabase.from('profiles').select('id, nome_completo, email').eq('ativo', true).order('nome_completo');
  if (error) throw error;
  return (data ?? []).map(p => ({ id: p.id, nome: p.nome_completo || p.email || p.id, email: p.email }));
}

// ---------- Tabela de preços ----------

export interface TabelaPrecos {
  id: string; nome: string; status: 'rascunho' | 'vigente' | 'encerrada';
  vigencia_inicio: string | null; vigencia_fim: string | null; publicada_em: string | null; created_at: string;
}

export async function listTabelas(): Promise<TabelaPrecos[]> {
  const { data, error } = await supabase.from('tabela_precos').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TabelaPrecos[];
}

export async function precosDaTabela(tabelaId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('tabela_precos_itens').select('material_id, preco').eq('tabela_id', tabelaId);
  if (error) throw error;
  return new Map((data ?? []).map(i => [i.material_id, Number(i.preco)]));
}

/** Preços da tabela vigente (para o orçamento comparar). */
export async function precosVigentes(): Promise<Map<string, number>> {
  const { data } = await supabase.from('tabela_precos').select('id').eq('status', 'vigente').maybeSingle();
  return data ? precosDaTabela(data.id) : new Map();
}

export async function novaTabela(nome: string): Promise<string> {
  const { data, error } = await supabase.rpc('nova_tabela_precos', { _nome: nome });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Grava os preços do rascunho (preço vazio tira o item da tabela). */
export async function salvarPrecos(tabelaId: string, precos: Map<string, number | null>) {
  const apagar = [...precos].filter(([, v]) => v == null).map(([k]) => k);
  const gravar = [...precos].filter(([, v]) => v != null).map(([material_id, preco]) => ({ tabela_id: tabelaId, material_id, preco: preco as number }));
  if (apagar.length) {
    const { error } = await supabase.from('tabela_precos_itens').delete().eq('tabela_id', tabelaId).in('material_id', apagar);
    if (error) throw new Error(error.message);
  }
  if (gravar.length) {
    const { error } = await supabase.from('tabela_precos_itens').upsert(gravar, { onConflict: 'tabela_id,material_id' });
    if (error) throw new Error(error.message);
  }
}

export async function excluirTabela(id: string) {
  const { error } = await supabase.from('tabela_precos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function publicarTabela(id: string, inicio: string) {
  const { error } = await supabase.rpc('publicar_tabela_precos', { _tabela_id: id, _inicio: inicio });
  if (error) throw new Error(error.message);
}

export interface Simulacao { posto_id: string; posto: string; uf: string; teto: number | null; media_atual: number; media_nova: number; excede: boolean }

export async function simularTabela(id: string): Promise<Simulacao[]> {
  const { data, error } = await supabase.rpc('simular_tabela_precos', { _tabela_id: id });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Simulacao[]).map(s => num(s as unknown as Record<string, unknown>, ['teto', 'media_atual', 'media_nova']) as unknown as Simulacao);
}

// ---------- Avisos ----------

export interface ConfigAvisos { avisar_email: boolean; link_sistema: string | null; emails_epi: string[] }

export async function lerConfigAvisos(): Promise<ConfigAvisos> {
  const { data, error } = await supabase.from('pedido_config').select('avisar_email, link_sistema, emails_epi').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data ?? { avisar_email: true, link_sistema: null, emails_epi: [] };
}

export async function salvarConfigAvisos(c: ConfigAvisos) {
  const { data, error } = await supabase.from('pedido_config')
    .update({ avisar_email: c.avisar_email, link_sistema: c.link_sistema?.trim().replace(/\/+$/, '') || null, emails_epi: c.emails_epi })
    .eq('id', 1).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Sem permissão para alterar os avisos.');
}

/** Roda o aviso agora (o agendador roda a cada 5 min). */
export async function avisarAgora(): Promise<{ enviado: boolean; motivo?: string; emails?: number; pedidos?: number; sem_destinatario?: string[]; falhas?: string[] }> {
  const { data, error } = await supabase.functions.invoke('avisar-pedidos-material', { body: { modo: 'manual' } });
  if (error) {
    let msg = '';
    if ('context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error.message);
  }
  return data;
}

// ---------- Relatório de preços ----------

export interface LinhaPreco {
  id: string; data_compra: string; numero_nf: string | null; fornecedor_nome: string; fornecedor_cnpj: string | null;
  material_id: string; material_nome: string; unidade: string; categoria: string | null; quantidade: number;
  valor_unitario: number; valor_anterior: number | null; data_anterior: string | null; nf_anterior: string | null;
  pedido_id: string | null;
}

export async function listPrecos(inicio: string, fim: string): Promise<LinhaPreco[]> {
  const { data, error } = await supabase.from('vw_material_precos').select('*')
    .gte('data_compra', inicio).lte('data_compra', fim).order('data_compra', { ascending: false }).limit(20000);
  if (error) throw error;
  return (data ?? []).map(l => num(l, ['quantidade', 'valor_unitario', 'valor_anterior'])) as LinhaPreco[];
}
