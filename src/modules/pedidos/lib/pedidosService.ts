import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { normalizar } from '@/lib/nfe';

/**
 * Pedido de material dos postos (migration 20261030120000_pedidos_material).
 * O líder pede pelo link público; a aprovação, a compra e os relatórios ficam
 * nas telas do sistema. Escritas de pedido/compra só pelas funções do banco.
 */

// ---------- Rótulos ----------

export type Nivel = 'supervisor' | 'gerente' | 'diretor' | 'compras';
export const NIVEIS: { valor: Nivel; rotulo: string }[] = [
  { valor: 'supervisor', rotulo: 'Supervisor' },
  { valor: 'gerente', rotulo: 'Gerente' },
  { valor: 'diretor', rotulo: 'Diretor' },
  { valor: 'compras', rotulo: 'Compras' },
];
export const rotuloNivel = (n: string | null | undefined) => NIVEIS.find(x => x.valor === n)?.rotulo ?? n ?? '';

export type StatusPedido = 'em_aprovacao' | 'aprovado' | 'comprado' | 'reprovado' | 'cancelado';
export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  em_aprovacao: 'Em aprovação',
  aprovado: 'Aprovado (aguardando compra)',
  comprado: 'Comprado',
  reprovado: 'Reprovado',
  cancelado: 'Cancelado',
};
export const statusComNivel = (status: string, nivel: string | null) =>
  status === 'em_aprovacao' && nivel ? `Aguardando ${rotuloNivel(nivel).toLowerCase()}` : STATUS_PEDIDO[status as StatusPedido] ?? status;

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
export const numeroPedido = (n: number) => `PM-${String(n).padStart(6, '0')}`;
export const dataBr = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('pt-BR') : '';

// ---------- Cálculos (puros, testados em src/test/pedidosMaterial.test.ts) ----------

/** Valor que conta no teto: o real da compra quando houver, senão o estimado. */
export const valorDoPedido = (p: { valor_real: number | null; valor_estimado: number }) =>
  Number(p.valor_real ?? p.valor_estimado);

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
  pedidos: { data_aprovacao: string | null; valor_real: number | null; valor_estimado: number }[],
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

/** Compara o preço com a compra anterior (centavos de real, 4 casas como no banco). */
export function classificarVariacao(atual: number, anterior: number | null): { tipo: TipoVariacao; percentual: number | null } {
  if (anterior == null) return { tipo: 'primeira', percentual: null };
  const a = Math.round(Number(atual) * 10000);
  const b = Math.round(Number(anterior) * 10000);
  if (a === b) return { tipo: 'manteve', percentual: 0 };
  const percentual = b === 0 ? null : Math.round(((a - b) / b) * 10000) / 100;
  return { tipo: a > b ? 'aumentou' : 'baixou', percentual };
}

