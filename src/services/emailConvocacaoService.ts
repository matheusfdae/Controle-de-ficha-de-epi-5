import { supabase } from '@/integrations/supabase/client';
import type { ConvocacaoUniforme } from '@/lib/convocacaoUniforme';

export interface EmailConvocacaoConfig {
  destinatarios: string[];
  /** Em cópia (Cc). */
  copia: string[];
  automatico: boolean;
  /** 0 = domingo ... 6 = sábado */
  dia_semana: number;
  /** Estados do envio automático (vazio = todos). */
  ufs: string[];
  ultimo_envio_automatico: string | null;
}

const tabela = () => supabase.from('email_convocacao_config');

export async function lerConfigEmail(): Promise<EmailConvocacaoConfig | null> {
  const { data, error } = await tabela().select('destinatarios, copia, automatico, dia_semana, ufs, ultimo_envio_automatico')
    .eq('id', 1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function salvarConfigEmail(c: Omit<EmailConvocacaoConfig, 'ultimo_envio_automatico'>): Promise<void> {
  const { error } = await tabela().update(c).eq('id', 1);
  if (error) throw error;
}

/** Separa e-mails digitados com vírgula, ponto e vírgula, espaço ou quebra de linha. */
export function lerListaEmails(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = texto.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const unicos = Array.from(new Set(partes));
  const ok = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  return { validos: unicos.filter(ok), invalidos: unicos.filter(e => !ok(e)) };
}

export async function enviarConvocacaoPorEmail(
  destinatarios: string[], uf?: string, local?: { lista: ConvocacaoUniforme[]; ufs: string[] }, copia: string[] = [],
) {
  if (import.meta.env.DEV && local) {
    // No localhost o e-mail sai do próprio PC (vite.config.ts > emailLocal), com a lista da tela.
    const res = await fetch('/__email/enviar-convocacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatarios, copia, ...local }),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok || !r?.enviado) throw new Error(r?.error || `Falha ao enviar (HTTP ${res.status})`);
    return r as { enviado: boolean; colaboradores: number; destinatarios: number };
  }
  const { data, error } = await supabase.functions.invoke('enviar-convocacao-uniforme', {
    body: { modo: 'manual', destinatarios, copia, uf },
  });
  const erro = (data as { error?: string } | null)?.error;
  if (error || erro) {
    // A função devolve a mensagem no corpo mesmo com status de erro.
    let msg = erro;
    if (!msg && error && 'context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error?.message || 'Falha ao enviar');
  }
  return data as { enviado: boolean; colaboradores: number; destinatarios: number };
}

// ---------- Conta do Microsoft 365 que envia (login por código, modelo delegado) ----------

export interface StatusContaMs { conectado: boolean; conta: string | null; caixa: string; tenant_id: string; client_id: string }
export interface LoginContaMs { codigo: string; url: string; expira_em: string; intervalo: number }

async function chamarContaMs<T>(corpo: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    const res = await fetch('/__email/microsoft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok || r?.error) throw new Error(r?.error || `Falha (HTTP ${res.status})`);
    return r as T;
  }
  const { data, error } = await supabase.functions.invoke('email-microsoft-login', { body: corpo });
  if (error) {
    let msg = (data as { error?: string } | null)?.error;
    if (!msg && 'context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error.message);
  }
  return data as T;
}

export const statusContaMs = () => chamarContaMs<StatusContaMs>({ acao: 'status' });
export const iniciarLoginContaMs = (tenantId: string, clientId: string, caixa: string) =>
  chamarContaMs<LoginContaMs>({ acao: 'iniciar', tenant_id: tenantId.trim(), client_id: clientId.trim(), caixa: caixa.trim() });
export const verificarLoginContaMs = () =>
  chamarContaMs<{ pendente?: boolean; conectado?: boolean; conta?: string | null }>({ acao: 'verificar' });
export const desconectarContaMs = () => chamarContaMs<{ conectado: boolean }>({ acao: 'desconectar' });
