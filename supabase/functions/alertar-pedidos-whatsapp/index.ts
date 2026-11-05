// deno-lint-ignore-file
// Alerta de pedido de material por WhatsApp, via WA-AKG (instalado na VM).
// Cada posto tem um dia do mês previsto para pedir (postos.pedido_dia). 2 dias
// antes e no dia, quem fez pedido daquele posto pelo link nos últimos 90 dias
// recebe o lembrete com o link. Não manda se o posto já pediu perto da data, nem
// duas vezes para o mesmo número (pedido_alertas_whatsapp).
//
//  * Agendador da VM (todo dia às 8h de Brasília): header x-cron-secret,
//    corpo { modo: 'automatico' }.
//  * Tela Configurações de Pedidos > Avisos: Bearer de quem edita o módulo,
//    { modo: 'simular' } (só mostra quem receberia hoje) ou { modo: 'agora' }.
//  * Tela Itens por posto: { modo: 'posto', posto_id } manda o lembrete na hora
//    para quem pediu por aquele posto pelo link (sem olhar a data; não registra
//    em pedido_alertas_whatsapp, então não impede o alerta automático).
//
// Endereço, sessão e chave do WA-AKG ficam em config_segredos (waakg_*),
// gravados pelo deploy/producao/configurar-whatsapp.sh.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { agendarEnvios, ErroWhatsApp, novoLote, type ContaWhatsApp, type EnvioWhatsApp } from '../_shared/whatsapp.ts';
import { DIAS_CONTATOS, JANELA_JA_PEDIU, alertaDeHoje, contatosDoPosto, jaPediu, mensagemAlerta, proximaPrevista, type Momento } from '../_shared/alertaPedido.ts';

const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const menosDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

async function conta(admin: any): Promise<ContaWhatsApp> {
  const { data, error } = await admin.from('config_segredos').select('chave, valor')
    .in('chave', ['waakg_url', 'waakg_sessao', 'waakg_api_key']);
  if (error) throw new Error(error.message);
  const s = Object.fromEntries((data ?? []).map((r: any) => [r.chave, r.valor]));
  if (!s.waakg_url || !s.waakg_sessao || !s.waakg_api_key) {
    throw new ErroWhatsApp('WhatsApp ainda não configurado no servidor (rode deploy/producao/configurar-whatsapp.sh na VM)');
  }
  return { url: s.waakg_url, sessao: s.waakg_sessao, apiKey: s.waakg_api_key };
}

interface Alerta { posto_id: string; posto: string; data: string; momento: Momento; envios: (EnvioWhatsApp & { numero: string })[] }

