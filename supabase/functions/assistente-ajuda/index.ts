// deno-lint-ignore-file
// Chat "Tirar dúvidas": responde sobre o uso do sistema pelo Gemini.
// Corpo: { conversa: { papel: 'usuario' | 'assistente', texto: string }[], pagina?: string }
// A chave do Gemini fica em config_segredos (gemini_api_key, gravada na VM por
// deploy/producao/configurar-assistente.sh) ou na variável GEMINI_API_KEY.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { ErroAssistente, normalizarConversa, perguntarAssistente } from '../_shared/assistente.ts';

// Freio simples por usuário (por instância): no máximo 15 perguntas por minuto.
const recentes = new Map<string, number[]>();
function dentroDoLimite(id: string) {
  const agora = Date.now();
  const l = (recentes.get(id) ?? []).filter(t => agora - t < 60_000);
  if (l.length >= 15) return false;
  l.push(agora);
  recentes.set(id, l);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    if (!dentroDoLimite(caller.profileId)) return json({ error: 'Muitas perguntas seguidas. Espere 1 minuto.' }, 429);

    const admin = serviceClient();
    const { data } = await admin.from('config_segredos').select('valor').eq('chave', 'gemini_api_key').maybeSingle();
    const chave = data?.valor || Deno.env.get('GEMINI_API_KEY');
    if (!chave) return json({ error: 'O assistente ainda não foi configurado. Avise o administrador.' }, 503);

    const corpo = await req.json().catch(() => ({}));
    const resposta = await perguntarAssistente(chave, normalizarConversa(corpo.conversa), corpo.pagina);
    return json({ resposta });
  } catch (e: any) {
    if (e instanceof ErroAssistente) return json({ error: e.message }, e.status);
    return json({ error: e?.message || String(e) }, 500);
  }
});
