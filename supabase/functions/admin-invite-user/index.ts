// deno-lint-ignore-file
import { verifyEditor, clerkClient, json, corsHeaders } from '../_shared/clerk.ts';

type InviteRole = 'edit' | 'view';

// Domínio de e-mail aceito para convite — só usuários corporativos.
const ALLOWED_DOMAIN = (Deno.env.get('INVITE_ALLOWED_EMAIL_DOMAIN') || 'grupo5estrelas.com.br').toLowerCase();
// URL pública do frontend, para onde o convidado é levado depois de aceitar
// (rota /aceitar-convite, que consome o ticket do Clerk).
const APP_PUBLIC_URL = Deno.env.get('APP_PUBLIC_URL') || 'https://app.grupo5estrelas.com.br';

// Autorização por publicMetadata.role="edit" (verifyEditor) — desacoplada do
// sistema de papéis do Postgres (user_roles/profiles), que continua
// governando o resto do app (fichas, estoque, etc.).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyEditor(req);
    if (!caller) return json({ error: 'Apenas usuários com permissão de edição podem enviar convites' }, 403);

    const body = await req.json().catch(() => null) as {
      email_address?: string;
      role?: InviteRole;
      departamento?: string;
    } | null;

    const email = String(body?.email_address || '').trim().toLowerCase();
    const role = body?.role;
    const departamento = body?.departamento ? String(body.departamento).trim() : undefined;

    if (!email || !email.includes('@')) return json({ error: 'E-mail inválido' }, 400);
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return json({ error: `Apenas e-mails do domínio @${ALLOWED_DOMAIN} podem ser convidados` }, 400);
    }
    if (role !== 'edit' && role !== 'view') {
      return json({ error: 'role deve ser "edit" ou "view"' }, 400);
    }

    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${APP_PUBLIC_URL}/aceitar-convite`,
      publicMetadata: { role, ...(departamento ? { departamento } : {}) },
    });

    return json({ ok: true, invitation_id: invitation.id });
  } catch (error: any) {
    // Log completo só no servidor; resposta ao cliente nunca inclui
    // detalhes internos (chaves, tokens, corpo bruto de erro da API do Clerk).
    console.error('admin-invite-user error:', error);
    const detail = error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message;
    const safe = typeof detail === 'string' && !/secret|token|key|bearer/i.test(detail) ? detail : undefined;
    return json({ error: safe || 'Falha ao enviar convite. Tente novamente em instantes.' }, 500);
  }
});
