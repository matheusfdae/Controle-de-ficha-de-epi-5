// deno-lint-ignore-file
import { verifyCaller, serviceClient, clerkClient, randomTempPassword, json, corsHeaders } from '../_shared/clerk.ts';

// O Clerk não tem um equivalente administrativo direto ao antigo
// generateLink({type:'recovery'}) do Supabase. Por decisão de produto,
// esta função vira um atalho equivalente ao admin-set-password: gera uma
// senha temporária e força troca no próximo login.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!caller.canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const { email } = await req.json().catch(() => ({} as any));
    if (!email || !String(email).includes('@')) return json({ error: 'E-mail inválido' }, 400);

    const admin = serviceClient();
    const { data: target } = await admin.from('profiles')
      .select('id, clerk_user_id').eq('email', String(email).toLowerCase()).maybeSingle();
    if (!target?.clerk_user_id) return json({ error: 'Usuário não encontrado' }, 404);

    if (!caller.isAdmin) {
      const { data: targetRoles } = await admin.from('user_roles').select('role').eq('user_id', target.id);
      if ((targetRoles || []).some((r: any) => r.role === 'admin')) {
        return json({ error: 'RH não pode redefinir senha de contas de administrador' }, 403);
      }
    }

    const tempPassword = randomTempPassword();
    await clerkClient.users.updateUser(target.clerk_user_id, {
      password: tempPassword,
      skipPasswordChecks: true,
    });
    await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id);

    return json({ ok: true, temp_password: tempPassword });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
