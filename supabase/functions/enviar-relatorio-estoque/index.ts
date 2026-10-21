// deno-lint-ignore-file
// Envia por e-mail (Microsoft 365) o relatório de estoque: planilha com o
// estoque completo por estado e tamanho + destaque dos itens sem estoque ou
// abaixo do mínimo (mesma regra da tela Estoque).
//
//  * Manual (botão "Enviar agora" em Configurações > E-mail): Bearer do Clerk;
//    quem chama precisa ver o estoque e só recebe os estados liberados para ele.
//    Corpo: { modo: 'manual', destinatarios: string[], copia?: string[], ufs?: string[] }
//  * Automático (agendador na VM, todo dia às 7h): header x-cron-secret.
//    Corpo: { modo: 'automatico' } — só envia no dia da semana configurado,
//    uma vez por dia, para os destinatários de email_estoque_config.
//  * Reposição (agendador, a cada 15 min; ou botão, com Bearer): { modo: 'reposicao' }
//    — manda o "Pedido de reposição" dos itens que chegaram ao mínimo
//    (fila alertas_estoque, preenchida pelo banco) e marca como enviados.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { dataBrasilia } from '../_shared/convocacaoUniforme.ts';
import { EMAIL } from '../_shared/emailConvocacao.ts';
import { calcularEstoque, estadosDoRelatorio, montarEmailEstoque, montarEmailReposicao } from '../_shared/relatorioEstoque.ts';
const PAGINA = 1000;

async function lerTudo(consulta: (de: number, ate: number) => any): Promise<any[]> {
  const todas: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}

const lista = (v: unknown) => (Array.from(new Set((Array.isArray(v) ? v : []).map(e => String(e).trim().toLowerCase())))
  .filter(e => EMAIL.test(e))) as string[];

/** Monta o relatório dos estados pedidos (vazio = os que têm estoque), limitado aos `permitidos`. */
async function relatorio(admin: any, pedidos: string[], permitidos: string[] | null) {
  const itens = await lerTudo((de, ate) => admin.from('epis')
    .select('id, nome, codigo, ca_numero, tipo, estoque_minimo, ativo').order('id').range(de, ate));
  let tamanhos = await lerTudo((de, ate) => admin.from('epi_tamanhos')
    .select('epi_id, uf, tamanho, estoque, estoque_minimo').order('id').range(de, ate));
  if (permitidos) tamanhos = tamanhos.filter((t: any) => permitidos.includes(t.uf));
  const minimos = await lerTudo((de, ate) => admin.from('estoque_minimos')
    .select('epi_id, uf, minimo').order('epi_id').order('uf').range(de, ate));
  let ufs = estadosDoRelatorio(pedidos, tamanhos);
  if (permitidos) ufs = ufs.filter(u => permitidos.includes(u));
  return { ufs, m: montarEmailEstoque(calcularEstoque(itens, tamanhos, ufs, minimos), ufs) };
}

/**
 * Pedido de reposição dos alertas pendentes (dos estados `permitidos`, ou todos).
 * Alerta de item que já foi reposto antes do envio é só dado como resolvido.
 */
