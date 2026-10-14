// deno-lint-ignore-file
// Envio de e-mail pelo Microsoft 365 no modelo DELEGADO (escolha do TI): o
// sistema envia em nome de UMA conta, que autoriza uma vez pelo login por
// código (https://microsoft.com/device). Guardamos só o refresh token (que a
// Microsoft renova a cada uso); a senha da conta nunca passa pelo sistema.
//
// App no Azure: permissões DELEGADAS Mail.Send + offline_access com consentimento
// do admin; Authentication > "Allow public client flows" = Yes.
// Sem dependências: usado pelas Edge Functions e, no localhost, pelo vite.config.ts.

// Mail.Send.Shared: enviar como uma caixa compartilhada (ex.: naoresponda@) na qual
// o usuário que fez o login tem a permissão "Enviar como".
export const ESCOPOS = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Send.Shared offline_access openid profile';

export interface AppMs {
  tenantId: string;
  clientId: string;
  /** Só se o app no Azure for "confidencial" (sem public client flows). */
  clientSecret?: string;
}

export interface Anexo { nome: string; tipo: string; base64: string }

export class ErroMicrosoft extends Error {
  constructor(message: string, readonly codigo?: string) { super(message); }
}

const urlToken = (a: AppMs) => `https://login.microsoftonline.com/${encodeURIComponent(a.tenantId)}/oauth2/v2.0/token`;

/** POST no endpoint de token; tenta sem o secret e, se o Azure exigir, com ele. */
async function pedirToken(a: AppMs, campos: Record<string, string>): Promise<any> {
  const tentar = async (comSecret: boolean) => {
    const corpo = new URLSearchParams({ client_id: a.clientId, ...campos });
    if (comSecret && a.clientSecret) corpo.set('client_secret', a.clientSecret);
    const resp = await fetch(urlToken(a), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo,
    });
    return resp.json().catch(() => ({}));
  };
  let r = await tentar(false);
  // invalid_client / AADSTS7000218: o app é confidencial e exige o client_secret.
  const exigeSecret = r.error === 'invalid_client' || /AADSTS7000218/.test(r.error_description ?? '');
  if (exigeSecret) {
    if (!a.clientSecret) {
      r.error_description = `${r.error_description ?? ''} [o app no Azure exige o client secret, mas ele não está configurado no sistema]`;
    } else {
      r = await tentar(true);
      if (r.error) r.error_description = `${r.error_description ?? ''} [tentado também com o client secret]`;
    }
  }
  return r;
}