/**
 * Material do catálogo mais parecido com a descrição da nota: todas as
 * palavras do nome do material aparecem na descrição (o nome mais longo
 * vence). Sem isso, nenhuma sugestão — melhor deixar em branco que errar.
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

// ---------- Link público ----------

export type Solicitante = { matricula: number; cpf?: undefined } | { cpf: string; matricula?: undefined };
const soDigitos = (v: string) => v.replace(/\D/g, '');
const solicitanteArgs = (s: Solicitante) => ({ _matricula: s.matricula ?? null, _cpf: s.cpf ? soDigitos(s.cpf) : null });

export interface MaterialPublico { id: string; nome: string; unidade: string; categoria: string | null }
export interface PedidoDoSolicitante {
  id: string; numero: number; status: StatusPedido; nivel_atual: string | null; data_pedido: string;
  criado_em: string; recorrente: boolean; posto: string; observacao: string | null;
  itens: { nome: string; unidade: string; quantidade: number; quantidade_pedida: number }[] | null;
  andamento: { nivel: string; decisao: 'aprovado' | 'reprovado'; em: string; comentario: string | null }[] | null;
}
export interface RecorrenciaDoSolicitante {
  id: string; frequencia: Frequencia; proxima_data: string; posto: string;
  itens: { nome: string; unidade: string; quantidade: number }[] | null;
}
export interface Identificado {
  nome: string; cargo: string | null; uf: string | null; posto_sugerido: string | null;
  postos: { id: string; nome: string; uf: string }[];
  materiais: MaterialPublico[];
  pedidos: PedidoDoSolicitante[];
  recorrencias: RecorrenciaDoSolicitante[];
}

type FuncaoPublica = 'pedido_material_identificar' | 'pedido_material_enviar' | 'pedido_material_cancelar';
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
}) => chamarPublica<{ ok: true; numero: number; recorrente: boolean }>('pedido_material_enviar', {
  ...solicitanteArgs(s), _telefone: soDigitos(dados.telefone), _posto_id: dados.postoId,
  _itens: dados.itens, _observacao: dados.observacao || null, _frequencia: dados.frequencia,
});

export const cancelarPedidoPublico = (s: Solicitante, alvo: { pedidoId?: string; recorrenciaId?: string }) =>
  chamarPublica<{ ok: true; pedidos: PedidoDoSolicitante[] }>('pedido_material_cancelar', {
    ...solicitanteArgs(s), _pedido_id: alvo.pedidoId ?? null, _recorrencia_id: alvo.recorrenciaId ?? null,
  });

// ---------- Telas do sistema ----------

export interface Material { id: string; nome: string; unidade: string; categoria: string | null; preco_referencia: number | null; ativo: boolean }
export interface ItemPedido { id: string; pedido_id: string; material_id: string; quantidade: number; quantidade_pedida: number; preco_estimado: number | null }
export interface Aprovacao { id: string; pedido_id: string; nivel: string; decisao: 'aprovado' | 'reprovado'; comentario: string | null; valor_no_momento: number | null; saldo_teto_no_momento: number | null; usuario_nome: string | null; created_at: string }
export interface Compra { id: string; pedido_id: string | null; fornecedor_nome: string; fornecedor_cnpj: string | null; numero_nf: string | null; data_compra: string; observacao: string | null }
export interface CompraItem { id: string; compra_id: string; material_id: string; quantidade: number; valor_unitario: number }
export interface Pedido {
  id: string; numero: number; posto_id: string; uf: string; recorrencia_id: string | null; data_pedido: string;
  status: StatusPedido; nivel_atual: Nivel | null; niveis: Nivel[]; valor_estimado: number; valor_real: number | null;
  acima_do_teto: boolean; sem_preco: boolean; data_aprovacao: string | null; aprovado_em: string | null;
  observacao: string | null; solicitante_nome: string; solicitante_matricula: string | null;
  solicitante_cargo: string | null; solicitante_telefone: string | null; created_at: string;
}
export interface PedidoCompleto extends Pedido { itens: ItemPedido[]; aprovacoes: Aprovacao[]; compras: (Compra & { itens: CompraItem[] })[] }

const num = <T extends Record<string, unknown>>(r: T, campos: (keyof T)[]) => {
  const c = { ...r };
  for (const k of campos) if (c[k] != null) (c as Record<string, unknown>)[k as string] = Number(c[k]);
  return c;
};

/** Pedidos (com itens, aprovações e compras) criados ou aprovados desde `desde`, mais todos os em aberto. */
export async function listPedidos(desde: string): Promise<PedidoCompleto[]> {
  // Recorrências vencidas viram pedidos antes de listar.
  await supabase.rpc('gerar_pedidos_recorrentes').then(() => undefined, () => undefined);
  const { data, error } = await supabase.from('pedidos_material').select('*')
    .or(`data_pedido.gte.${desde},data_aprovacao.gte.${desde},status.in.(em_aprovacao,aprovado)`)
    .order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  const pedidos = (data ?? []).map(p => num(p, ['numero', 'valor_estimado', 'valor_real'])) as unknown as Pedido[];
  const ids = pedidos.map(p => p.id);
  const itens: ItemPedido[] = [];
  const aprovacoes: Aprovacao[] = [];
  const compras: Compra[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [it, ap, co] = await Promise.all([
      supabase.from('pedidos_material_itens').select('*').in('pedido_id', lote),
      supabase.from('pedido_aprovacoes').select('*').in('pedido_id', lote).order('created_at'),
      supabase.from('material_compras').select('*').in('pedido_id', lote).order('data_compra'),
    ]);
    if (it.error) throw it.error;
    if (ap.error) throw ap.error;
    if (co.error) throw co.error;
    itens.push(...(it.data ?? []).map(x => num(x, ['quantidade', 'quantidade_pedida', 'preco_estimado'])) as ItemPedido[]);
    aprovacoes.push(...(ap.data ?? []).map(x => num(x, ['valor_no_momento', 'saldo_teto_no_momento'])) as Aprovacao[]);
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
    aprovacoes: aprovacoes.filter(a => a.pedido_id === p.id),
    compras: compras.filter(c => c.pedido_id === p.id).map(c => ({ ...c, itens: compraItens.filter(i => i.compra_id === c.id) })),
  }));
}

