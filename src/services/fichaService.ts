import { EPIFicha, EPIItem } from '@/types/epi';
import { supabase } from '@/integrations/supabase/client';

// ===== Mapeamento DB <-> domínio =====

function mapItemFromDB(row: any): EPIItem {
  return {
    id: row.id,
    descricao: row.descricao || '',
    ca: row.ca || '',
    quantidade: row.quantidade || 1,
    tamanho: row.tamanho || '',
    dataEntrega: row.created_at?.split('T')[0] || '',
    postoServico: row.posto_servico || '',
    recebido: !!row.recebido,
    dataValidade: row.data_validade || undefined,
    epiId: row.epi_id || undefined,
  };
}

function mapFichaFromDB(ficha: any, itens: any[]): EPIFicha {
  return {
    id: ficha.id,
    nomeFuncionario: ficha.nome_funcionario || '',
    funcao: ficha.funcao || '',
    telefone: ficha.telefone || '',
    cpf: ficha.cpf_snapshot || '',
    matricula: ficha.matricula_snapshot || '',
    motivo: (ficha.motivo as any) || 'admissao',
    turno: (ficha.turno as any) || 'diurno',
    setor: ficha.setor_snapshot || '',
    empresa: ficha.empresa || '',
    dataEntrega: ficha.data_entrega,
    itens: (itens || []).map(mapItemFromDB),
    assinaturaColaborador: ficha.assinatura_colaborador_url || undefined,
    assinaturaResponsavel: ficha.assinatura_supervisor_url || undefined,
    status: ficha.status === 'assinada' ? 'assinada' : 'pendente',
    criadoEm: ficha.created_at,
    assinadoEm: ficha.data_assinatura_colaborador || undefined,
    observacoes: ficha.observacoes || undefined,
  };
}

// ===== Public API =====

export function generateId(): string {
  return crypto.randomUUID();
}

export async function getFichas(): Promise<EPIFicha[]> {
  const { data: fichas, error } = await supabase
    .from('fichas_epi')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  if (!fichas?.length) return [];

  const ids = fichas.map(f => f.id);
  const { data: itens } = await supabase
    .from('fichas_epi_itens')
    .select('*')
    .in('ficha_id', ids);

  return fichas.map(f => mapFichaFromDB(f, (itens || []).filter(i => i.ficha_id === f.id)));
}

export async function getFichaById(id: string): Promise<EPIFicha | undefined> {
  // Tenta autenticado primeiro; se falhar (link público), usa RPC
  const { data: ficha } = await supabase
    .from('fichas_epi').select('*').eq('id', id).maybeSingle();

  if (ficha) {
    const { data: itens } = await supabase
      .from('fichas_epi_itens').select('*').eq('ficha_id', id);
    return mapFichaFromDB(ficha, itens || []);
  }

  // Fallback público (RPC SECURITY DEFINER)
  const { data: pub } = await supabase.rpc('get_ficha_publica', { _ficha_id: id });
  if (!pub) return undefined;
  const payload = pub as any;
  return mapFichaFromDB(payload.ficha, payload.itens || []);
}

export async function saveFicha(ficha: EPIFicha): Promise<void> {
  const fichaPayload = {
    id: ficha.id,
    nome_funcionario: ficha.nomeFuncionario,
    funcao: ficha.funcao,
    telefone: ficha.telefone,
    cpf_snapshot: ficha.cpf,
    matricula_snapshot: ficha.matricula,
    setor_snapshot: ficha.setor,
    empresa: ficha.empresa,
    motivo: ficha.motivo,
    turno: ficha.turno,
    data_entrega: ficha.dataEntrega,
    observacoes: ficha.observacoes,
    status: ficha.status === 'assinada' ? 'assinada' : 'pendente_assinatura',
    assinatura_colaborador_url: ficha.assinaturaColaborador,
    assinatura_supervisor_url: ficha.assinaturaResponsavel,
    data_assinatura_colaborador: ficha.assinaturaColaborador && ficha.status === 'assinada'
      ? (ficha.assinadoEm || new Date().toISOString()) : null,
  } as any;

  const { error: upErr } = await supabase
    .from('fichas_epi')
    .upsert(fichaPayload);
  if (upErr) { console.error(upErr); throw upErr; }

  // Reescreve itens (delete + insert)
  await supabase.from('fichas_epi_itens').delete().eq('ficha_id', ficha.id);
  if (ficha.itens?.length) {
    const itensPayload = ficha.itens.map(i => ({
      id: i.id,
      ficha_id: ficha.id,
      descricao: i.descricao,
      ca: i.ca,
      quantidade: i.quantidade || 1,
      tamanho: i.tamanho,
      posto_servico: i.postoServico,
      data_validade: i.dataValidade || null,
      epi_id: i.epiId || null,
      recebido: !!i.recebido,
      motivo_entrega: 'admissao' as const,
      estado: 'novo' as const,
    }));
    const { error: itErr } = await supabase.from('fichas_epi_itens').insert(itensPayload);
    if (itErr) { console.error(itErr); throw itErr; }
  }
}

export async function deleteFicha(id: string): Promise<void> {
  await supabase.from('fichas_epi_itens').delete().eq('ficha_id', id);
  await supabase.from('fichas_epi').delete().eq('id', id);
}

/** Assina via link público (sem login) */
export async function assinarFichaPublica(
  fichaId: string,
  assinaturaBase64: string,
  itensRecebidosIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  let ip: string | null = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) ip = (await r.json()).ip;
  } catch { /* ignore */ }

  const { data, error } = await supabase.rpc('assinar_ficha_publica', {
    _ficha_id: fichaId,
    _assinatura: assinaturaBase64,
    _itens_recebidos: itensRecebidosIds,
    _ip: ip,
  });
  if (error) return { ok: false, error: error.message };
  const res = data as any;
  if (!res?.ok) return { ok: false, error: res?.error || 'erro' };
  return { ok: true };
}

// noop — dados de demo não são mais auto-criados
export async function seedDemoData(): Promise<void> { /* no-op */ }
