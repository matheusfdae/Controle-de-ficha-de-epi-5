import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Pedidos — materiais de limpeza (migration 20261030120000_pedidos_material).
 * Controle só de quantidade: o encarregado pede pelo link público, o
 * supervisor confere (com o estoque e o consumo do posto) e compras atende.
 * Mudança de etapa só pelas funções do banco.
 */

// ---------- Papéis e etapas ----------

export type Papel = 'supervisor' | 'compras' | 'comercial' | 'gerencia';
export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: 'supervisor', rotulo: 'Supervisor', descricao: 'confere o pedido, ajusta quantidades ou devolve ao encarregado, e lança o estoque do posto' },
  { valor: 'compras', rotulo: 'Compras', descricao: 'atende os pedidos e mantém itens e listas dos postos' },
  { valor: 'gerencia', rotulo: 'Gerência', descricao: 'vê tudo do estado e pode cancelar pedidos' },
];
export const rotuloPapel = (p: string | null | undefined) =>
  PAPEIS.find(x => x.valor === p)?.rotulo ?? (p === 'encarregado' ? 'Encarregado' : p === 'comercial' ? 'Comercial' : p ?? '');

export type StatusPedido = 'enviada' | 'devolvida' | 'a_atender' | 'atendida' | 'cancelada';
export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  enviada: 'Aguardando conferência',
  devolvida: 'Devolvida ao encarregado',
  a_atender: 'A atender',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
};
/** Quem age em cada status (igual a _pm_responsaveis no banco). */
export const RESPONSAVEIS: Partial<Record<StatusPedido, Papel[]>> = { enviada: ['supervisor'], a_atender: ['compras'] };
/** Filas de trabalho, na ordem do fluxo. */
export const FILAS: { status: StatusPedido; rotulo: string }[] = [
  { status: 'enviada', rotulo: 'Conferência' },
  { status: 'a_atender', rotulo: 'A atender' },
];
/** Etapas da linha do tempo. */
export const ETAPAS: StatusPedido[] = ['enviada', 'a_atender', 'atendida'];

export type Frequencia = 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal';
export const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: 'unica', rotulo: 'Só desta vez' },
  { valor: 'diaria', rotulo: 'Todo dia' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
];
export const rotuloFrequencia = (f: string) => FREQUENCIAS.find(x => x.valor === f)?.rotulo ?? f;

export const formatarNumero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const dataBr = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('pt-BR') : '';

// ---------- Datas ----------

/** Primeiro dia do mês (AAAA-MM-01) de uma data AAAA-MM-DD. */
export const inicioDoMes = (data: string) => data.slice(0, 8) + '01';

/** Hoje em Brasília (AAAA-MM-DD), igual a _pm_hoje() no banco. */
export const hojeBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

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
export interface PostoPublico { id: string; nome: string; uf: string; itens: string[] | null }
export interface PedidoDoSolicitante {
  id: string; codigo: string; status: StatusPedido; data_pedido: string; criado_em: string; posto_id: string;
  recorrente: boolean; posto: string; observacao: string | null;
  itens: { material_id: string; nome: string; unidade: string; quantidade: number; quantidade_pedida: number; quantidade_atendida: number | null }[] | null;
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
/** Catálogo do posto: posto com lista própria só vê os itens da lista. */
export const catalogoDoPosto = (materiais: MaterialPublico[], posto: PostoPublico | undefined) =>
  posto?.itens == null ? materiais : materiais.filter(m => posto.itens!.includes(m.id));

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
  id: string; pedido_id: string; material_id: string; quantidade_pedida: number; quantidade: number; quantidade_atendida: number | null;
}
export interface EventoPedido {
  id: string; pedido_id: string; de_status: StatusPedido | null; para_status: StatusPedido; papel: string | null;
  comentario: string | null; payload: { ajustes?: { item: string; de: number; para: number }[] } | null;
  usuario_nome: string | null; created_at: string;
}
export interface Pedido {
  id: string; codigo: string; ano: number; numero: number; posto_id: string; uf: string; recorrencia_id: string | null;
  data_pedido: string; status: StatusPedido; tem_epi: boolean; conferida_em: string | null; atendida_em: string | null;
  observacao: string | null; solicitante_nome: string; solicitante_matricula: string | null;
  solicitante_cargo: string | null; solicitante_telefone: string | null; created_at: string;
}
export interface PedidoCompleto extends Pedido { itens: ItemPedido[]; eventos: EventoPedido[] }

