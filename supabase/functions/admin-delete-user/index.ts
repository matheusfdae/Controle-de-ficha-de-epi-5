// deno-lint-ignore-file
import { verifyCaller, serviceClient, clerkClient, json, corsHeaders } from '../_shared/clerk.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!caller.canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const { user_id } = await req.json();
    if (!user_id) return json({ error: 'user_id obrigatório' }, 400);
    if (user_id === caller.profileId) return json({ error: 'Você não pode excluir a si mesmo' }, 400);

    const admin = serviceClient();

    if (!caller.isAdmin) {
      const { data: targetRoles } = await admin.from('user_roles').select('role').eq('user_id', user_id);
      if ((targetRoles || []).some((r: any) => r.role === 'admin')) {
        return json({ error: 'RH não pode excluir contas de administrador' }, 403);
      }
    }

    const { data: target } = await admin.from('profiles').select('clerk_user_id').eq('id', user_id).maybeSingle();

    const run = async (label: string, promise: PromiseLike<{ error: any }>) => {
      const { error } = await promise;
      if (error) throw new Error(`${label}: ${error.message}`);
    };

    await run('Remover supervisor dos colaboradores', admin.from('profiles').update({ supervisor_id: null }).eq('supervisor_id', user_id));
    await run('Limpar fichas criadas de EPI', admin.from('fichas_epi').update({ criado_por: null }).eq('criado_por', user_id));
    await run('Limpar fichas criadas de uniforme', admin.from('fichas_uniforme').update({ criado_por: null }).eq('criado_por', user_id));
    await run('Limpar movimentações', admin.from('movimentacoes_estoque').update({ responsavel_id: null }).eq('responsavel_id', user_id));
    await run('Remover integrações', admin.from('colaboradores_integracao').delete().eq('profile_id', user_id));
    await run('Remover fichas de EPI', admin.from('fichas_epi').delete().eq('colaborador_id', user_id));
    await run('Remover fichas de uniforme', admin.from('fichas_uniforme').delete().eq('colaborador_id', user_id));

    await run('Remover papéis', admin.from('user_roles').delete().eq('user_id', user_id));
    await run('Remover perfil', admin.from('profiles').delete().eq('id', user_id));

    if (target?.clerk_user_id) {
      await clerkClient.users.deleteUser(target.clerk_user_id);
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