/** Passo 1 do login por código: devolve o código que a pessoa digita em microsoft.com/device. */
export async function iniciarLogin(a: AppMs) {
  const resp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(a.tenantId)}/oauth2/v2.0/devicecode`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: a.clientId, scope: ESCOPOS }),
  });
  const r = await resp.json().catch(() => ({}));
  if (!r.device_code) throw new ErroMicrosoft(`Microsoft 365 recusou: ${r.error_description || r.error || resp.status}`, r.error);
  return {
    deviceCode: r.device_code as string,
    codigo: r.user_code as string,
    url: (r.verification_uri as string) || 'https://microsoft.com/devicelogin',
    expiraEm: new Date(Date.now() + Number(r.expires_in ?? 900) * 1000).toISOString(),
    intervalo: Number(r.interval ?? 5),
  };
}

/** Conta (e-mail) dona do token, lida do próprio access token. */
export function contaDoToken(accessToken: string): string | null {
  try {
    const parte = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(atob(parte + '='.repeat((4 - (parte.length % 4)) % 4)));
    return c.upn || c.unique_name || c.preferred_username || null;
  } catch {
    return null;
  }
}

/**
 * Passo 2: confere se a pessoa já autorizou. Enquanto não, volta { pendente: true }.
 * Autorizado, volta o refresh token (guardar) e a conta.
 */
export async function verificarLogin(a: AppMs, deviceCode: string) {
  const r = await pedirToken(a, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode });
  if (r.error === 'authorization_pending' || r.error === 'slow_down') return { pendente: true as const };
  if (r.error) {
    const msg = r.error === 'expired_token' ? 'O código expirou. Clique em "Conectar conta" de novo.'
      : r.error === 'authorization_declined' ? 'A autorização foi recusada na tela da Microsoft.'
      : `Microsoft 365 recusou: ${r.error_description || r.error}`;
    throw new ErroMicrosoft(msg, r.error);
  }
  if (!r.refresh_token) throw new ErroMicrosoft('A Microsoft não devolveu a autorização permanente (falta a permissão offline_access).');
  return { pendente: false as const, refreshToken: r.refresh_token as string, conta: contaDoToken(r.access_token) };
}

/**
 * Access token a partir do refresh token. A Microsoft devolve um refresh NOVO
 * a cada uso: quem chama precisa guardar `refreshToken` de volta.
 */
export async function renovarAcesso(a: AppMs, refreshToken: string) {
  const r = await pedirToken(a, { grant_type: 'refresh_token', refresh_token: refreshToken, scope: ESCOPOS });
  if (!r.access_token) {
    const expirou = r.error === 'invalid_grant';
    throw new ErroMicrosoft(expirou
      ? 'A autorização da conta do Microsoft 365 expirou ou foi revogada (troca de senha, revogação pelo TI ou 90 dias sem uso). Em Configurações > E-mail, clique em "Conectar conta" de novo.'
      : `Microsoft 365 recusou: ${r.error_description || r.error}`, r.error);
  }
  return { accessToken: r.access_token as string, refreshToken: (r.refresh_token as string) || refreshToken };
}

/**
 * Envia pela conta autorizada. Com `caixa` (compartilhada), envia COMO ela:
 * 1. POST /users/{caixa}/sendMail — precisa de acesso à caixa (grava nos Itens
 *    Enviados dela);
 * 2. se o Exchange não achar a caixa para o usuário ("not found in the store",
 *    só "Enviar como" sem acesso total), POST /me/sendMail com from = caixa.
 */
export async function enviarComo(
  accessToken: string, msg: { para: string[]; copia?: string[]; assunto: string; html: string; anexos?: Anexo[] }, caixa?: string | null,
) {
  const mensagem = (comFrom: boolean) => ({
    message: {
      subject: msg.assunto,
      body: { contentType: 'HTML', content: msg.html },
      toRecipients: msg.para.map(address => ({ emailAddress: { address } })),
      ccRecipients: (msg.copia ?? []).map(address => ({ emailAddress: { address } })),
      ...(comFrom && caixa ? { from: { emailAddress: { address: caixa } } } : {}),
      attachments: (msg.anexos ?? []).map(x => ({
        '@odata.type': '#microsoft.graph.fileAttachment', name: x.nome, contentType: x.tipo, contentBytes: x.base64,
      })),
    },
    saveToSentItems: true,
  });
  const enviar = async (url: string, comFrom: boolean) => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagem(comFrom)),
    });
    if (resp.status === 202) return null;
    const corpo = await resp.json().catch(() => ({}));
    return { codigo: corpo?.error?.code as string | undefined, texto: (corpo?.error?.message as string) || String(resp.status) };
  };

  let erro = caixa
    ? await enviar(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(caixa)}/sendMail`, false)
    : await enviar('https://graph.microsoft.com/v1.0/me/sendMail', false);
  if (erro && caixa && (erro.codigo === 'ErrorItemNotFound' || /not found in the store/i.test(erro.texto))) {
    erro = await enviar('https://graph.microsoft.com/v1.0/me/sendMail', true);
  }
  if (erro) {
    const dica = /SendAs|send as|on behalf/i.test(`${erro.codigo} ${erro.texto}`)
      ? ' (a conta conectada ainda não tem "Enviar como" na caixa; a permissão pode levar até 1 hora para valer)' : '';
    throw new ErroMicrosoft(`Microsoft 365 não enviou o e-mail: ${erro.texto}${dica}`, erro.codigo);
  }
}