/** Pedidos aprovados (para teto e gráficos) com data de aprovação no período. */
export async function listGastos(inicio: string, fim: string) {
  const { data, error } = await supabase.from('pedidos_material')
    .select('id, posto_id, uf, data_aprovacao, valor_estimado, valor_real')
    .in('status', ['aprovado', 'comprado']).gte('data_aprovacao', inicio).lte('data_aprovacao', fim).limit(20000);
  if (error) throw error;
  return (data ?? []).map(p => num(p, ['valor_estimado', 'valor_real'])) as
    { id: string; posto_id: string; uf: string; data_aprovacao: string; valor_estimado: number; valor_real: number | null }[];
}

export async function decidirPedido(pedidoId: string, aprovar: boolean, comentario: string, quantidades?: { item_id: string; quantidade: number }[]) {
  const { data, error } = await supabase.rpc('pedido_material_decidir', {
    _pedido_id: pedidoId, _aprovar: aprovar, _comentario: comentario.trim() || null,
    _quantidades: quantidades?.length ? (quantidades as unknown as Json) : null,
  });
  if (error) throw new Error(error.message);
  return data as { status: StatusPedido; nivel_atual: Nivel | null };
}

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

/** O que as notas anteriores do fornecedor ensinaram: código do produto -> material e embalagem. */
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
  const { data, error } = await supabase.from('materiais').select('id, nome, unidade, categoria, preco_referencia, ativo').order('nome');
  if (error) throw error;
  return (data ?? []).map(m => num(m, ['preco_referencia'])) as Material[];
}

export async function salvarMaterial(m: Partial<Material> & { nome: string }) {
  const payload = {
    nome: m.nome.trim(), unidade: (m.unidade ?? 'un').trim() || 'un', categoria: m.categoria?.trim() || null,
    preco_referencia: m.preco_referencia ?? null, ativo: m.ativo ?? true,
  };
  const { error } = m.id
    ? await supabase.from('materiais').update(payload).eq('id', m.id)
    : await supabase.from('materiais').insert(payload);
  if (error) throw new Error(error.code === '23505' ? 'Já existe um material com esse nome.' : error.message);
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

export async function listAlcadas() {
  const { data, error } = await supabase.from('pedido_alcadas').select('nivel, ordem, valor_acima_de').order('ordem');
  if (error) throw error;
  return (data ?? []).map(a => num(a, ['valor_acima_de'])) as { nivel: Nivel; ordem: number; valor_acima_de: number | null }[];
}

export async function salvarAlcada(nivel: Nivel, valorAcimaDe: number | null) {
  const { data, error } = await supabase.from('pedido_alcadas').update({ valor_acima_de: valorAcimaDe }).eq('nivel', nivel).select('nivel');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Sem permissão para alterar a alçada.');
}

export interface Aprovador { id: string; user_id: string; nivel: Nivel; uf: string; postos: string[] }

export async function listAprovadores(): Promise<Aprovador[]> {
  const { data, error } = await supabase.from('pedido_aprovadores').select('id, user_id, nivel, uf, postos');
  if (error) throw error;
  return (data ?? []) as Aprovador[];
}

export async function salvarAprovador(a: { user_id: string; nivel: Nivel; uf: string; postos: string[] }) {
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

export interface ConfigAvisos { avisar_email: boolean; link_sistema: string | null }

export async function lerConfigAvisos(): Promise<ConfigAvisos> {
  const { data, error } = await supabase.from('pedido_config').select('avisar_email, link_sistema').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data ?? { avisar_email: true, link_sistema: null };
}

export async function salvarConfigAvisos(c: ConfigAvisos) {
  const { data, error } = await supabase.from('pedido_config')
    .update({ avisar_email: c.avisar_email, link_sistema: c.link_sistema?.trim().replace(/\/+$/, '') || null })
    .eq('id', 1).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Sem permissão para alterar os avisos.');
}

/** Roda o aviso aos aprovadores agora (o agendador roda a cada 5 min). */
export async function avisarAgora(): Promise<{ enviado: boolean; motivo?: string; emails?: number; pedidos?: number; sem_aprovador?: number[]; falhas?: string[] }> {
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
