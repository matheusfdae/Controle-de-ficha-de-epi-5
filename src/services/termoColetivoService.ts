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
  itens: Omit<TermoColetivoItem, 'termo_id' | 'id' | 'ordem'>[]
): Promise<string> {
  // criado_por vem do DEFAULT current_profile_id() no banco (não há mais
  // sessão Supabase Auth no client para ler o id do usuário).
  const { data: cab, error } = await supabase
    .from('termos_epi_coletivos')
    .insert({ ...termo, status: 'em_assinatura' })
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

/** Gera (ou renova) o link público de assinatura de um item — só admin/rh. */
export async function gerarTokenTermoItem(itemId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('termo_coletivo_tokens')
    .insert({ item_id: itemId })
    .select('token')
    .single();
  if (error || !data) { console.error('gerarTokenTermoItem', error); return null; }
  return data.token;
}

/** Busca pública (sem login) de um único item do termo, via token dedicado. */
export async function getTermoColetivoItemPorToken(
  token: string,
): Promise<{ termo: Pick<TermoColetivo, 'posto' | 'mes_referencia'>; item: TermoColetivoItem } | null> {
  const { data, error } = await supabase.rpc('get_termo_coletivo_item_por_token', { _token: token });
  if (error || !data) { console.error('getTermoColetivoItemPorToken', error); return null; }
  return data as unknown as { termo: Pick<TermoColetivo, 'posto' | 'mes_referencia'>; item: TermoColetivoItem };
}

/** Assinatura via link público (sem login), validando o token do item. */
export async function assinarItemColetivoPorToken(token: string, assinaturaDataUrl: string): Promise<{ ok: boolean; error?: string }> {
  let ip: string | null = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) ip = (await r.json()).ip;
  } catch { /* ignore */ }
  const { data, error } = await supabase.rpc('assinar_termo_coletivo_item_por_token', {
    _token: token,
    _assinatura: assinaturaDataUrl,
    _ip: ip,
  });
  if (error) return { ok: false, error: error.message };
  return data as unknown as { ok: boolean; error?: string };
}

/** Assinatura presencial (tablet), com usuário admin/rh autenticado — respeita RLS da tabela. */
export async function assinarItemColetivo(itemId: string, assinaturaDataUrl: string): Promise<{ ok: boolean; error?: string }> {
  let ip: string | null = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) ip = (await r.json()).ip;
  } catch { /* ignore */ }

  const { data: current } = await supabase
    .from('termos_epi_coletivos_itens').select('data_assinatura').eq('id', itemId).maybeSingle();
  if (current?.data_assinatura) return { ok: false, error: 'ja_assinado' };

  const { error } = await supabase
    .from('termos_epi_coletivos_itens')
    .update({ assinatura_url: assinaturaDataUrl, data_assinatura: new Date().toISOString(), ip_assinatura: ip })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function finalizarTermo(id: string): Promise<void> {
  await supabase.from('termos_epi_coletivos').update({ status: 'finalizado' }).eq('id', id);
}

export async function deletarTermo(id: string): Promise<void> {
  await supabase.from('termos_epi_coletivos').delete().eq('id', id);
}
