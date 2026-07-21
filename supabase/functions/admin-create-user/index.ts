// deno-lint-ignore-file
import { verifyCaller, serviceClient, clerkClient, randomTempPassword, json, corsHeaders } from '../_shared/clerk.ts';

type Role = 'admin' | 'rh' | 'supervisor' | 'almoxarife' | 'colaborador';
const ROLES: Role[] = ['admin', 'rh', 'supervisor', 'almoxarife', 'colaborador'];

interface PermissionRow {
  module: string;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!caller.canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const body = await req.json().catch(() => null) as {
      nome?: string;
      email?: string;
      password?: string;
      role?: Role;
      permissions?: PermissionRow[];
    } | null;

    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const role: Role = ROLES.includes(body?.role as Role) ? body!.role! : 'colaborador';
    const permissions = Array.isArray(body?.permissions) ? body!.permissions! : [];
    const explicitPassword = String(body?.password || '');

    if (role === 'admin' && !caller.isAdmin) {
      return json({ error: 'Apenas administradores podem criar contas de administrador' }, 403);
    }
    if (!nome) return json({ error: 'Nome obrigatório' }, 400);
    if (!email || !email.includes('@')) return json({ error: 'E-mail inválido' }, 400);
    if (explicitPassword.length > 0 && explicitPassword.length < 6) {
      return json({ error: 'Senha mínima de 6 caracteres' }, 400);
    }

    // Cadastro é só-por-admin (self-signup desligado no Clerk) — sempre
    // criamos o usuário direto no Clerk. Sem senha explícita, geramos uma
    // temporária e marcamos must_change_password (mesmo fluxo do
    // admin-set-password/admin-resend-invite); não existe mais o "link
    // mágico de convite" do Supabase.
    const generatedPassword = explicitPassword.length === 0 ? randomTempPassword() : undefined;
    const password = explicitPassword.length >= 6 ? explicitPassword : generatedPassword!;

    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      skipPasswordChecks: !!generatedPassword,
      firstName: nome,
    });

    const admin = serviceClient();
    const { data: profile, error: profileError } = await admin.from('profiles')
      .insert({
        clerk_user_id: clerkUser.id,
        email,
        nome_completo: nome,
        ativo: true,
        must_change_password: true,
      })
      .select('id').single();
    if (profileError) throw profileError;
    const userId = profile.id;

    const rolesToInsert: Array<{ user_id: string; role: Role }> = [
      { user_id: userId, role: 'colaborador' },
    ];
    if (role !== 'colaborador') rolesToInsert.push({ user_id: userId, role });
    const { error: roleError } = await admin.from('user_roles').insert(rolesToInsert);
    if (roleError) throw roleError;

    if (permissions.length > 0) {
      const rows = permissions
        .filter((p) => p && p.module)
        .map((p) => ({
          user_id: userId,
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

    return json({ ok: true, user_id: userId, temp_password: generatedPassword });
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500);
  }
});
