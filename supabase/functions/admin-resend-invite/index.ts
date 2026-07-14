// deno-lint-ignore-file
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const token = auth.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autenticado' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from('user_roles').select('role').eq('user_id', claimsData.claims.sub);
    const callerRoles = (roles || []).map((r: any) => r.role);
    const callerIsAdmin = callerRoles.includes('admin');
    const canManage = callerIsAdmin || callerRoles.includes('rh');
    if (!canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const { email, redirect_to } = await req.json().catch(() => ({} as any));
    if (!email || !String(email).includes('@')) return json({ error: 'E-mail inválido' }, 400);

    if (!callerIsAdmin) {
      const { data: targetProfile } = await admin
        .from('profiles').select('id').eq('email', String(email).toLowerCase()).maybeSingle();
      if (targetProfile) {
        const { data: targetRoles } = await admin
          .from('user_roles').select('role').eq('user_id', targetProfile.id);
        if ((targetRoles || []).some((r: any) => r.role === 'admin')) {
          return json({ error: 'RH não pode redefinir senha de contas de administrador' }, 403);
        }
      }
    }

    const { error: resetErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: String(email).toLowerCase(),
      options: { redirectTo: redirect_to || undefined },
    });
    if (resetErr) {
      // Fallback: envia por e-mail
      const { error: err2 } = await admin.auth.resetPasswordForEmail(String(email).toLowerCase(), {
        redirectTo: redirect_to || undefined,
      });
      if (err2) throw err2;
    }

    await admin.from('profiles').update({ must_change_password: true }).eq('email', String(email).toLowerCase());

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
