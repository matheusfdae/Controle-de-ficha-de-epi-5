// Aviso por e-mail dos lançamentos DIVERGENTES do Controle de Movimentação
// Diária (data informada diferente do dia do lançamento). Um e-mail por
// lançamento para movimentacao_config.emails_divergencia; marca email_avisado_em.
// Também manda as PASSAGENS DE PLANTÃO pendentes: um e-mail por passagem com o
// relatório do dia em PDF anexo (montado aqui a partir do banco).
//
//  * Agendador da VM (a cada 5 min): header x-cron-secret, corpo { modo: 'automatico' }.
//  * Botão "Enviar avisos agora" (tela Movimentação Diária): Bearer de quem edita o módulo.

import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { limparEmails, montarEmailDivergencia, type LancamentoAviso } from '../_shared/avisoMovimentacao.ts';
import { desenharRelatorio, nomeArquivoRelatorio } from '../_shared/relatorioMovimentacaoPdf.ts';
import { destinatariosPassagem, montarEmailPassagem } from '../_shared/passagemPlantao.ts';
import { base64 } from '../_shared/xlsx.ts';
import { jsPDF } from 'npm:jspdf@4.2.1';

async function linkSistema(admin: any) {
  const { data: pc } = await admin.from('pedido_config').select('link_sistema').eq('id', 1).maybeSingle();
  return pc?.link_sistema ? `${String(pc.link_sistema).replace(/\/+$/, '')}/movimentacao` : null;
}

/** Passagens de plantão pendentes: e-mail com o PDF do dia. Erro numa não para as outras. */
async function enviarPassagens(admin: any) {
  const { data: ids, error } = await admin.rpc('movimentacao_passagens_pendentes');
  if (error) throw new Error(error.message);
  if (!ids?.length) return { enviadas: [] as string[], erros: [] as string[] };
  const { data: cfg } = await admin.from('movimentacao_config').select('emails_passagem, emails_divergencia').eq('id', 1).maybeSingle();
  const link = await linkSistema(admin);
  const acesso = await acessoParaEnviar(admin);
  const enviadas: string[] = [], erros: string[] = [];
  for (const id of ids as string[]) {
    const { data: r, error: e1 } = await admin.rpc('movimentacao_passagem_dados', { _id: id });
    if (e1 || !r) { erros.push(e1?.message ?? 'passagem não encontrada'); continue; }
    const { para, copia } = destinatariosPassagem(cfg, r.emails_senior ?? []);
    if (!para.length) {
      await admin.rpc('movimentacao_passagem_marcar', { _id: id, _erro: 'nenhum e-mail cadastrado para a passagem de plantão' });
      erros.push(`${r.passagem.codigo}: nenhum e-mail cadastrado`);
      continue;
    }
    try {
      const doc = desenharRelatorio(new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), r, null);
      const pdf = new Uint8Array(doc.output('arraybuffer'));
      const m = montarEmailPassagem(r, link);
      await enviarComo(acesso.accessToken, {
        para, copia, assunto: m.assunto, html: m.html,
        anexos: [{ nome: nomeArquivoRelatorio(r), tipo: 'application/pdf', base64: base64(pdf) }],
      }, acesso.caixa);
      await admin.rpc('movimentacao_passagem_marcar', { _id: id, _erro: null });
      enviadas.push(r.passagem.codigo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.rpc('movimentacao_passagem_marcar', { _id: id, _erro: msg });
      erros.push(`${r.passagem.codigo}: ${msg}`);
    }
  }
  return { enviadas, erros };
}

async function avisarTudo(admin: any) {
  const divergencias = await avisarPendentes(admin);
  const passagens = await enviarPassagens(admin);
  return { ...divergencias, passagens };
}

async function avisarPendentes(admin: any) {
  const { data: pendentes, error } = await admin.from('movimentacoes_diarias').select('*')
    .eq('status', 'divergente').is('email_avisado_em', null).order('created_at').limit(50);
  if (error) throw new Error(error.message);
  if (!pendentes?.length) return { enviado: false, motivo: 'nenhum lançamento divergente pendente' };

  const { data: cfg } = await admin.from('movimentacao_config').select('emails_divergencia').eq('id', 1).maybeSingle();
  const para = limparEmails(cfg?.emails_divergencia);
  if (!para.length) return { enviado: false, motivo: 'nenhum e-mail cadastrado para o aviso', pendentes: pendentes.length };

  const link = await linkSistema(admin);

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
      return json(await avisarTudo(admin));
    }
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'movimentacao', _action: 'edit' });
    if (pode !== true) return json({ error: 'Sem permissão para enviar os avisos' }, 403);
    return json(await avisarTudo(admin));
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
