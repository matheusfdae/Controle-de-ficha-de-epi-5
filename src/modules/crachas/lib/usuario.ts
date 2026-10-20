import { supabase } from '@/integrations/supabase/client';

/**
 * Usuário logado no padrão que o código dos crachás espera
 * ({ data: { user } }), mas vindo do login do EPI (Clerk): o id é o do
 * perfil do EPI (public.profiles.id = current_profile_id()).
 */
let cache: { id: string; email: string | null } | null = null;

export async function obterUsuarioAtual(): Promise<{ data: { user: { id: string; email: string | null } | null } }> {
  if (cache) return { data: { user: cache } };
  const { data: id } = await supabase.rpc('current_profile_id' as never);
  if (!id) return { data: { user: null } };
  const { data: perfil } = await supabase.from('profiles').select('email').eq('id', id as unknown as string).maybeSingle();
  cache = { id: id as unknown as string, email: perfil?.email ?? null };
  return { data: { user: cache } };
}

/** Ao sair do sistema, esquece o usuário guardado. */
export function esquecerUsuarioAtual() {
  cache = null;
}