const num = <T extends Record<string, unknown>>(r: T, campos: (keyof T)[]) => {
  const c = { ...r };
  for (const k of campos) if (c[k] != null) (c as Record<string, unknown>)[k as string] = Number(c[k]);
  return c;
};

export const ABERTOS: StatusPedido[] = ['enviada', 'devolvida', 'a_atender'];

/** Pedidos (com itens e histórico) feitos desde `desde`, mais todos os em andamento. */
export async function listPedidos(desde: string): Promise<PedidoCompleto[]> {
  // Recorrências vencidas viram pedidos antes de listar.
  await supabase.rpc('gerar_pedidos_recorrentes').then(() => undefined, () => undefined);
  const { data, error } = await supabase.from('pedidos_material').select('*')
    .or(`data_pedido.gte.${desde},status.in.(${ABERTOS.join(',')})`)
    .order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  const pedidos = (data ?? []) as unknown as Pedido[];
  const ids = pedidos.map(p => p.id);
  const itens: ItemPedido[] = [];
  const eventos: EventoPedido[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [it, ev] = await Promise.all([
      supabase.from('pedidos_material_itens').select('*').in('pedido_id', lote),
      supabase.from('pedido_eventos').select('*').in('pedido_id', lote).order('created_at'),
    ]);
    if (it.error) throw it.error;
    if (ev.error) throw ev.error;
    itens.push(...(it.data ?? []).map(x => num(x, ['quantidade', 'quantidade_pedida', 'quantidade_atendida'])) as ItemPedido[]);
    eventos.push(...(ev.data ?? []) as unknown as EventoPedido[]);
  }
  return pedidos.map(p => ({ ...p, itens: itens.filter(i => i.pedido_id === p.id), eventos: eventos.filter(e => e.pedido_id === p.id) }));
}

// ---------- Repetições (pedidos recorrentes) ----------

export interface Recorrencia {
  id: string; posto_id: string; frequencia: Exclude<Frequencia, 'unica'>; itens: { material_id: string; quantidade: number }[];
  observacao: string | null; proxima_data: string; ativa: boolean; encerrada_em: string | null; encerrada_por: string | null;
  criado_por: string | null; origem_pedido_id: string | null; solicitante_nome: string; created_at: string;
}

export async function listRecorrencias(): Promise<Recorrencia[]> {
  const { data, error } = await supabase.from('pedido_recorrencias').select('*').eq('ativa', true).order('proxima_data');
  if (error) throw error;
  return (data ?? []).map(r => ({ ...r, itens: ((r.itens ?? []) as { material_id: string; quantidade: number }[])
    .map(i => ({ material_id: i.material_id, quantidade: Number(i.quantidade) })) })) as Recorrencia[];
}

export async function repetirPedido(pedidoId: string, frequencia: Exclude<Frequencia, 'unica'>, primeira: string) {
  const { data, error } = await supabase.rpc('pedido_material_repetir', { _pedido_id: pedidoId, _frequencia: frequencia, _primeira: primeira });
  if (error) throw new Error(error.message);
  return data as { id: string; proxima_data: string };
}

export async function encerrarRecorrencia(id: string) {
  const { error } = await supabase.rpc('pedido_material_encerrar_recorrencia', { _recorrencia_id: id });
  if (error) throw new Error(error.message);
}

