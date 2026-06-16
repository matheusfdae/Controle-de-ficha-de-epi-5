import { supabase } from '@/integrations/supabase/client';

export interface TermoColetivoItem {
  id?: string;
  termo_id?: string;
  ordem: number;
  colaborador_nome: string;
  colaborador_cpf?: string | null;
  epi_id?: string | null;
  material: string;
  ca?: string | null;
  tamanho?: string | null;
  quantidade: number;
  assinatura_url?: string | null;
  data_assinatura?: string | null;
  ip_assinatura?: string | null;
}

export interface TermoColetivo {
  id?: string;
  posto: string;
  mes_referencia: string;
  lider?: string | null;
  empresa?: string | null;
  observacoes?: string | null;
  status?: 'rascunho' | 'em_assinatura' | 'finalizado';
  created_at?: string;
  updated_at?: string;
}

export interface TermoColetivoFull {
  termo: TermoColetivo;
  itens: TermoColetivoItem[];
}

export async function listTermosColetivos(): Promise<TermoColetivo[]> {
  const { data, error } = await supabase
    .from('termos_epi_coletivos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('listTermosColetivos', error); return []; }
  return (data ?? []) as TermoColetivo[];
}

export async function createTermoColetivo(
  termo: Omit<TermoColetivo, 'id' | 'created_at' | 'updated_at' | 'status'>,
  itens: Omit<TermoColetivoItem, 'termo_id' | 'id'>[]
): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const { data: cab, error } = await supabase
    .from('termos_epi_coletivos')
    .insert({ ...termo, criado_por: u.user?.id ?? null, status: 'em_assinatura' })
    .select('id')
    .single();
  if (error || !cab) throw error ?? new Error('Falha ao criar termo');
  const termoId = cab.id;

  if (itens.length > 0) {
    const payload = itens.map((it, idx) => ({ ...it, ordem: idx, termo_id: termoId }));
    const { error: itErr } = await supabase
      .from('termos_epi_coletivos_itens')
      .insert(payload);
    if (itErr) throw itErr;
  }
  return termoId;
}

export async function getTermoColetivoFull(id: string): Promise<TermoColetivoFull | null> {
  const { data: termo, error } = await supabase
    .from('termos_epi_coletivos').select('*').eq('id', id).maybeSingle();
  if (error || !termo) { console.error(error); return null; }
  const { data: itens } = await supabase
    .from('termos_epi_coletivos_itens')
    .select('*')
    .eq('termo_id', id)
    .order('ordem', { ascending: true });
  return { termo: termo as TermoColetivo, itens: (itens ?? []) as TermoColetivoItem[] };
}

export async function getTermoColetivoPublico(id: string): Promise<TermoColetivoFull | null> {
  const { data, error } = await supabase.rpc('get_termo_coletivo_publico', { _termo_id: id });
  if (error || !data) { console.error('getTermoColetivoPublico', error); return null; }
  const r = data as unknown as { termo: TermoColetivo; itens: TermoColetivoItem[] } | null;
  if (!r?.termo) return null;
  return r;
}

export async function assinarItemColetivo(itemId: string, assinaturaDataUrl: string): Promise<{ ok: boolean; error?: string }> {
  let ip: string | null = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) ip = (await r.json()).ip;
  } catch { /* ignore */ }
  const { data, error } = await supabase.rpc('assinar_termo_coletivo_item', {
    _item_id: itemId,
    _assinatura: assinaturaDataUrl,
    _ip: ip,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string };
  return r;
}

export async function finalizarTermo(id: string): Promise<void> {
  await supabase.from('termos_epi_coletivos').update({ status: 'finalizado' }).eq('id', id);
}

export async function deletarTermo(id: string): Promise<void> {
  await supabase.from('termos_epi_coletivos').delete().eq('id', id);
}
