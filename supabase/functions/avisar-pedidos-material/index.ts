// Avisos por e-mail dos pedidos de material:
//  * cada pedido que chega a uma etapa avisa quem tem o papel dela (uma vez
//    por etapa: coluna pedidos_material.notificado_status), um e-mail por
//    pessoa com todos os pedidos dela;
//  * pedido com item de EPI avisa na hora os e-mails de pedido_config.emails_epi
//    (uma vez: epi_avisado);
//  * posto que passou do teto no mês (soma dos pedidos > postos.teto_material)
//    avisa Comercial e Gerência do estado com os pedidos que fizeram passar
//    (uma vez por pedido: teto_avisado). O pedido segue normal.
// Antes, gera os pedidos recorrentes que venceram.
// Pedido com EPI que Compras atendeu avisa o líder (quem pediu) pelo WhatsApp que
// o Termo de EPI está pronto para as assinaturas (uma vez: termo_whatsapp_avisado).
// Enquanto o termo não finaliza, manda lembrete a cada 2 dias, até 3 vezes, só das
// 8h às 18h (termo_whatsapp_em, termo_whatsapp_lembretes).
// Segue o liga/desliga do alerta por WhatsApp e não depende dos e-mails.
//
//  * Agendador da VM (a cada 5 min): header x-cron-secret, corpo { modo: 'automatico' }.
//  * Botão "Avisar agora" (Configurações de Pedidos): Bearer de quem edita o módulo.

import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { agendarEnvios, contaWhatsApp, novoLote, numeroWhatsApp } from '../_shared/whatsapp.ts';
import { LEMBRETE_MAX, lembreteTermoDevido, mensagemTermoEpi, type SituacaoTermo } from '../_shared/alertaPedido.ts';
import {
  RESPONSAVEIS, agruparAvisos, avisaTeto, montarEmailAviso, montarEmailEpi, montarEmailTeto, passouTeto, type ItemAviso, type PedidoAviso,
} from '../_shared/avisoPedidos.ts';

const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const inicioMesAnterior = (hoje: string) => {
  const [a, m] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
};

async function avisarTermoEpi(admin: any) {
  const { data: cfg } = await admin.from('pedido_config').select('alerta_whatsapp, link_sistema').eq('id', 1).maybeSingle();
  if (cfg && cfg.alerta_whatsapp === false) return { enviado: false, motivo: 'alerta por WhatsApp desligado' };
  const agora = new Date();
  // Novos (nunca avisados) e candidatos a lembrete (avisados por aqui, ainda com lembrete sobrando).
  const { data: brutos, error } = await admin.from('pedidos_material')
    .select('id, codigo, solicitante_nome, solicitante_telefone, termo_whatsapp_avisado, termo_whatsapp_em, termo_whatsapp_lembretes, colaboradores_senior(telefone), postos(nome)')
    .eq('status', 'atendida').eq('tem_epi', true)
    .or(`termo_whatsapp_avisado.eq.false,and(termo_whatsapp_em.not.is.null,termo_whatsapp_lembretes.lt.${LEMBRETE_MAX})`)
    .limit(500);
  if (error) throw new Error(error.message);
  const ids = (brutos ?? []).map((p: any) => p.id);
  const { data: termos, error: eTermos } = ids.length
    ? await admin.from('termos_epi_coletivos').select('pedido_id, status, termos_epi_coletivos_itens(data_assinatura)').in('pedido_id', ids)
    : { data: [], error: null };
  if (eTermos) throw new Error(eTermos.message);
  const situacao = (id: string): SituacaoTermo | null => {
    const t = (termos ?? []).find((x: any) => x.pedido_id === id);
    if (!t) return null;
    const ls = t.termos_epi_coletivos_itens ?? [];
    return { linhas: ls.length, assinadas: ls.filter((l: any) => l.data_assinatura).length, finalizado: t.status === 'finalizado' };
  };
  const pedidos = (brutos ?? []).filter((p: any) => !p.termo_whatsapp_avisado || lembreteTermoDevido({
    ultimoEnvio: p.termo_whatsapp_em, lembretes: p.termo_whatsapp_lembretes ?? 0, termo: situacao(p.id), agora,
  }));
  if (!pedidos.length) return { enviado: false, motivo: 'nenhum termo novo nem lembrete devido' };
  const { data: itens } = await admin.from('pedidos_material_itens')
    .select('pedido_id, quantidade, quantidade_atendida, materiais!inner(nome, unidade, is_epi)')
    .in('pedido_id', pedidos.map((p: any) => p.id)).eq('materiais.is_epi', true);

  const envios: { nome: string; numero: string; texto: string }[] = [];
  const semCelular: string[] = [];
  for (const p of pedidos as any[]) {
    // Celular da Senior primeiro; sem celular lá, o digitado no link do pedido.
    const numero = numeroWhatsApp(p.colaboradores_senior?.telefone) ?? numeroWhatsApp(p.solicitante_telefone);
    if (!numero) { semCelular.push(p.codigo); continue; }
    const epis = (itens ?? []).filter((i: any) => i.pedido_id === p.id)
      .map((i: any) => `${Number(i.quantidade_atendida ?? i.quantidade)} ${i.materiais.unidade} ${i.materiais.nome}`);
    envios.push({ nome: p.solicitante_nome || p.codigo, numero,
      texto: mensagemTermoEpi({ nome: p.solicitante_nome ?? '', codigo: p.codigo, posto: p.postos?.nome ?? '—', epis, link: cfg?.link_sistema ?? null,
        lembrete: p.termo_whatsapp_avisado ? { termo: situacao(p.id) } : null }) });
  }
  const r = envios.length ? await agendarEnvios(await contaWhatsApp(admin), envios, 30, novoLote(agora, 'termo-epi')) : null;
  // Marca todos (sem celular ou sem WhatsApp também: não fica tentando a cada 5 min).
  // Sem celular no primeiro aviso, não entra nos lembretes (termo_whatsapp_em fica vazio).
  const novos = pedidos.filter((p: any) => !p.termo_whatsapp_avisado);
  const comCelular = (p: any) => !semCelular.includes(p.codigo);
  for (const p of pedidos as any[]) {
    await admin.from('pedidos_material').update(p.termo_whatsapp_avisado
      ? { termo_whatsapp_em: agora.toISOString(), termo_whatsapp_lembretes: (p.termo_whatsapp_lembretes ?? 0) + 1 }
      : { termo_whatsapp_avisado: true, termo_whatsapp_em: comCelular(p) ? agora.toISOString() : null }).eq('id', p.id);
  }
  return { enviado: (r?.agendados ?? 0) > 0, agendados: r?.agendados ?? 0, novos: novos.length, lembretes: pedidos.length - novos.length,
    sem_whatsapp: r?.semWhatsApp ?? [], sem_celular: semCelular };
}

