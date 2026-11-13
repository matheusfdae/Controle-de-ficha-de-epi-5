// deno-lint-ignore-file
// Troca de posto na Senior (serviço historicos / Posto_4).
//  * { acao: 'padrao', estrutura, posto }: cargo, local e centro de custo que a
//    Senior aplica com o posto (R017CAR). Quem pede troca (troca_posto create).
//  * { acao: 'enviar', id }: grava a troca APROVADA na Senior. Só administrador.
//  * { acao: 'desfazer', id }: apaga da Senior a troca enviada (com o local,
//    cargo e centro de custo lançados junto). Só administrador.
//  * { acao: 'conferir', id }: relê o colaborador na Senior (R034FUN) e
//    confirma se a troca gravou/desfez. Só administrador.
// As Edge Functions da VM são cortadas em 60 s e a Senior às vezes demora mais
// de um minuto: cada ação faz UMA chamada à Senior (até LIMITE_SENIOR_MS). Se a
// Senior não responde a tempo, a troca fica "enviando" e a tela confere depois.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior } from '../_shared/seniorConfig.ts';
import { SeniorError } from '../_shared/senior.ts';
import {
  chamarPosto4, ehDemo, erroEstrutura, lerSituacao, padraoDoPosto, parametrosDesfazer, parametrosEnvio, semResposta,
} from '../_shared/trocaPostoSenior.ts';

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

    if (!['enviar', 'desfazer', 'conferir'].includes(acao)) return json({ error: 'Ação inválida' }, 400);
    if (!caller.isAdmin) return json({ error: 'Só administrador pode enviar à Senior' }, 403);
    const { data: t, error } = await admin.from('trocas_posto').select('*').eq('id', id).maybeSingle();
    if (error || !t) return json({ error: 'Solicitação não encontrada' }, 404);
    if (ehDemo(t)) return json({ error: 'Troca fictícia (TP-DEMO): não vai para a Senior.' }, 409);

    const { data: perfil } = await admin.from('profiles').select('nome_completo, email').eq('id', caller.profileId).maybeSingle();
    const quem = perfil?.nome_completo || perfil?.email || 'administrador';
    const registrar = async (a: string, erro: string | null, lido: unknown) => {
      const { data, error: e } = await admin.rpc('troca_posto_registrar_senior', { _id: t.id, _acao: a, _erro: erro, _lido: lido, _quem: quem });
      if (e) throw new Error(`Não deu para registrar aqui: ${e.message}`);
      return data;
    };

    if (acao === 'conferir') {
      try {
        const lido = await lerSituacao(cfg, t.num_emp, t.num_cad, t.tip_col);
        return json({ ok: true, lido, troca: await registrar('conferir', null, lido ?? { erro_leitura: 'Colaborador não encontrado na Senior' }) });
      } catch (e) {
        if (semResposta(e)) return json({ error: 'A Senior está demorando para responder. Tente conferir de novo em alguns minutos.' }, 504);
        throw e;
      }
    }

    if (acao === 'enviar') {
      if (erroEstrutura(t)) return json({ error: erroEstrutura(t) }, 409);
      const { error: e1 } = await admin.rpc('troca_posto_marcar_enviando', { _id: t.id });
      if (e1) return json({ error: e1.message }, 409);
    } else if (t.status !== 'enviada') {
      return json({ error: 'Só dá para desfazer troca já gravada na Senior' }, 409);
    }

    let erro: string | null;
    try {
      erro = await chamarPosto4(cfg, acao === 'enviar' ? parametrosEnvio(t) : parametrosDesfazer(t));
    } catch {
      // Sem resposta (tempo esgotado ou conexão caiu): não dá para saber se a
      // Senior gravou. Fica marcado e a tela confere.
      const troca = await registrar(acao === 'enviar' ? 'demorou' : 'desfazer_demorou', null, null);
      return json({ ok: false, pendente: true, erro: null, troca });
    }
    return json({ ok: !erro, erro, troca: await registrar(acao, erro, null) });
  } catch (e) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
