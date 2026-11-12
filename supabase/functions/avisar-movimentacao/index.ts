// Aviso por e-mail dos lançamentos DIVERGENTES do Controle de Movimentação
// Diária (data informada diferente do dia do lançamento). Um e-mail por
// lançamento para movimentacao_config.emails_divergencia; marca email_avisado_em.
//
//  * Agendador da VM (a cada 5 min): header x-cron-secret, corpo { modo: 'automatico' }.
//  * Botão "Enviar avisos agora" (tela Movimentação Diária): Bearer de quem edita o módulo.

import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { limparEmails, montarEmailDivergencia, type LancamentoAviso } from '../_shared/avisoMovimentacao.ts';

async function avisarPendentes(admin: any) {
  const { data: pendentes, error } = await admin.from('movimentacoes_diarias').select('*')
    .eq('status', 'divergente').is('email_avisado_em', null).order('created_at').limit(50);
  if (error) throw new Error(error.message);
  if (!pendentes?.length) return { enviado: false, motivo: 'nenhum lançamento divergente pendente' };

  const { data: cfg } = await admin.from('movimentacao_config').select('emails_divergencia').eq('id', 1).maybeSingle();
  const para = limparEmails(cfg?.emails_divergencia);
  if (!para.length) return { enviado: false, motivo: 'nenhum e-mail cadastrado para o aviso', pendentes: pendentes.length };

  const { data: pc } = await admin.from('pedido_config').select('link_sistema').eq('id', 1).maybeSingle();
  const link = pc?.link_sistema ? `${String(pc.link_sistema).replace(/\/+$/, '')}/movimentacao` : null;

  const acesso = await acessoParaEnviar(admin);
  const avisados: string[] = [];
  for (const l of pendentes as LancamentoAviso[]) {
    const m = montarEmailDivergencia(l, link);
    await enviarComo(acesso.accessToken, { para, assunto: m.assunto, html: m.html }, acesso.caixa);
    await admin.from('movimentacoes_diarias').update({ email_avisado_em: new Date().toISOString() }).eq('id', l.id);
    avisados.push(l.codigo);
  }
  return { enviado: true, lancamentos: avisados, destinatarios: para.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret` } });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const admin = serviceClient();
    const segredo = req.headers.get('x-cron-secret');
    if (segredo) {
      const { data: seg } = await admin.from('config_segredos').select('valor').eq('chave', 'cron_secret').maybeSingle();
      if (!seg?.valor || segredo !== seg.valor) return json({ error: 'Não autorizado' }, 401);
      return json(await avisarPendentes(admin));
    }
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'movimentacao', _action: 'edit' });
    if (pode !== true) return json({ error: 'Sem permissão para enviar os avisos' }, 403);
    return json(await avisarPendentes(admin));
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
