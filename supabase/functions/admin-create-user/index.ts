// deno-lint-ignore-file
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Role = 'admin' | 'rh' | 'supervisor' | 'colaborador';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autenticado' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roles, error: rolesError } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', claimsData.claims.sub);
    if (rolesError) throw rolesError;
    const canManage = (roles || []).some((r: any) => r.role === 'admin' || r.role === 'rh');
    if (!canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const body = await req.json().catch(() => null) as {
      nome?: string;
      email?: string;
      password?: string;
      role?: Role;
    } | null;
    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const role: Role = ['admin', 'rh', 'supervisor', 'colaborador'].includes(body?.role as string)
      ? body!.role!
      : 'colaborador';

    if (!nome) return json({ error: 'Nome obrigatório' }, 400);
    if (!email || !email.includes('@')) return json({ error: 'E-mail/login inválido' }, 400);
    if (password.length < 6) return json({ error: 'Senha mínima de 6 caracteres' }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo: nome },
    });
    if (createError) throw createError;
    const userId = created.user?.id;
    if (!userId) return json({ error: 'Usuário não foi criado' }, 500);

    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      email,
      nome_completo: nome,
      ativo: true,
      must_change_password: true,
    });
    if (profileError) throw profileError;

    await admin.from('user_roles').delete().eq('user_id', userId);
    const rolesToInsert = [{ user_id: userId, role: 'colaborador' as Role }];
    if (role !== 'colaborador') rolesToInsert.push({ user_id: userId, role });
    const { error: roleError } = await admin.from('user_roles').insert(rolesToInsert);
    if (roleError) throw roleError;

    return json({ ok: true, user_id: userId });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});