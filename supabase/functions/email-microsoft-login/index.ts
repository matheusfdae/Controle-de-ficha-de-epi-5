// deno-lint-ignore-file
// Conecta a conta do Microsoft 365 que envia os e-mails (Configurações > E-mail),
// pelo login por código: { acao: 'status' | 'iniciar' | 'verificar' | 'desconectar' }.
// Só quem pode editar Configurações; o refresh token nunca sai do servidor.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { ErroMicrosoft, iniciarLogin, verificarLogin } from '../_shared/microsoft.ts';
import { appDe, gravarSegredosMs, lerSegredosMs } from '../_shared/contaMicrosoft.ts';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const admin = serviceClient();
    const { acao, tenant_id, client_id, caixa } = await req.json().catch(() => ({}));
    const acaoEdita = acao !== 'status';
    const { data: pode } = await admin.rpc('has_permission', {
      _user_id: caller.profileId, _module: 'configuracoes', _action: acaoEdita ? 'edit' : 'view',
    });
    if (pode !== true) return json({ error: 'Sem permissão para configurar o e-mail' }, 403);

    const s = await lerSegredosMs(admin);
    if (acao === 'status') {
      return json({
        conectado: !!s.ms_refresh_token, conta: s.ms_conta || null, caixa: s.ms_caixa || '',
        tenant_id: s.ms_tenant_id || '', client_id: s.ms_client_id || '',
      });
    }
    if (acao === 'iniciar') {
      if (!GUID.test(tenant_id ?? '') || !GUID.test(client_id ?? '')) {
        return json({ error: 'Tenant ID e Client ID têm o formato 00000000-0000-0000-0000-000000000000' }, 400);
      }
      const app = { tenantId: tenant_id, clientId: client_id, clientSecret: s.ms_client_secret || undefined };
      const r = await iniciarLogin(app);
      const caixaOk = String(caixa ?? '').trim().toLowerCase();
      if (caixaOk && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(caixaOk)) return json({ error: 'Caixa compartilhada inválida' }, 400);
      await gravarSegredosMs(admin, {
        ms_tenant_id: tenant_id, ms_client_id: client_id, ms_device_code: r.deviceCode, ms_caixa: caixaOk || null,
      });
      return json({ codigo: r.codigo, url: r.url, expira_em: r.expiraEm, intervalo: r.intervalo });
    }
    if (acao === 'verificar') {
      const app = appDe(s);
      if (!app || !s.ms_device_code) return json({ error: 'Nenhum login em andamento. Clique em "Conectar conta".' }, 400);
      const r = await verificarLogin(app, s.ms_device_code);
      if (r.pendente) return json({ pendente: true });
      await gravarSegredosMs(admin, { ms_refresh_token: r.refreshToken, ms_conta: r.conta ?? '', ms_device_code: null });
      return json({ conectado: true, conta: r.conta });
    }
    if (acao === 'desconectar') {
      await gravarSegredosMs(admin, { ms_refresh_token: null, ms_conta: null, ms_device_code: null });
      return json({ conectado: false });
    }
    return json({ error: 'Ação inválida' }, 400);
  } catch (e: any) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e?.message || String(e) }, 500);
  }
});
