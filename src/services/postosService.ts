import { supabase } from '@/integrations/supabase/client';

export interface Posto {
  id: string;
  nome: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  apelidos: string[];
  endereco: string | null;
  ativo: boolean;
}

/** Mesma normalização da coluna gerada postos.nome_chave. */
export const chavePosto = (nome: string | null | undefined) =>
  (nome ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function listPostos(): Promise<Posto[]> {
  const { data, error } = await supabase
    .from('postos').select('id, nome, uf, latitude, longitude, apelidos, endereco, ativo').order('nome');
  if (error) throw error;
  return data ?? [];
}

export async function salvarPosto(p: Partial<Posto> & { nome: string; uf: string }): Promise<void> {
  const payload = {
    nome: p.nome.trim(),
    uf: p.uf,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    apelidos: (p.apelidos ?? []).map(a => a.trim()).filter(Boolean),
    endereco: p.endereco?.trim() || null,
    ativo: p.ativo ?? true,
  };
  const { error } = p.id
    ? await supabase.from('postos').update(payload).eq('id', p.id)
    : await supabase.from('postos').insert(payload);
  if (error) throw new Error(error.code === '23505' ? 'Já existe um posto com esse nome.' : error.message);
}

export async function excluirPosto(id: string): Promise<void> {
  const { error } = await supabase.from('postos').delete().eq('id', id);
  if (error) throw error;
}

/** Cria (sem coordenadas) os postos que aparecem nas fichas e ainda não existem. */
export async function importarPostosDasFichas(postos: { nome: string; uf: string }[]): Promise<number> {
  if (postos.length === 0) return 0;
  const { data, error } = await supabase.from('postos')
    .upsert(postos.map(p => ({ nome: p.nome.trim(), uf: p.uf })), { onConflict: 'nome_chave', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Nome ou apelido (normalizado) -> posto, para ligar o texto da ficha ao cadastro. */
export function indicePostos(postos: Posto[]): Map<string, Posto> {
  const idx = new Map<string, Posto>();
  for (const p of postos) {
    idx.set(chavePosto(p.nome), p);
    for (const a of p.apelidos) if (!idx.has(chavePosto(a))) idx.set(chavePosto(a), p);
  }
  return idx;
}

/** Cria vários postos de uma vez (já com localização). */
export async function inserirPostos(postos: { nome: string; uf: string; latitude: number; longitude: number }[]): Promise<void> {
  if (postos.length === 0) return;
  const { error } = await supabase.from('postos').insert(postos.map(p => ({ ...p, nome: p.nome.trim() })));
  if (error) throw new Error(error.message);
}

export async function atualizarLocalizacao(id: string, latitude: number, longitude: number): Promise<void> {
  const { error } = await supabase.from('postos').update({ latitude, longitude }).eq('id', id);
  if (error) throw new Error(error.message);
}
