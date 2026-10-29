import { supabase } from '@/integrations/supabase/client';

/** Configurações > E-mail: destinatários e envio automático do relatório de fichas pendentes, por estado. */
export interface EmailPendentesEstado {
  uf: string;
  destinatarios: string[];
  copia: string[];
  automatico: boolean;
  dia_semana: number;
  ultimo_envio_automatico: string | null;
}

const tabela = () => supabase.from('email_pendentes_estados');

/** Configuração dos estados liberados para o usuário (RLS). */
export async function listarConfigPendentes(): Promise<EmailPendentesEstado[]> {
  const { data, error } = await tabela().select('*').order('uf');
  if (error) throw error;
  return (data ?? []) as EmailPendentesEstado[];
}

export async function salvarConfigPendentes(c: Omit<EmailPendentesEstado, 'ultimo_envio_automatico'>): Promise<void> {
  const { error } = await tabela().upsert(c, { onConflict: 'uf' });
  if (error) throw error;
}

export interface ResultadoEnvioPendentes {
  enviado: boolean; fichas: number; antigas: number; sem_itens: number; destinatarios: number; copia: number;
  /** A imagem do painel não pôde ser gerada (o e-mail saiu sem ela). */
  erro_imagem?: string | null;
}

/** Envia agora o relatório do estado (Edge Function na produção; o próprio PC no localhost). */
export async function enviarRelatorioPendentes(envio: { uf: string; destinatarios: string[]; copia: string[] }): Promise<ResultadoEnvioPendentes> {
  if (import.meta.env.DEV) {
    // No localhost o servidor de teste não lê o banco: a tela manda o que já pode ler.
    const res = await fetch('/__email/enviar-relatorio-pendentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envio, ...(await dadosDosPendentes(envio.uf)) }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.error || `Falha (${res.status})`);
    return corpo;
  }
  const { data, error } = await supabase.functions.invoke('enviar-relatorio-pendentes', { body: { modo: 'manual', ...envio } });
  if (error) {
    let msg = '';
    if ('context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error.message);
  }
  return data as ResultadoEnvioPendentes;
}

/** Fichas do estado (todas, para o painel), itens e links das pendentes que o usuário pode ler (usado só no localhost). */
async function dadosDosPendentes(uf: string) {
  const { data: fichas, error } = await supabase.from('fichas_epi')
    .select('id, numero, nome_funcionario, matricula_snapshot, funcao, posto_snapshot, uf, empresa, motivo, status, created_at')
    .eq('uf', uf);
  if (error) throw new Error(error.message);
  const ids = (fichas ?? []).map(f => f.id);
  const pendentes = new Set((fichas ?? []).filter(f => f.status !== 'assinada').map(f => f.id));
  const itens: { ficha_id: string; quantidade: number | null; recebido: boolean }[] = [];
  const tokens: { ficha_id: string; expira_em: string; usado: boolean; created_at: string }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const lotePendente = lote.filter(id => pendentes.has(id));
    const [{ data: it, error: e1 }, { data: tk }] = await Promise.all([
      supabase.from('fichas_epi_itens').select('ficha_id, quantidade, recebido').in('ficha_id', lote),
      // Os links podem não ser legíveis pelo usuário: sem eles, sai "Sem link".
      lotePendente.length
        ? supabase.from('assinatura_tokens').select('ficha_id, expira_em, usado, created_at').eq('tipo_ficha', 'epi').in('ficha_id', lotePendente)
        : Promise.resolve({ data: [] }),
    ]);
    if (e1) throw new Error(e1.message);
    itens.push(...(it ?? []));
    tokens.push(...(tk ?? []));
  }
  return { fichas, itens, tokens };
}
