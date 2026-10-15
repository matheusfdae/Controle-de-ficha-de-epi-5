// deno-lint-ignore-file
// Envia por e-mail a lista de quem participou da integração (tela Integração),
// pela conta do Microsoft 365 conectada em Configurações > E-mail.
// Corpo: { destinatarios: string[], copia?: string[], pessoas: PessoaIntegracao[], data?: 'aaaa-mm-dd', observacao?: string }
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import { EMAIL } from '../_shared/emailConvocacao.ts';
import { montarEmailIntegracao, normalizarPessoas } from '../_shared/emailIntegracao.ts';

const lista = (v: unknown) => (Array.from(new Set((Array.isArray(v) ? v : []).map(e => String(e).trim().toLowerCase())))
  .filter(e => EMAIL.test(e))) as string[];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const admin = serviceClient();
    const { data: pode } = await admin.rpc('has_permission', { _user_id: caller.profileId, _module: 'integracao', _action: 'view' });
    if (pode !== true) return json({ error: 'Sem permissão na tela Integração' }, 403);

    const corpo = await req.json().catch(() => ({}));
    const para = lista(corpo.destinatarios);
    const copia = lista(corpo.copia).filter(e => !para.includes(e));
    if (!para.length) return json({ error: 'Informe ao menos um e-mail válido' }, 400);
    if (para.length + copia.length > 30) return json({ error: 'Máximo de 30 e-mails (destinatários + cópia)' }, 400);
    const pessoas = normalizarPessoas(corpo.pessoas);
    if (!pessoas.length) return json({ error: 'Selecione ao menos um colaborador' }, 400);

    const m = montarEmailIntegracao(pessoas, { data: corpo.data, observacao: corpo.observacao });
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
    return json({ enviado: true, colaboradores: pessoas.length, destinatarios: para.length, copia: copia.length });
  } catch (e: any) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e?.message || String(e) }, 500);
  }
});
