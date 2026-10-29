// deno-lint-ignore-file
// Envia por e-mail (Microsoft 365) o relatório de fichas pendentes de assinatura
// de UM estado: planilha com todas as pendentes + resumo no corpo do e-mail.
// A configuração é por estado (email_pendentes_estados).
//
//  * Manual (botão "Enviar agora" em Configurações > E-mail): Bearer do Clerk;
//    quem chama precisa ver as fichas e ter o estado liberado.
//    Corpo: { modo: 'manual', uf: string, destinatarios: string[], copia?: string[] }
//  * Automático (agendador na VM, todo dia às 7h): header x-cron-secret.
//    Corpo: { modo: 'automatico' } — envia o de cada estado com o envio ligado
//    cujo dia da semana é hoje, uma vez por dia, para os destinatários do estado.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { dataBrasilia } from '../_shared/convocacaoUniforme.ts';
import { EMAIL } from '../_shared/emailConvocacao.ts';
import { calcularPendentes, montarEmailPendentes } from '../_shared/relatorioPendentes.ts';
const PAGINA = 1000;
// Ids por consulta .in(): mantém a URL curta.
const LOTE_IDS = 100;

async function lerTudo(consulta: (de: number, ate: number) => any): Promise<any[]> {
  const todas: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}

/** Lê `tabela` filtrando ficha_id pelos ids, em lotes. */
async function porFicha(admin: any, tabela: string, colunas: string, ids: string[], extra = (q: any) => q): Promise<any[]> {
  const todas: any[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    todas.push(...await lerTudo((de, ate) => extra(admin.from(tabela).select(colunas).in('ficha_id', lote)).order('id').range(de, ate)));
  }
  return todas;
}

const lista = (v: unknown) => (Array.from(new Set((Array.isArray(v) ? v : []).map(e => String(e).trim().toLowerCase())))
  .filter(e => EMAIL.test(e))) as string[];

/** Monta o relatório das fichas pendentes do estado `uf`. */
async function relatorio(admin: any, uf: string) {
  const fichas = await lerTudo((de, ate) => admin.from('fichas_epi')
    .select('id, numero, nome_funcionario, matricula_snapshot, funcao, posto_snapshot, uf, empresa, motivo, created_at')
    .neq('status', 'assinada').eq('uf', uf).order('id').range(de, ate));
  const ids = fichas.map((f: any) => f.id);
  const [itens, tokens] = await Promise.all([
    porFicha(admin, 'fichas_epi_itens', 'ficha_id', ids),
    porFicha(admin, 'assinatura_tokens', 'ficha_id, expira_em, usado, created_at', ids, q => q.eq('tipo_ficha', 'epi')),
  ]);
  return montarEmailPendentes(calcularPendentes(fichas, itens, tokens, [uf]), [uf]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret` } });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const admin = serviceClient();
    const corpo = await req.json().catch(() => ({}));

    // ---------- Automático (agendador) ----------
    if (corpo.modo === 'automatico') {
      const { data: seg } = await admin.from('config_segredos').select('valor').eq('chave', 'cron_secret').maybeSingle();
      if (!seg?.valor || req.headers.get('x-cron-secret') !== seg.valor) return json({ error: 'Não autorizado' }, 401);
      const hoje = dataBrasilia(new Date());
      const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
      const { data: cfgs, error } = await admin.from('email_pendentes_estados').select('*').eq('automatico', true).order('uf');
      if (error) throw new Error(error.message);
      if (!cfgs?.length) return json({ enviado: false, motivo: 'envio automático desligado em todos os estados' });
      const estados: Record<string, unknown>[] = [];
      let acesso: { accessToken: string; caixa: string | null } | null = null;
      // Um estado com problema não impede o envio dos outros.
      for (const cfg of cfgs) {
        if (cfg.dia_semana !== diaSemana) { estados.push({ uf: cfg.uf, enviado: false, motivo: 'não é o dia configurado' }); continue; }
        if (cfg.ultimo_envio_automatico === hoje) { estados.push({ uf: cfg.uf, enviado: false, motivo: 'já enviado hoje' }); continue; }
        const para = lista(cfg.destinatarios);
        const copia = lista(cfg.copia).filter(e => !para.includes(e));
        if (!para.length) { estados.push({ uf: cfg.uf, enviado: false, motivo: 'sem destinatários' }); continue; }
        try {
          const m = await relatorio(admin, cfg.uf);
          acesso ??= await acessoParaEnviar(admin);
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, acesso.caixa);
          await admin.from('email_pendentes_estados').update({ ultimo_envio_automatico: hoje }).eq('uf', cfg.uf);
          estados.push({ uf: cfg.uf, enviado: true, fichas: m.fichas, antigas: m.antigas, sem_itens: m.semItens, destinatarios: para.length });
        } catch (e) {
          estados.push({ uf: cfg.uf, enviado: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({ enviado: estados.some(e => e.enviado), estados });
    }

    // ---------- Manual (botão "Enviar agora") ----------
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'fichas_epi', _action: 'view' });
    if (pode !== true) return json({ error: 'Sem permissão para ver as fichas' }, 403);
    const para = lista(corpo.destinatarios);
    const copia = lista(corpo.copia).filter(e => !para.includes(e));
    if (!para.length) return json({ error: 'Informe ao menos um e-mail válido' }, 400);
    if (para.length + copia.length > 30) return json({ error: 'Máximo de 30 e-mails (destinatários + cópia)' }, 400);

    const uf = String(corpo.uf ?? '');
    const { data: liberado } = await admin.from('user_estados').select('uf').eq('user_id', caller.profileId).eq('uf', uf).maybeSingle();
    if (!liberado) return json({ error: `O estado ${uf || '(nenhum)'} não está liberado para o seu usuário` }, 403);
    const m = await relatorio(admin, uf);
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
    return json({ enviado: true, fichas: m.fichas, antigas: m.antigas, sem_itens: m.semItens, destinatarios: para.length, copia: copia.length });
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
