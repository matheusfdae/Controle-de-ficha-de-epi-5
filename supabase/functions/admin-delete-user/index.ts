// deno-lint-ignore-file
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

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
    const callerId = claimsData.claims.sub;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from('user_roles').select('role').eq('user_id', callerId);
    const canManage = (roles || []).some((r: any) => r.role === 'admin' || r.role === 'rh');
    if (!canManage) return json({ error: 'Apenas administradores/RH' }, 403);

    const { user_id } = await req.json();
    if (!user_id) {
      return json({ error: 'user_id obrigatório' }, 400);
    }
    if (user_id === callerId) {
      return json({ error: 'Você não pode excluir a si mesmo' }, 400);
    }

    const run = async (label: string, promise: PromiseLike<{ error: any }>) => {
      const { error } = await promise;
      if (error) throw new Error(`${label}: ${error.message}`);
    };

    await run('Remover supervisor dos colaboradores', admin.from('profiles').update({ supervisor_id: null }).eq('supervisor_id', user_id));
    await run('Limpar fichas criadas de EPI', admin.from('fichas_epi').update({ criado_por: null }).eq('criado_por', user_id));
    await run('Limpar fichas criadas de uniforme', admin.from('fichas_uniforme').update({ criado_por: null }).eq('criado_por', user_id));
    await run('Limpar movimentações', admin.from('movimentacoes_estoque').update({ responsavel_id: null }).eq('responsavel_id', user_id));
    await run('Remover integrações', admin.from('colaboradores_integracao').delete().eq('profile_id', user_id));
    await run('Remover fichas de EPI', admin.from('fichas_epi').delete().eq('colaborador_id', user_id));
    await run('Remover fichas de uniforme', admin.from('fichas_uniforme').delete().eq('colaborador_id', user_id));

    await run('Remover permissões', admin.from('user_roles').delete().eq('user_id', user_id));
    await run('Remover perfil', admin.from('profiles').delete().eq('id', user_id));

    const { error: delErr } = await admin.auth.admin.deleteUser(user_id);
    if (delErr) throw delErr;

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
