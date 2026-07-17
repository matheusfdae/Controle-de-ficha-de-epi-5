// deno-lint-ignore-file
import { createClerkClient, verifyToken } from 'npm:@clerk/backend@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY')!;

export const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

export interface Caller {
  clerkUserId: string;
  profileId: string;
  roles: string[];
  isAdmin: boolean;
  canManage: boolean; // admin ou rh
}

/** Verifica o Bearer token emitido pelo Clerk e devolve o `sub` (clerk user id), ou null se inválido/ausente. */
async function resolveClerkUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');

  try {
    const claims = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    return claims?.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Verifica o Bearer token emitido pelo Clerk e resolve o perfil/papéis
 * internos por clerk_user_id. Substitui o antigo padrão
 * userClient.auth.getClaims(token)/getUser() do Supabase Auth.
 */
export async function verifyCaller(req: Request): Promise<Caller | null> {
  const clerkUserId = await resolveClerkUserId(req);
  if (!clerkUserId) return null;

  const admin = serviceClient();
  const { data: profile } = await admin
    .from('profiles').select('id').eq('clerk_user_id', clerkUserId).maybeSingle();
  if (!profile) return null;

  const { data: rolesData } = await admin
    .from('user_roles').select('role').eq('user_id', profile.id);
  const roles = (rolesData || []).map((r: any) => r.role);
  const isAdmin = roles.includes('admin');
  const canManage = isAdmin || roles.includes('rh');

  return { clerkUserId, profileId: profile.id, roles, isAdmin, canManage };
}

/**
 * Guard independente do modelo de papéis do Postgres (user_roles/profiles):
 * autoriza só pelo publicMetadata.role do próprio usuário no Clerk, usado
 * exclusivamente pelo fluxo de convite (admin-invite-user). Não confundir
 * com verifyCaller()/isAdmin/canManage, que continuam sendo a fonte de
 * verdade para o resto do sistema (fichas, estoque, etc.).
 */
export async function verifyEditor(req: Request): Promise<{ clerkUserId: string } | null> {
  const clerkUserId = await resolveClerkUserId(req);
  if (!clerkUserId) return null;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const role = (clerkUser.publicMetadata as Record<string, unknown> | null)?.role;
  if (role !== 'edit') return null;

  return { clerkUserId };
}

export function randomTempPassword() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16) + 'Aa1!';
}
