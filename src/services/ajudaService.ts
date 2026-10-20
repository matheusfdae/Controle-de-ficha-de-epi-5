import { supabase } from '@/integrations/supabase/client';
import type { MensagemChat } from '../../supabase/functions/_shared/assistente';

export type { MensagemChat };

/** Pergunta ao assistente (Edge Function na produção; o próprio PC no localhost). */
export async function perguntarAjuda(conversa: MensagemChat[], pagina: string): Promise<string> {
  if (import.meta.env.DEV) {
    const res = await fetch('/__ajuda/perguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversa, pagina }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.error || `Falha (${res.status})`);
    return corpo.resposta;
  }
  const { data, error } = await supabase.functions.invoke('assistente-ajuda', { body: { conversa, pagina } });
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corpo?.error || error.message);
  }
  return data.resposta;
}