/** O aviso do termo não derruba os e-mails (nem o contrário). */
async function avisarTudo(admin: any) {
  let termo: any;
  try { termo = await avisarTermoEpi(admin); } catch (e) { termo = { erro: e instanceof Error ? e.message : String(e) }; }
  const emails = await avisar(admin);
  // "enviado" no topo também conta o WhatsApp (e o erro dele): o agendador só grava no log o que não é "enviado":false.
  return { ...emails, enviado: emails.enviado || !!termo?.enviado || !!termo?.erro, termo_epi_whatsapp: termo };
}

async function avisar(admin: any) {
  const { data: cfg } = await admin.from('pedido_config').select('avisar_email, link_sistema, emails_epi').eq('id', 1).maybeSingle();
  if (cfg && !cfg.avisar_email) return { enviado: false, motivo: 'avisos por e-mail desligados' };

  await admin.rpc('gerar_pedidos_recorrentes');

  const { data: brutos, error } = await admin.from('pedidos_material')
    .select('id, codigo, posto_id, uf, status, notificado_status, epi_avisado, tem_epi, data_pedido, solicitante_nome, recorrencia_id, valor_total')
    .or('status.in.(enviada,a_atender),and(tem_epi.eq.true,epi_avisado.eq.false)')
    .order('ano').order('numero').limit(1000);
  if (error) throw new Error(error.message);
  const etapa = (brutos ?? []).filter((p: any) => RESPONSAVEIS[p.status] && p.notificado_status !== p.status);
  const epi = (cfg?.emails_epi ?? []).length ? (brutos ?? []).filter((p: any) => p.tem_epi && !p.epi_avisado && p.status !== 'cancelada') : [];

  // Teto: pedidos deste mês e do anterior ainda não avisados, de posto com teto.
  const desde = inicioMesAnterior(hojeBr());
  const { data: candTeto, error: eTeto } = await admin.from('pedidos_material')
    .select('id, codigo, posto_id, uf, status, data_pedido, solicitante_nome, recorrencia_id, tem_epi, valor_total, postos!inner(teto_material)')
    .eq('teto_avisado', false).neq('status', 'cancelada').gte('data_pedido', desde)
    .not('postos.teto_material', 'is', null).limit(1000);
  if (eTeto) throw new Error(eTeto.message);
  let teto: any[] = [];
  if ((candTeto ?? []).length) {
    const { data: doMes } = await admin.from('pedidos_material').select('posto_id, data_pedido, valor_total')
      .in('posto_id', [...new Set(candTeto.map((p: any) => p.posto_id))]).neq('status', 'cancelada').gte('data_pedido', desde);
    const gasto = new Map<string, number>();
    for (const x of doMes ?? []) {
      const k = `${x.posto_id}|${String(x.data_pedido).slice(0, 7)}`;
      gasto.set(k, (gasto.get(k) ?? 0) + Number(x.valor_total ?? 0));
    }
    teto = candTeto.map((p: any) => {
      const mes = String(p.data_pedido).slice(0, 7);
      return { ...p, _teto: { teto: Number(p.postos.teto_material), gasto: gasto.get(`${p.posto_id}|${mes}`) ?? 0, mes: `${mes}-01` } };
    }).filter((p: any) => passouTeto(p._teto.teto, p._teto.gasto));
  }
  if (!etapa.length && !epi.length && !teto.length) return { enviado: false, motivo: 'nada novo para avisar' };

  const todos = [...new Map([...etapa, ...epi, ...teto].map((p: any) => [p.id, p])).values()];
  const ids = todos.map((p: any) => p.id);
  const [{ data: postos }, { data: itens }, { data: aprovadores }] = await Promise.all([
    admin.from('postos').select('id, nome').in('id', [...new Set(todos.map((p: any) => p.posto_id))]),
    admin.from('pedidos_material_itens').select('pedido_id, material_id, quantidade, preco_unit, materiais(nome, unidade, item_pai_id, is_epi)').in('pedido_id', ids),
    admin.from('pedido_aprovadores').select('user_id, nivel, uf, postos'),
  ]);
  const paiIds = [...new Set((itens ?? []).map((i: any) => i.materiais?.item_pai_id).filter(Boolean))];
  const { data: pais } = paiIds.length ? await admin.from('materiais').select('id, nome').in('id', paiIds) : { data: [] };
  const userIds = [...new Set((aprovadores ?? []).map((a: any) => a.user_id))];
  const { data: perfis } = userIds.length
    ? await admin.from('profiles').select('id, nome_completo, email, ativo').in('id', userIds)
    : { data: [] };

  const nomeItem = (m: any) => {
    const pai = m?.item_pai_id ? (pais ?? []).find((x: any) => x.id === m.item_pai_id)?.nome : null;
    return pai ? `${pai} — ${m?.nome ?? ''}` : m?.nome ?? '';
  };
  const montar = (p: any): PedidoAviso => ({
    id: p.id, codigo: p.codigo, posto_id: p.posto_id, uf: p.uf, status: p.status,
    posto: (postos ?? []).find((x: any) => x.id === p.posto_id)?.nome ?? '—',
    data_pedido: p.data_pedido, solicitante_nome: p.solicitante_nome,
    tem_epi: p.tem_epi, recorrente: !!p.recorrencia_id, valor_total: Number(p.valor_total ?? 0), teto: p._teto,
    itens: (itens ?? []).filter((i: any) => i.pedido_id === p.id)
      .map((i: any) => ({
        nome: nomeItem(i.materiais), quantidade: Number(i.quantidade), unidade: i.materiais?.unidade ?? '', epi: !!i.materiais?.is_epi,
        preco: i.preco_unit == null ? null : Number(i.preco_unit),
      }))
      .sort((a: ItemAviso, b: ItemAviso) => a.nome.localeCompare(b.nome)),
  });
  const usuarios = (perfis ?? []).filter((u: any) => u.ativo !== false)
    .map((u: any) => ({ id: u.id, nome: u.nome_completo || u.email || '', email: u.email }));

  const { avisos, semDestinatario } = agruparAvisos(etapa.map(montar), aprovadores ?? [], usuarios);
  const avisosTeto = agruparAvisos(teto.map(montar), aprovadores ?? [], usuarios, avisaTeto);
  const tetoEnviados = new Set<string>();
  const enviados = new Set<string>();
  const falhas: string[] = [];
  let emails = 0;
  let epiOk = false;
  if (avisos.length || epi.length || avisosTeto.avisos.length) {
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
    for (const a of avisosTeto.avisos) {
      const m = montarEmailTeto(a.nome, a.pedidos, cfg?.link_sistema ?? null);
      try {
        await enviarComo(accessToken, { para: [a.email], copia: [], assunto: m.assunto, html: m.html }, caixa);
        a.pedidos.forEach(p => tetoEnviados.add(p.id));
        emails++;
      } catch (e) {
        falhas.push(`Teto ${a.email}: ${e instanceof Error ? e.message : String(e)}`);
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
  if (tetoEnviados.size) await admin.from('pedidos_material').update({ teto_avisado: true }).in('id', [...tetoEnviados]);

  return {
    enviado: emails > 0, emails, pedidos: enviados.size + (epiOk ? epi.length : 0),
    teto: tetoEnviados.size,
    sem_destinatario: [...semDestinatario, ...avisosTeto.semDestinatario.map(p => ({ ...p, codigo: `${p.codigo} (teto)` }))].map(p => p.codigo), falhas,
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
      return json(await avisarTudo(admin));
    }

    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'pedidos_material', _action: 'edit' });
    if (pode !== true) return json({ error: 'Sem permissão para configurar os pedidos' }, 403);
    return json(await avisarTudo(admin));
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