/** Próxima data de uma frequência a partir de `data` (igual a _pm_proxima). */
export function proximaData(data: string, frequencia: Exclude<Frequencia, 'unica'>) {
  const d = new Date(data + 'T12:00:00Z');
  if (frequencia === 'mensal') {
    const dia = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(Math.min(dia, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  } else d.setUTCDate(d.getUTCDate() + ({ diaria: 1, semanal: 7, quinzenal: 14 } as const)[frequencia]);
  return d.toISOString().slice(0, 10);
}

// ---------- Importação da planilha de material por posto ----------

export async function importarPlanilha(postos: { posto_id: string | null; criar: { nome: string; uf: string } | null;
  itens: { nome: string; unidade: string | null }[] }[]) {
  const { data, error } = await supabase.rpc('pedidos_importar_planilha', { _postos: postos as unknown as Json });
  if (error) throw new Error(error.message);
  return data as { postos_criados: number; itens_criados: number; listas: number; itens_nas_listas: number };
}

export interface Tarefa {
  id: string; codigo: string; status: StatusPedido; posto: string; uf: string; itens: number; tem_epi: boolean; desde: string;
}

/** Pedidos que esperam o usuário atual (pelo papel dele), da etapa mais recente para a mais antiga. */
export async function minhasTarefas(): Promise<Tarefa[]> {
  const { data, error } = await supabase.rpc('pedidos_material_minhas_tarefas');
  if (error) throw new Error(error.message);
  return (data ?? []) as Tarefa[];
}

/** O que a pessoa precisa fazer com um pedido nesta etapa. */
export const ACAO_DA_ETAPA: Partial<Record<StatusPedido, string>> = { enviada: 'Conferir', a_atender: 'Atender' };

async function rpcFluxo<T>(fn: 'pedido_material_conferir' | 'pedido_material_atender' | 'pedido_material_cancelar_interno', args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const conferirPedido = (pedidoId: string, conferido: boolean, comentario: string, quantidades?: { item_id: string; quantidade: number }[]) =>
  rpcFluxo<{ status: StatusPedido }>('pedido_material_conferir', {
    _pedido_id: pedidoId, _conferido: conferido, _comentario: comentario.trim() || null,
    _quantidades: quantidades?.length ? quantidades : null,
  });

/** Compras atende; `quantidades` = o que foi entregue de cada item (o que não vier = o conferido). */
export const atenderPedido = (pedidoId: string, comentario: string, quantidades?: { item_id: string; quantidade: number }[]) =>
  rpcFluxo<{ status: StatusPedido; diferencas: number }>('pedido_material_atender', {
    _pedido_id: pedidoId, _comentario: comentario.trim() || null, _quantidades: quantidades?.length ? quantidades : null,
  });

export const cancelarPedido = (pedidoId: string, motivo: string) =>
  rpcFluxo<{ status: StatusPedido }>('pedido_material_cancelar_interno', { _pedido_id: pedidoId, _motivo: motivo.trim() });

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
/** Substitui a lista de itens do posto (vazia = o encarregado vê o catálogo inteiro). */
export async function salvarListaDoPosto(postoId: string, materialIds: string[]) {
  const { error: e1 } = await supabase.from('posto_materiais').delete().eq('posto_id', postoId);
  if (e1) throw e1;
  if (materialIds.length) {
    const { error: e2 } = await supabase.from('posto_materiais').insert(materialIds.map(material_id => ({ posto_id: postoId, material_id })));
    if (e2) throw e2;
  }
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

// ---------- Avisos ----------

export interface ConfigAvisos { avisar_email: boolean; link_sistema: string | null; emails_epi: string[]; dias_cobertura: number }

export async function lerConfigAvisos(): Promise<ConfigAvisos> {
  const { data, error } = await supabase.from('pedido_config').select('avisar_email, link_sistema, emails_epi, dias_cobertura').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data ?? { avisar_email: true, link_sistema: null, emails_epi: [], dias_cobertura: 30 };
}

export async function salvarConfigAvisos(c: ConfigAvisos) {
  const { data, error } = await supabase.from('pedido_config')
    .update({ avisar_email: c.avisar_email, link_sistema: c.link_sistema?.trim().replace(/\/+$/, '') || null, emails_epi: c.emails_epi, dias_cobertura: c.dias_cobertura })
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
