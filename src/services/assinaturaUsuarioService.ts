import { supabase } from '@/integrations/supabase/client';

// Assinatura do responsável pela entrega de cada usuário (tabela
// assinaturas_usuario). As regras do banco só deixam cada um ler e
// alterar a própria, então profileId é sempre o do usuário logado.

/** Assinatura salva do usuário (data URL PNG) ou '' se ainda não cadastrou. */
export async function getMinhaAssinatura(profileId: string): Promise<string> {
  const { data, error } = await supabase.from('assinaturas_usuario')
    .select('assinatura').eq('profile_id', profileId).maybeSingle();
  if (error) throw error;
  return data?.assinatura ?? '';
}

export async function salvarMinhaAssinatura(profileId: string, assinatura: string): Promise<void> {
  const { error } = await supabase.from('assinaturas_usuario')
    .upsert({ profile_id: profileId, assinatura }, { onConflict: 'profile_id' });
  if (error) throw error;
}

export async function removerMinhaAssinatura(profileId: string): Promise<void> {
  const { error } = await supabase.from('assinaturas_usuario').delete().eq('profile_id', profileId);
  if (error) throw error;
}
