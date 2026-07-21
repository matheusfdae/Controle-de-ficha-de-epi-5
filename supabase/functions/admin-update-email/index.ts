// deno-lint-ignore-file
import { verifyCaller, serviceClient, clerkClient, json, corsHeaders } from '../_shared/clerk.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!caller.canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const { user_id, new_email } = await req.json();
    const email = String(new_email || '').trim().toLowerCase();
    if (!user_id || !email || !email.includes('@')) {
      return json({ error: 'Dados inválidos (e-mail obrigatório)' }, 400);
    }

    const admin = serviceClient();

    if (!caller.isAdmin) {
      const { data: targetRoles } = await admin.from('user_roles').select('role').eq('user_id', user_id);
      if ((targetRoles || []).some((r: any) => r.role === 'admin')) {
        return json({ error: 'RH não pode alterar e-mail de contas de administrador' }, 403);
      }
    }

    const { data: target } = await admin.from('profiles').select('clerk_user_id').eq('id', user_id).maybeSingle();
    if (!target?.clerk_user_id) return json({ error: 'Usuário não encontrado' }, 404);

    // Diferente do updateUserById({email}) do Supabase, o Clerk exige criar
    // o novo endereço, marcá-lo como primário e só então remover o antigo.
    const newEmailObj = await clerkClient.emailAddresses.createEmailAddress({
      userId: target.clerk_user_id,
      emailAddress: email,
      verified: true,
      primary: true,
    });

    const clerkUser = await clerkClient.users.getUser(target.clerk_user_id);
    const oldEmails = clerkUser.emailAddresses.filter((e: any) => e.id !== newEmailObj.id);
    for (const old of oldEmails) {
      await clerkClient.emailAddresses.deleteEmailAddress(old.id);
    }

    const { error: profErr } = await admin.from('profiles').update({ email }).eq('id', user_id);
    if (profErr) throw profErr;

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
