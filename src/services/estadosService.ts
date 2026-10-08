import { supabase } from '@/integrations/supabase/client';

export interface Estado {
  uf: string;
  nome: string;
}

export async function listEstados(): Promise<Estado[]> {
  const { data, error } = await supabase.from('estados').select('uf, nome').order('uf');
  if (error) throw error;
  return data ?? [];
}

export async function listUfsDoUsuario(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_estados').select('uf').eq('user_id', userId).order('uf');
  if (error) throw error;
  return (data ?? []).map(r => r.uf);
}

/** Substitui os estados liberados para o usuário (só admin, pela RLS). */
export async function salvarUfsDoUsuario(userId: string, ufs: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('user_estados').delete().eq('user_id', userId);
  if (delErr) throw delErr;
  if (ufs.length === 0) return;
  const { error } = await supabase.from('user_estados').insert(ufs.map(uf => ({ user_id: userId, uf })));
  if (error) throw error;
}
