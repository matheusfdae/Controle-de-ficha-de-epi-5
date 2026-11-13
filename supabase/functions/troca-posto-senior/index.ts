// deno-lint-ignore-file
// Troca de posto na Senior (serviço historicos / Posto_4).
//  * { acao: 'padrao', estrutura, posto }: cargo, local e centro de custo que a
//    Senior aplica com o posto (R017CAR). Quem pede troca (troca_posto create).
//  * { acao: 'enviar', id }: grava a troca APROVADA na Senior. Só administrador.
//  * { acao: 'desfazer', id }: apaga da Senior a troca enviada (com o local,
//    cargo e centro de custo lançados junto). Só administrador.
// Depois de enviar/desfazer relê o colaborador na Senior (R034FUN) e registra
// tudo em trocas_posto (troca_posto_registrar_senior).
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior } from '../_shared/seniorConfig.ts';
import { SeniorError } from '../_shared/senior.ts';
import { chamarPosto4, ehDemo, erroEstrutura, lerSituacao, padraoDoPosto, parametrosDesfazer, parametrosEnvio } from '../_shared/trocaPostoSenior.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const admin = serviceClient();
    const { acao, id, estrutura, posto } = await req.json();
    const { cfg } = await carregarSenior(admin);
    if (!cfg) return json({ error: 'Integração Senior não configurada no servidor' }, 503);

    if (acao === 'padrao') {
      const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'troca_posto', _action: 'create' });
      if (pode !== true) return json({ error: 'Sem permissão' }, 403);
      if (!Number.isInteger(Number(estrutura)) || !posto) return json({ error: 'Informe o posto' }, 400);
      return json({ padrao: await padraoDoPosto(cfg, Number(estrutura), String(posto)) });
    }

    if (acao !== 'enviar' && acao !== 'desfazer') return json({ error: 'Ação inválida' }, 400);
    if (!caller.isAdmin) return json({ error: 'Só administrador pode enviar à Senior' }, 403);
    const { data: t, error } = await admin.from('trocas_posto').select('*').eq('id', id).maybeSingle();
    if (error || !t) return json({ error: 'Solicitação não encontrada' }, 404);
    if (ehDemo(t)) return json({ error: 'Troca fictícia (TP-DEMO): não vai para a Senior.' }, 409);
    if (acao === 'enviar' && erroEstrutura(t)) return json({ error: erroEstrutura(t) }, 409);
    if (acao === 'enviar' && !['aprovada', 'erro_envio'].includes(t.status)) return json({ error: `A troca está ${t.status}` }, 409);
    if (acao === 'desfazer' && t.status !== 'enviada') return json({ error: 'Só dá para desfazer troca já gravada na Senior' }, 409);

    const erro = await chamarPosto4(cfg, acao === 'enviar' ? parametrosEnvio(t) : parametrosDesfazer(t));
    const lido = await lerSituacao(cfg, t.num_emp, t.num_cad, t.tip_col).catch((e) => ({ erro_leitura: String(e?.message ?? e) }));
    const { data: perfil } = await admin.from('profiles').select('nome_completo, email').eq('id', caller.profileId).maybeSingle();
    const { data: troca, error: e2 } = await admin.rpc('troca_posto_registrar_senior', {
      _id: t.id, _acao: acao, _erro: erro, _lido: lido, _quem: perfil?.nome_completo || perfil?.email || 'administrador',
    });
    if (e2) return json({ error: `A Senior ${erro ? 'recusou' : 'gravou'}, mas não deu para registrar aqui: ${e2.message}` }, 500);
    return json({ ok: !erro, erro, lido, troca });
  } catch (e) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