async function alertar(admin: any, modo: 'automatico' | 'agora' | 'simular') {
  const { data: cfg } = await admin.from('pedido_config').select('alerta_whatsapp, link_sistema').eq('id', 1).maybeSingle();
  if (modo !== 'simular' && cfg && cfg.alerta_whatsapp === false) return { enviado: false, motivo: 'alerta por WhatsApp desligado' };

  const hoje = hojeBr();
  const { data: postos, error: ePostos } = await admin.from('postos').select('id, nome, pedido_dia').eq('ativo', true).not('pedido_dia', 'is', null);
  if (ePostos) throw new Error(ePostos.message);
  const doDia = (postos ?? []).map((p: any) => ({ p, a: alertaDeHoje(p.pedido_dia, hoje) })).filter((x: any) => x.a);
  if (!doDia.length) return { enviado: false, motivo: 'nenhum posto com pedido previsto para hoje ou daqui a 2 dias', hoje };

  const ids = doDia.map((x: any) => x.p.id);
  const desde = menosDias(hoje, Math.max(DIAS_CONTATOS, 31 + JANELA_JA_PEDIU));
  const [{ data: pedidos, error: ePed }, { data: jaEnviados, error: eEnv }] = await Promise.all([
    admin.from('pedidos_material').select('posto_id, solicitante_nome, solicitante_telefone, data_pedido, status')
      .in('posto_id', ids).gte('data_pedido', desde).limit(10000),
    admin.from('pedido_alertas_whatsapp').select('posto_id, data_prevista, momento, numero').in('posto_id', ids).gte('data_prevista', hoje),
  ]);
  if (ePed) throw new Error(ePed.message);
  if (eEnv) throw new Error(eEnv.message);

  const alertas: Alerta[] = [];
  const pulados: { posto: string; motivo: string }[] = [];
  for (const { p, a } of doDia as any[]) {
    const doPosto = (pedidos ?? []).filter((x: any) => x.posto_id === p.id);
    if (jaPediu(doPosto, a.data, hoje)) { pulados.push({ posto: p.nome, motivo: 'já fez o pedido deste mês' }); continue; }
    const contatos = contatosDoPosto(doPosto, hoje).filter(c => !(jaEnviados ?? []).some((e: any) =>
      e.posto_id === p.id && e.data_prevista === a.data && e.momento === a.momento && e.numero === c.numero));
    if (!contatos.length) {
      pulados.push({ posto: p.nome, motivo: doPosto.some((x: any) => x.solicitante_telefone) ? 'alerta de hoje já enviado' : 'ninguém pediu por este posto nos últimos 90 dias' });
      continue;
    }
    alertas.push({
      posto_id: p.id, posto: p.nome, data: a.data, momento: a.momento,
      envios: contatos.map(c => ({ nome: c.nome || p.nome, numero: c.numero, texto: mensagemAlerta({ nome: c.nome, posto: p.nome, data: a.data, momento: a.momento, link: cfg?.link_sistema ?? null }) })),
    });
  }

  const resumo = alertas.map(a => ({ posto: a.posto, data: a.data, momento: a.momento, pessoas: a.envios.map(e => `${e.nome} (${e.numero})`) }));
  if (modo === 'simular' || !alertas.length) return { enviado: false, simulacao: modo === 'simular', hoje, alertas: resumo, pulados };

  const envios = alertas.flatMap(a => a.envios);
  const r = await agendarEnvios(await conta(admin), envios, 60, novoLote(new Date(), 'alerta-pedido'));
  const sem = new Set(r.semWhatsApp);
  const linhas = alertas.flatMap(a => a.envios.filter(e => !sem.has(e.nome)).map(e => ({
    posto_id: a.posto_id, data_prevista: a.data, momento: a.momento, numero: e.numero, nome: e.nome, lote: r.lote,
  })));
  if (linhas.length) {
    const { error } = await admin.from('pedido_alertas_whatsapp').upsert(linhas, { onConflict: 'posto_id,data_prevista,momento,numero', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return { enviado: r.agendados > 0, hoje, lote: r.lote, agendados: r.agendados, sem_whatsapp: r.semWhatsApp, termina: r.termina, alertas: resumo, pulados };
}

/** Botão da tela: o lembrete deste posto agora, para quem pediu por ele pelo link. */
async function alertarPosto(admin: any, postoId: string) {
  const { data: posto, error } = await admin.from('postos').select('id, nome, pedido_dia').eq('id', postoId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!posto) return { enviado: false, motivo: 'posto não encontrado' };
  const { data: cfg } = await admin.from('pedido_config').select('link_sistema').eq('id', 1).maybeSingle();
  const hoje = hojeBr();
  const { data: pedidos, error: ePed } = await admin.from('pedidos_material').select('solicitante_nome, solicitante_telefone, data_pedido')
    .eq('posto_id', postoId).gte('data_pedido', menosDias(hoje, DIAS_CONTATOS)).limit(5000);
  if (ePed) throw new Error(ePed.message);
  const contatos = contatosDoPosto(pedidos ?? [], hoje);
  if (!contatos.length) return { enviado: false, motivo: `ninguém pediu por este posto pelo link nos últimos ${DIAS_CONTATOS} dias` };
  const data = posto.pedido_dia ? proximaPrevista(posto.pedido_dia, hoje) : null;
  const envios = contatos.map(c => ({ nome: c.nome || posto.nome, numero: c.numero,
    texto: mensagemAlerta({ nome: c.nome, posto: posto.nome, data, momento: data === hoje ? 'dia' : 'manual', link: cfg?.link_sistema ?? null }) }));
  const r = await agendarEnvios(await conta(admin), envios, 60, novoLote(new Date(), 'alerta-pedido'));
  return { enviado: r.agendados > 0, lote: r.lote, agendados: r.agendados, sem_whatsapp: r.semWhatsApp, termina: r.termina,
    alertas: [{ posto: posto.nome, data: data ?? hoje, momento: 'manual', pessoas: envios.filter(e => !r.semWhatsApp.includes(e.nome)).map(e => `${e.nome} (${e.numero})`) }] };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret` } });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const admin = serviceClient();
    const corpo = await req.json().catch(() => ({}));
    const segredo = req.headers.get('x-cron-secret');
    if (segredo) {
      const { data: seg } = await admin.from('config_segredos').select('valor').eq('chave', 'cron_secret').maybeSingle();
      if (!seg?.valor || segredo !== seg.valor) return json({ error: 'Não autorizado' }, 401);
      return json(await alertar(admin, 'automatico'));
    }
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'pedidos_material', _action: 'edit' });
    if (pode !== true) return json({ error: 'Sem permissão para configurar os pedidos' }, 403);
    if (corpo.modo === 'posto') {
      if (!/^[0-9a-f-]{36}$/.test(String(corpo.posto_id ?? ''))) return json({ error: 'Informe o posto' }, 400);
      return json(await alertarPosto(admin, String(corpo.posto_id)));
    }
    return json(await alertar(admin, corpo.modo === 'agora' ? 'agora' : 'simular'));
  } catch (e) {
    if (e instanceof ErroWhatsApp) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
