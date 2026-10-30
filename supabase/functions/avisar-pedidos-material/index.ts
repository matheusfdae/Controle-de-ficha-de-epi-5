// Avisa por e-mail os aprovadores dos pedidos de material que chegaram ao
// nível deles. Cada pedido é avisado uma vez por nível (coluna
// pedidos_material.notificado_nivel); um e-mail por pessoa com todos os
// pedidos dela. Antes, gera os pedidos recorrentes que venceram.
//
//  * Agendador da VM (a cada 5 min): header x-cron-secret, corpo { modo: 'automatico' }.
//  * Botão "Avisar agora" (Configurações de Pedidos): Bearer de quem edita o módulo.

import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { agruparAvisos, montarEmailAviso, type PedidoAviso } from '../_shared/avisoPedidos.ts';

async function avisar(admin: any) {
  const { data: cfg } = await admin.from('pedido_config').select('avisar_email, link_sistema').eq('id', 1).maybeSingle();
  if (cfg && !cfg.avisar_email) return { enviado: false, motivo: 'avisos por e-mail desligados' };

  await admin.rpc('gerar_pedidos_recorrentes');

  const { data: brutos, error } = await admin.from('pedidos_material')
    .select('id, numero, posto_id, uf, nivel_atual, notificado_nivel, data_pedido, solicitante_nome, valor_estimado, acima_do_teto, sem_preco, recorrencia_id')
    .eq('status', 'em_aprovacao').not('nivel_atual', 'is', null).order('numero').limit(1000);
  if (error) throw new Error(error.message);
  const novos = (brutos ?? []).filter((p: any) => p.notificado_nivel !== p.nivel_atual);
  if (!novos.length) return { enviado: false, motivo: 'nenhum pedido novo para avisar' };

  const ids = novos.map((p: any) => p.id);
  const [{ data: postos }, { data: itens }, { data: aprovadores }] = await Promise.all([
    admin.from('postos').select('id, nome').in('id', [...new Set(novos.map((p: any) => p.posto_id))]),
    admin.from('pedidos_material_itens').select('pedido_id, quantidade, materiais(nome, unidade)').in('pedido_id', ids),
    admin.from('pedido_aprovadores').select('user_id, nivel, uf, postos'),
  ]);
  const userIds = [...new Set((aprovadores ?? []).map((a: any) => a.user_id))];
  const { data: perfis } = userIds.length
    ? await admin.from('profiles').select('id, nome_completo, email, ativo').in('id', userIds)
    : { data: [] };

  const qtd = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pedidos: PedidoAviso[] = novos.map((p: any) => ({
    id: p.id, numero: Number(p.numero), posto_id: p.posto_id, uf: p.uf, nivel_atual: p.nivel_atual,
    posto: (postos ?? []).find((x: any) => x.id === p.posto_id)?.nome ?? '—',
    data_pedido: p.data_pedido, solicitante_nome: p.solicitante_nome, valor_estimado: Number(p.valor_estimado),
    acima_do_teto: p.acima_do_teto, sem_preco: p.sem_preco, recorrente: !!p.recorrencia_id,
    itens: (itens ?? []).filter((i: any) => i.pedido_id === p.id)
      .map((i: any) => `${qtd(i.quantidade)} ${i.materiais?.unidade ?? ''} ${i.materiais?.nome ?? ''}`.replace(/\s+/g, ' ').trim()).join('; '),
  }));
  const usuarios = (perfis ?? []).filter((u: any) => u.ativo !== false)
    .map((u: any) => ({ id: u.id, nome: u.nome_completo || u.email || '', email: u.email }));

  const { avisos, semAprovador } = agruparAvisos(pedidos, aprovadores ?? [], usuarios);
  const enviados: string[] = [];
  const falhas: string[] = [];
  if (avisos.length) {
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    for (const a of avisos) {
      const m = montarEmailAviso(a.nome, a.pedidos, cfg?.link_sistema ?? null);
      try {
        await enviarComo(accessToken, { para: [a.email], copia: [], assunto: m.assunto, html: m.html }, caixa);
        enviados.push(...a.pedidos.map(p => p.id));
      } catch (e) {
        falhas.push(`${a.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  // Marca o nível avisado de cada pedido que chegou a pelo menos uma pessoa.
  for (const p of pedidos.filter(x => enviados.includes(x.id))) {
    await admin.from('pedidos_material').update({ notificado_nivel: p.nivel_atual })
      .eq('id', p.id).eq('nivel_atual', p.nivel_atual);
  }
  return {
    enviado: enviados.length > 0, emails: avisos.length - falhas.length, pedidos: new Set(enviados).size,
    sem_aprovador: semAprovador.map(p => p.numero), falhas,
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
