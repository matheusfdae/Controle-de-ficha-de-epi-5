// Avisos por e-mail dos pedidos de material:
//  * cada pedido que chega a uma etapa avisa quem tem o papel dela (uma vez
//    por etapa: coluna pedidos_material.notificado_status), um e-mail por
//    pessoa com todos os pedidos dela;
//  * pedido com item de EPI avisa na hora os e-mails de pedido_config.emails_epi
//    (uma vez: epi_avisado).
// Antes, gera os pedidos recorrentes que venceram.
//
//  * Agendador da VM (a cada 5 min): header x-cron-secret, corpo { modo: 'automatico' }.
//  * Botão "Avisar agora" (Configurações de Pedidos): Bearer de quem edita o módulo.

import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { RESPONSAVEIS, agruparAvisos, montarEmailAviso, montarEmailEpi, type PedidoAviso } from '../_shared/avisoPedidos.ts';

async function avisar(admin: any) {
  const { data: cfg } = await admin.from('pedido_config').select('avisar_email, link_sistema, emails_epi').eq('id', 1).maybeSingle();
  if (cfg && !cfg.avisar_email) return { enviado: false, motivo: 'avisos por e-mail desligados' };

  await admin.rpc('gerar_pedidos_recorrentes');

  const { data: brutos, error } = await admin.from('pedidos_material')
    .select('id, codigo, posto_id, uf, status, notificado_status, epi_avisado, tem_epi, data_pedido, solicitante_nome, valor_estimado, valor_orcado, valor_real, excede_teto, sem_preco, recorrencia_id')
    .or('status.in.(enviada,em_orcamento,aguardando_aprovacao,a_faturar),and(tem_epi.eq.true,epi_avisado.eq.false)')
    .order('ano').order('numero').limit(1000);
  if (error) throw new Error(error.message);
  const etapa = (brutos ?? []).filter((p: any) => RESPONSAVEIS[p.status] && p.notificado_status !== p.status);
  const epi = (cfg?.emails_epi ?? []).length ? (brutos ?? []).filter((p: any) => p.tem_epi && !p.epi_avisado && p.status !== 'cancelada') : [];
  if (!etapa.length && !epi.length) return { enviado: false, motivo: 'nada novo para avisar' };

  const todos = [...new Map([...etapa, ...epi].map((p: any) => [p.id, p])).values()];
  const ids = todos.map((p: any) => p.id);
  const [{ data: postos }, { data: itens }, { data: aprovadores }] = await Promise.all([
    admin.from('postos').select('id, nome').in('id', [...new Set(todos.map((p: any) => p.posto_id))]),
    admin.from('pedidos_material_itens').select('pedido_id, material_id, quantidade, materiais(nome, unidade, item_pai_id)').in('pedido_id', ids),
    admin.from('pedido_aprovadores').select('user_id, nivel, uf, postos'),
  ]);
  const paiIds = [...new Set((itens ?? []).map((i: any) => i.materiais?.item_pai_id).filter(Boolean))];
  const { data: pais } = paiIds.length ? await admin.from('materiais').select('id, nome').in('id', paiIds) : { data: [] };
  const userIds = [...new Set((aprovadores ?? []).map((a: any) => a.user_id))];
  const { data: perfis } = userIds.length
    ? await admin.from('profiles').select('id, nome_completo, email, ativo').in('id', userIds)
    : { data: [] };

  const qtd = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const nomeItem = (m: any) => {
    const pai = m?.item_pai_id ? (pais ?? []).find((x: any) => x.id === m.item_pai_id)?.nome : null;
    return pai ? `${pai} — ${m?.nome ?? ''}` : m?.nome ?? '';
  };
  const montar = (p: any): PedidoAviso => ({
    id: p.id, codigo: p.codigo, posto_id: p.posto_id, uf: p.uf, status: p.status,
    posto: (postos ?? []).find((x: any) => x.id === p.posto_id)?.nome ?? '—',
    data_pedido: p.data_pedido, solicitante_nome: p.solicitante_nome,
    valor: Number(p.valor_real ?? p.valor_orcado ?? p.valor_estimado),
    excede_teto: p.excede_teto, sem_preco: p.sem_preco, tem_epi: p.tem_epi, recorrente: !!p.recorrencia_id,
    itens: (itens ?? []).filter((i: any) => i.pedido_id === p.id)
      .map((i: any) => `${qtd(i.quantidade)} ${i.materiais?.unidade ?? ''} ${nomeItem(i.materiais)}`.replace(/\s+/g, ' ').trim()).join('; '),
  });
  const usuarios = (perfis ?? []).filter((u: any) => u.ativo !== false)
    .map((u: any) => ({ id: u.id, nome: u.nome_completo || u.email || '', email: u.email }));

  const { avisos, semDestinatario } = agruparAvisos(etapa.map(montar), aprovadores ?? [], usuarios);
  const enviados = new Set<string>();
  const falhas: string[] = [];
  let emails = 0;
  let epiOk = false;
  if (avisos.length || epi.length) {
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    for (const a of avisos) {
      const m = montarEmailAviso(a.nome, a.pedidos, cfg?.link_sistema ?? null);
      try {
        await enviarComo(accessToken, { para: [a.email], copia: [], assunto: m.assunto, html: m.html }, caixa);
        a.pedidos.forEach(p => enviados.add(p.id));
        emails++;
      } catch (e) {
        falhas.push(`${a.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (epi.length) {
      const m = montarEmailEpi(epi.map(montar), cfg?.link_sistema ?? null);
      try {
        await enviarComo(accessToken, { para: cfg.emails_epi, copia: [], assunto: m.assunto, html: m.html }, caixa);
        epiOk = true;
        emails++;
      } catch (e) {
        falhas.push(`EPI: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  // Marca o que chegou a alguém (só se o pedido não mudou de etapa no meio).
  for (const p of etapa.filter((x: any) => enviados.has(x.id))) {
    await admin.from('pedidos_material').update({ notificado_status: p.status }).eq('id', p.id).eq('status', p.status);
  }
  if (epiOk) await admin.from('pedidos_material').update({ epi_avisado: true }).in('id', epi.map((p: any) => p.id));

  return {
    enviado: emails > 0, emails, pedidos: enviados.size + (epiOk ? epi.length : 0),
    sem_destinatario: semDestinatario.map(p => p.codigo), falhas,
  };
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
      return json(await avisar(admin));
    }

    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'pedidos_material', _action: 'edit' });
    if (pode !== true) return json({ error: 'Sem permissão para configurar os pedidos' }, 403);
    return json(await avisar(admin));
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
