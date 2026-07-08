// deno-lint-ignore-file
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type Role = 'admin' | 'rh' | 'supervisor' | 'almoxarife' | 'colaborador';
const ROLES: Role[] = ['admin', 'rh', 'supervisor', 'almoxarife', 'colaborador'];

interface PermissionRow {
  module: string;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
}

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

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
    const { data: rolesData } = await admin
      .from('user_roles').select('role').eq('user_id', claimsData.claims.sub);
    const canManage = (rolesData || []).some((r: any) => r.role === 'admin' || r.role === 'rh');
    if (!canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const body = await req.json().catch(() => null) as {
      nome?: string;
      email?: string;
      password?: string;
      role?: Role;
      permissions?: PermissionRow[];
      send_invite?: boolean;
      redirect_to?: string;
    } | null;

    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const role: Role = ROLES.includes(body?.role as Role) ? body!.role! : 'colaborador';
    const permissions = Array.isArray(body?.permissions) ? body!.permissions! : [];
    const sendInvite = body?.send_invite !== false && password.length === 0;
    const redirectTo = body?.redirect_to || undefined;

    if (!nome) return json({ error: 'Nome obrigatório' }, 400);
    if (!email || !email.includes('@')) return json({ error: 'E-mail inválido' }, 400);
    if (!sendInvite && password.length < 6) {
      return json({ error: 'Senha mínima de 6 caracteres' }, 400);
    }

    let userId: string | undefined;

    if (sendInvite) {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { nome_completo: nome },
        redirectTo,
      });
      if (invErr) throw invErr;
      userId = invited.user?.id;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome_completo: nome },
      });
      if (createError) throw createError;
      userId = created.user?.id;
    }
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
    const rolesToInsert: Array<{ user_id: string; role: Role }> = [
      { user_id: userId, role: 'colaborador' },
    ];
    if (role !== 'colaborador') rolesToInsert.push({ user_id: userId, role });
    const { error: roleError } = await admin.from('user_roles').insert(rolesToInsert);
    if (roleError) throw roleError;

    if (permissions.length > 0) {
      await admin.from('user_permissions').delete().eq('user_id', userId);
      const rows = permissions
        .filter((p) => p && p.module)
        .map((p) => ({
          user_id: userId!,
          module: p.module,
          can_view: !!p.can_view,
          can_create: !!p.can_create,
          can_edit: !!p.can_edit,
          can_delete: !!p.can_delete,
        }));
      if (rows.length > 0) {
        const { error: permErr } = await admin.from('user_permissions').insert(rows);
        if (permErr) throw permErr;
      }
    }

    return json({ ok: true, user_id: userId, invited: sendInvite });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});
