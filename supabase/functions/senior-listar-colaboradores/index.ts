// deno-lint-ignore-file
// Busca na Senior os dados de uma etapa da atualização (módulo Colaboradores
// Senior). Só lê da Senior; quem grava no banco é o navegador, pelas funções
// do banco que conferem a permissão do usuário.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior } from '../_shared/seniorConfig.ts';
import { buscarEtapa, SeniorError, type PedidoEtapa } from '../_shared/senior.ts';


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await serviceClient().rpc('has_permission', {
      _user_id: caller.profileId, _module: 'colaboradores', _action: 'edit',
    });
    if (pode !== true) return json({ error: 'Sem permissão para atualizar os colaboradores da Senior' }, 403);

    const { cfg } = await carregarSenior(serviceClient());
    if (!cfg) return json({ error: 'Integração Senior não configurada no servidor' }, 503);

    const pedido = (await req.json().catch(() => ({}))) as PedidoEtapa;
    if (!['colaboradores', 'postos', 'descricoes'].includes(pedido?.etapa)) return json({ error: 'Etapa inválida' }, 400);
    return json(await buscarEtapa(cfg, pedido));
  } catch (e: any) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    if (e?.name === 'TimeoutError') return json({ error: 'Senior não respondeu a tempo' }, 504);
    if (e instanceof TypeError) return json({ error: `Não foi possível conectar à Senior: ${e.message}` }, 502);
    return json({ error: e.message || String(e) }, 500);
  }
});
