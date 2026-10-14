// deno-lint-ignore-file
// Conta do Microsoft 365 que envia os e-mails (modelo delegado): dados do app
// e o refresh token ficam em config_segredos (só o service role lê).
import { renovarAcesso, type AppMs } from './microsoft.ts';

export async function lerSegredosMs(admin: any): Promise<Record<string, string>> {
  const { data, error } = await admin.from('config_segredos').select('chave, valor').like('chave', 'ms_%');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r: any) => [r.chave, r.valor]));
}

export async function gravarSegredosMs(admin: any, valores: Record<string, string | null>) {
  const apagar = Object.keys(valores).filter(k => valores[k] === null);
  const gravar = Object.entries(valores).filter(([, v]) => v !== null)
    .map(([chave, valor]) => ({ chave, valor, updated_at: new Date().toISOString() }));
  if (gravar.length) {
    const { error } = await admin.from('config_segredos').upsert(gravar, { onConflict: 'chave' });
    if (error) throw new Error(error.message);
  }
  if (apagar.length) await admin.from('config_segredos').delete().in('chave', apagar);
}

export const appDe = (s: Record<string, string>): AppMs | null =>
  s.ms_tenant_id && s.ms_client_id ? { tenantId: s.ms_tenant_id, clientId: s.ms_client_id, clientSecret: s.ms_client_secret || undefined } : null;

/** Access token da conta conectada (e grava o refresh token novo que a Microsoft devolve). */
export async function acessoParaEnviar(admin: any): Promise<{ accessToken: string; conta: string | null; caixa: string | null }> {
  const s = await lerSegredosMs(admin);
  const app = appDe(s);
  if (!app || !s.ms_refresh_token) {
    throw new Error('Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".');
  }
  const r = await renovarAcesso(app, s.ms_refresh_token);
  if (r.refreshToken !== s.ms_refresh_token) await gravarSegredosMs(admin, { ms_refresh_token: r.refreshToken });
  return { accessToken: r.accessToken, conta: s.ms_conta || null, caixa: s.ms_caixa || null };
}