async function reposicao(admin: any, para: string[], copia: string[], permitidos: string[] | null) {
  let { data: pendentes, error } = await admin.from('alertas_estoque').select('id, epi_id, uf').is('enviado_em', null);
  if (error) throw new Error(error.message);
  if (permitidos) pendentes = (pendentes ?? []).filter((a: any) => permitidos.includes(a.uf));
  if (!pendentes?.length) return { enviado: false, motivo: 'nenhum item chegou ao mínimo', itens: 0 };
  const epiIds = [...new Set(pendentes.map((a: any) => a.epi_id))];
  const ufs = [...new Set(pendentes.map((a: any) => a.uf))] as string[];
  const [{ data: itens }, { data: tamanhos }, { data: minimos }] = await Promise.all([
    admin.from('epis').select('id, nome, codigo, ca_numero, tipo, estoque_minimo, ativo').in('id', epiIds),
    admin.from('epi_tamanhos').select('epi_id, uf, tamanho, estoque, estoque_minimo').in('epi_id', epiIds).in('uf', ufs),
    admin.from('estoque_minimos').select('epi_id, uf, minimo').in('epi_id', epiIds).in('uf', ufs),
  ]);
  const linhas = calcularEstoque(itens ?? [], tamanhos ?? [], ufs, minimos ?? [])
    .filter(l => pendentes.some((a: any) => a.epi_id === l.item.id && a.uf === l.uf) && l.saldo <= l.minimo);
  const ids = pendentes.map((a: any) => a.id);
  if (linhas.length) {
    if (!para.length) return { enviado: false, motivo: 'sem destinatários', itens: linhas.length };
    const m = montarEmailReposicao(linhas);
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html }, caixa);
  }
  await admin.from('alertas_estoque').update({ enviado_em: new Date().toISOString() }).in('id', ids);
  return { enviado: linhas.length > 0, itens: linhas.length, destinatarios: para.length, copia: copia.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret` } });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const admin = serviceClient();
    const corpo = await req.json().catch(() => ({}));

    // ---------- Pedido de reposição pelo agendador ----------
    const segredo = req.headers.get('x-cron-secret');
    if (corpo.modo === 'reposicao' && segredo) {
      const { data: seg } = await admin.from('config_segredos').select('valor').eq('chave', 'cron_secret').maybeSingle();
      if (!seg?.valor || segredo !== seg.valor) return json({ error: 'Não autorizado' }, 401);
      const { data: cfg } = await admin.from('email_estoque_config').select('*').eq('id', 1).maybeSingle();
      if (!cfg?.alerta_reposicao) return json({ enviado: false, motivo: 'pedido de reposição desligado' });
      const para = lista(cfg.destinatarios);
      return json(await reposicao(admin, para, lista(cfg.copia).filter(e => !para.includes(e)), null));
    }

    // ---------- Automático (agendador) ----------
    if (corpo.modo === 'automatico') {
      const { data: seg } = await admin.from('config_segredos').select('valor').eq('chave', 'cron_secret').maybeSingle();
      if (!seg?.valor || req.headers.get('x-cron-secret') !== seg.valor) return json({ error: 'Não autorizado' }, 401);
      const { data: cfg } = await admin.from('email_estoque_config').select('*').eq('id', 1).maybeSingle();
      const hoje = dataBrasilia(new Date());
      const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
      if (!cfg?.automatico) return json({ enviado: false, motivo: 'envio automático desligado' });
      if (cfg.dia_semana !== diaSemana) return json({ enviado: false, motivo: 'não é o dia configurado' });
      if (cfg.ultimo_envio_automatico === hoje) return json({ enviado: false, motivo: 'já enviado hoje' });
      const para = lista(cfg.destinatarios);
      const copia = lista(cfg.copia).filter(e => !para.includes(e));
      if (!para.length) return json({ enviado: false, motivo: 'sem destinatários' });
      const { m } = await relatorio(admin, cfg.ufs ?? [], null);
      const { accessToken, caixa } = await acessoParaEnviar(admin);
      await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
      await admin.from('email_estoque_config').update({ ultimo_envio_automatico: hoje }).eq('id', 1);
      return json({ enviado: true, itens: m.itens, alerta: m.alerta, destinatarios: para.length });
    }

    // ---------- Manual (botão "Enviar agora") ----------
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'estoque', _action: 'view' });
    if (pode !== true) return json({ error: 'Sem permissão para ver o estoque' }, 403);
    const para = lista(corpo.destinatarios);
    const copia = lista(corpo.copia).filter(e => !para.includes(e));
    if (!para.length) return json({ error: 'Informe ao menos um e-mail válido' }, 400);
    if (para.length + copia.length > 30) return json({ error: 'Máximo de 30 e-mails (destinatários + cópia)' }, 400);

    const { data: permitidos } = await admin.from('user_estados').select('uf').eq('user_id', caller.profileId);
    const meus = (permitidos ?? []).map((r: any) => r.uf);
    if (corpo.modo === 'reposicao') return json(await reposicao(admin, para, copia, meus));
    const { ufs, m } = await relatorio(admin, Array.isArray(corpo.ufs) ? corpo.ufs : [], meus);
    if (!ufs.length) return json({ error: 'Nenhum estado com estoque liberado para o seu usuário' }, 403);
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
    return json({ enviado: true, itens: m.itens, alerta: m.alerta, destinatarios: para.length, copia: copia.length });
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
