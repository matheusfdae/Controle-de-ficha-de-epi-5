// deno-lint-ignore-file
import { verifyCaller, serviceClient, clerkClient, json, corsHeaders } from '../_shared/clerk.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!caller.isAdmin) return json({ error: 'Apenas administradores' }, 403);

    const { user_id, new_password, force_change } = await req.json();
    if (!user_id || !new_password || String(new_password).length < 6) {
      return json({ error: 'Dados inválidos (senha mín. 6)' }, 400);
    }

    const admin = serviceClient();
    const { data: target } = await admin.from('profiles').select('clerk_user_id').eq('id', user_id).maybeSingle();
    if (!target?.clerk_user_id) return json({ error: 'Usuário não encontrado' }, 404);

    await clerkClient.users.updateUser(target.clerk_user_id, { password: new_password });

    if (force_change !== false) {
      await admin.from('profiles').update({ must_change_password: true }).eq('id', user_id);
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
