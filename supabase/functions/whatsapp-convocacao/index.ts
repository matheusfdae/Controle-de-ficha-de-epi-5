// deno-lint-ignore-file
// Convocação de troca de uniforme pelo WhatsApp, via WA-AKG (instalado na VM).
// Botões da tela Vencimentos > Uniformes; quem chama precisa ver fichas de uniforme.
//
//  * { acao: 'enviar', envios: [{ nome, numero, texto }] } — as mensagens montadas
//    na tela (texto editado, lista escolhida); agenda uma por pessoa, espaçadas.
//  * { acao: 'lotes' } — resumo dos últimos envios; { acao: 'lotes', lote } — as
//    mensagens de um envio com a situação (agendada/enviada/entregue/lida/falhou).
//  * { acao: 'cancelar', lote } — cancela as mensagens do envio que ainda não saíram.
//
// Endereço, sessão e chave do WA-AKG ficam em config_segredos (waakg_*), gravados
// pelo deploy/producao/configurar-whatsapp.sh.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import {
  agendarEnvios, cancelarLote, ErroWhatsApp, lerLote, listarLotes, validarEnvios, type ContaWhatsApp,
} from '../_shared/whatsapp.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const admin = serviceClient();
    const { data: pode } = await admin.rpc('has_permission', {
      _user_id: caller.profileId, _module: 'fichas_uniforme', _action: 'view',
    });
    if (!pode) return json({ error: 'Sem permissão para ver fichas de uniforme' }, 403);

    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'enviar') {
      const envios = validarEnvios(corpo.envios);
      return json(await agendarEnvios(await conta(admin), envios));
    }
    if (corpo.acao === 'lotes') {
      const c = await conta(admin);
      return json(corpo.lote ? await lerLote(c, String(corpo.lote)) : await listarLotes(c));
    }
    if (corpo.acao === 'cancelar') {
      if (!corpo.lote) return json({ error: 'Informe o envio' }, 400);
      return json(await cancelarLote(await conta(admin), String(corpo.lote)));
    }
    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    if (e instanceof ErroWhatsApp) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
