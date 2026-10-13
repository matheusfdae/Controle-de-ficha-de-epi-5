// deno-lint-ignore-file
// Credenciais da Senior para as Edge Functions: primeiro da tabela
// config_segredos (gravada na VM por deploy/producao/configurar-senior.sh,
// só o service role lê); se não houver, das variáveis de ambiente.
import type { SeniorConfig } from './senior.ts';

export async function carregarSenior(admin: any): Promise<{ cfg: SeniorConfig | null; cronSecret: string | null }> {
  const { data } = await admin.from('config_segredos').select('chave, valor').like('chave', 'senior_%');
  const s: Record<string, string> = Object.fromEntries((data ?? []).map((r: any) => [r.chave, r.valor]));
  const baseUrl = s.senior_ws_url || Deno.env.get('SENIOR_WS_URL');
  const user = s.senior_ws_user || Deno.env.get('SENIOR_WS_USER');
  const password = s.senior_ws_password || Deno.env.get('SENIOR_WS_PASSWORD');
  const module = s.senior_ws_module || Deno.env.get('SENIOR_WS_MODULE') || 'rubi';
  return {
    cfg: baseUrl && user && password ? { baseUrl, user, password, module } : null,
    cronSecret: s.senior_cron_secret || null,
  };
}

/** Comparação em tempo constante (o segredo do agendador vem num header). */
export function mesmoSegredo(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
