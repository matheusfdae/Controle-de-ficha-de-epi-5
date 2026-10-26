import { supabase } from '@/integrations/supabase/client';
import type { EnvioWhatsApp, MensagemLote, ResumoLote } from '../../supabase/functions/_shared/whatsapp';

export type { MensagemLote, ResumoLote, SituacaoMensagem } from '../../supabase/functions/_shared/whatsapp';

export interface ResultadoWhatsApp {
  /** Código do envio, para acompanhar na aba "Envios WhatsApp". */
  lote: string;
  agendados: number;
  /** Com celular, mas o número não tem WhatsApp. */
  semWhatsApp: string[];
  /** Horário (ISO) da última mensagem agendada. */
  termina: string | null;
  /** Localhost: tudo foi para o número de teste. */
  teste?: boolean;
}

const CHAVE_MODELO = 'whatsapp-convocacao-modelo';

/** Último texto usado neste navegador (vazio = o padrão). */
export function lerModeloSalvo(): string {
  try { return localStorage.getItem(CHAVE_MODELO) ?? ''; } catch { return ''; }
}

export function salvarModelo(modelo: string) {
  try { localStorage.setItem(CHAVE_MODELO, modelo); } catch { /* navegador sem armazenamento */ }
}

/**
 * No localhost a chamada sai do próprio PC (vite.config.ts > whatsappLocal);
 * na produção, pela Edge Function `whatsapp-convocacao` ({ acao, ... }).
 */
async function chamar<T>(acao: 'enviar' | 'lotes' | 'cancelar', rotaLocal: string, corpo: object): Promise<T> {
  if (import.meta.env.DEV) {
    const res = await fetch(rotaLocal, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok || !r || r.error) throw new Error(r?.error || `Falha no WhatsApp (HTTP ${res.status})`);
    return r as T;
  }
  const { data, error } = await supabase.functions.invoke('whatsapp-convocacao', { body: { acao, ...corpo } });
  const erro = (data as { error?: string } | null)?.error;
  if (error || erro) {
    let msg = erro;
    if (!msg && error && 'context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error?.message || 'Falha no WhatsApp');
  }
  return data as T;
}

/** Agenda no WA-AKG as mensagens montadas na tela (uma por colaborador), espaçadas no tempo. */
export function enviarConvocacaoPorWhatsApp(envios: EnvioWhatsApp[]) {
  const corpo = { envios: envios.map(({ nome, numero, texto }) => ({ nome, numero, texto })) };
  return chamar<ResultadoWhatsApp>('enviar', '/__whatsapp/enviar-convocacao', corpo);
}

/** Resumo dos últimos envios, mais novo primeiro. */
export function listarLotesWhatsApp() {
  return chamar<ResumoLote[]>('lotes', '/__whatsapp/lotes', {});
}

/** Cada mensagem de um envio e a situação dela. */
export function lerLoteWhatsApp(lote: string) {
  return chamar<MensagemLote[]>('lotes', '/__whatsapp/lotes', { lote });
}

/** Cancela as mensagens do envio que ainda não saíram. */
export function cancelarLoteWhatsApp(lote: string) {
  return chamar<{ cancelled: number }>('cancelar', '/__whatsapp/cancelar-lote', { lote });
}
