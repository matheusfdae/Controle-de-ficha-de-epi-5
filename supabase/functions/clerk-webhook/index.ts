// deno-lint-ignore-file
import { Webhook } from 'npm:svix@1';
import { serviceClient, json, corsHeaders } from '../_shared/clerk.ts';

const WEBHOOK_SECRET = Deno.env.get('CLERK_WEBHOOK_SECRET')!;

// Provisionamento/desprovisionamento de profiles/user_roles a partir dos
// eventos do Clerk. Substitui o antigo trigger on_auth_user_created (que
// disparava em INSERT em auth.users) — o Clerk gerencia os usuários fora
// do Postgres, então esse é o único lugar que sabe quando um usuário é
// criado/atualizado/removido no Clerk.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const payload = await req.text();
  const svixHeaders = {
    'svix-id': req.headers.get('svix-id') || '',
    'svix-timestamp': req.headers.get('svix-timestamp') || '',
    'svix-signature': req.headers.get('svix-signature') || '',
  };

  let evt: any;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(payload, svixHeaders);
  } catch {
    return json({ error: 'Assinatura inválida' }, 400);
  }

  const admin = serviceClient();

  try {
    switch (evt.type) {
      case 'user.created': {
        const u = evt.data;

        // admin-create-user já provisiona profiles/user_roles síncronamente
        // ao criar o usuário no Clerk — evita duplicar aqui.
        const { data: existing } = await admin
          .from('profiles').select('id').eq('clerk_user_id', u.id).maybeSingle();
        if (existing) break;

        const email = u.email_addresses?.find((e: any) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses?.[0]?.email_address ?? '';
        const nome = [u.first_name, u.last_name].filter(Boolean).join(' ') || email;

        const { data: profile, error: profileError } = await admin.from('profiles')
          .insert({ clerk_user_id: u.id, email, nome_completo: nome, ativo: true })
          .select('id').single();
        if (profileError) throw profileError;

        const { error: roleError } = await admin
          .from('user_roles').insert({ user_id: profile.id, role: 'colaborador' });
        if (roleError) throw roleError;
        break;
      }

      case 'user.updated': {
        const u = evt.data;
        const email = u.email_addresses?.find((e: any) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses?.[0]?.email_address;
        const nome = [u.first_name, u.last_name].filter(Boolean).join(' ');

        const patch: Record<string, unknown> = {};
        if (email) patch.email = email;
        if (nome) patch.nome_completo = nome;
        if (Object.keys(patch).length > 0) {
          await admin.from('profiles').update(patch).eq('clerk_user_id', u.id);
        }
        break;
      }

      case 'user.deleted': {
        const clerkUserId = evt.data.id;
        const { data: profile } = await admin
          .from('profiles').select('id').eq('clerk_user_id', clerkUserId).maybeSingle();
        if (profile) {
          const userId = profile.id;
          // Mesma cascata de limpeza de admin-delete-user, sem o passo
          // final de apagar o usuário no provedor de auth (já foi apagado
          // — é esse evento que está disparando a limpeza).
          await admin.from('profiles').update({ supervisor_id: null }).eq('supervisor_id', userId);
          await admin.from('fichas_epi').update({ criado_por: null }).eq('criado_por', userId);
          await admin.from('fichas_uniforme').update({ criado_por: null }).eq('criado_por', userId);
          await admin.from('movimentacoes_estoque').update({ responsavel_id: null }).eq('responsavel_id', userId);
          await admin.from('colaboradores_integracao').delete().eq('profile_id', userId);
          await admin.from('fichas_epi').delete().eq('colaborador_id', userId);
          await admin.from('fichas_uniforme').delete().eq('colaborador_id', userId);
          await admin.from('user_roles').delete().eq('user_id', userId);
          await admin.from('profiles').delete().eq('id', userId);
        }
        break;
      }
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
