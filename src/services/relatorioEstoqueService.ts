import { supabase } from '@/integrations/supabase/client';

/** Configurações > E-mail: destinatários e envio automático do relatório de estoque. */
export interface EmailEstoqueConfig {
  destinatarios: string[];
  copia: string[];
  automatico: boolean;
  dia_semana: number;
  ufs: string[];
  ultimo_envio_automatico: string | null;
  /** Pedido de reposição automático quando um item chega ao estoque mínimo. */
  alerta_reposicao: boolean;
}

const tabela = () => supabase.from('email_estoque_config');

export async function lerConfigEstoque(): Promise<EmailEstoqueConfig | null> {
  const { data, error } = await tabela().select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as EmailEstoqueConfig | null;
}

export async function salvarConfigEstoque(c: Omit<EmailEstoqueConfig, 'ultimo_envio_automatico'>): Promise<void> {
  const { error } = await tabela().update(c).eq('id', 1);
  if (error) throw error;
}

export interface ResultadoEnvioEstoque { enviado: boolean; itens: number; alerta: number; destinatarios: number; copia: number }

/** Envia o relatório agora (Edge Function na produção; o próprio PC no localhost). */
export async function enviarRelatorioEstoque(envio: { destinatarios: string[]; copia: string[]; ufs: string[] }): Promise<ResultadoEnvioEstoque> {
  if (import.meta.env.DEV) {
    // No localhost o servidor de teste não lê o banco: a tela manda o que já pode ler.
    const res = await fetch('/__email/enviar-relatorio-estoque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envio, ...(await dadosDoEstoque()) }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.error || `Falha (${res.status})`);
    return corpo;
  }
  const { data, error } = await supabase.functions.invoke('enviar-relatorio-estoque', { body: { modo: 'manual', ...envio } });
  if (error) {
    let msg = '';
    if ('context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error.message);
  }
  return data as ResultadoEnvioEstoque;
}

/** Itens, saldos e mínimos que o usuário pode ler (usado só no localhost). */
async function dadosDoEstoque() {
  const [{ data: itens, error: e1 }, { data: tamanhos, error: e2 }, { data: minimos, error: e3 }] = await Promise.all([
    supabase.from('epis').select('id, nome, codigo, ca_numero, tipo, estoque_minimo, ativo'),
    supabase.from('epi_tamanhos').select('epi_id, uf, tamanho, estoque, estoque_minimo'),
    supabase.from('estoque_minimos').select('epi_id, uf, minimo'),
  ]);
  if (e1 || e2 || e3) throw new Error((e1 ?? e2 ?? e3)!.message);
  return { itens, tamanhos, minimos };
}

/** Quantos itens chegaram ao mínimo e ainda não tiveram o pedido de reposição enviado. */
export async function contarReposicaoPendente(): Promise<number> {
  const { count, error } = await supabase.from('alertas_estoque').select('id', { count: 'exact', head: true }).is('enviado_em', null);
  if (error) throw error;
  return count ?? 0;
}

export interface ResultadoReposicao { enviado: boolean; itens: number; motivo?: string; destinatarios?: number; copia?: number }

/** Envia agora o pedido de reposição dos itens pendentes (o agendador faz isso a cada 15 min). */
export async function enviarPedidoReposicao(envio: { destinatarios: string[]; copia: string[] }): Promise<ResultadoReposicao> {
  if (import.meta.env.DEV) {
    const { data: alertas, error } = await supabase.from('alertas_estoque').select('id, epi_id, uf').is('enviado_em', null);
    if (error) throw new Error(error.message);
    if (!alertas?.length) return { enviado: false, itens: 0, motivo: 'nenhum item chegou ao mínimo' };
    const res = await fetch('/__email/enviar-reposicao-estoque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...envio, alertas, ...(await dadosDoEstoque()) }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo.error || `Falha (${res.status})`);
    const { error: e2 } = await supabase.rpc('marcar_alertas_estoque_enviados', { _ids: alertas.map(a => a.id) });
    if (e2) throw new Error(e2.message);
    return corpo;
  }
  const { data, error } = await supabase.functions.invoke('enviar-relatorio-estoque', { body: { modo: 'reposicao', ...envio } });
  if (error) {
    let msg = '';
    if ('context' in error) {
      try { msg = (await (error.context as Response).json()).error; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg || error.message);
  }
  return data as ResultadoReposicao;
}
