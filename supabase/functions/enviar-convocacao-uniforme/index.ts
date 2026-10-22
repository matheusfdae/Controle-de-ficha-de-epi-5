// deno-lint-ignore-file
// Envia por e-mail (Microsoft 365) a convocação de troca de uniforme:
// colaboradores com troca vencida ou vencendo em até 30 dias.
//
//  * Manual (botão na tela Vencimentos): Bearer do Clerk; quem chama precisa
//    ver fichas de uniforme e só recebe os estados liberados para ele.
//    Corpo: { modo: 'manual', destinatarios: string[], uf?: string }
//  * Automático (agendador na VM, todo dia às 7h): header x-cron-secret.
//    Corpo: { modo: 'automatico' } — só envia no dia da semana configurado,
//    uma vez por dia, para os destinatários de email_convocacao_config.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { enviarComo, ErroMicrosoft } from '../_shared/microsoft.ts';
import { acessoParaEnviar } from '../_shared/contaMicrosoft.ts';
import {
  calcularTrocasUniforme, criarBuscaSenior, criarRegraTroca, dataBrasilia, ConvocacaoUniforme, FichaBase, ItemCatalogo,
} from '../_shared/convocacaoUniforme.ts';
import { EMAIL, montarEmail } from '../_shared/emailConvocacao.ts';
const PAGINA = 1000;

async function lerTudo(consulta: (de: number, ate: number) => any): Promise<any[]> {
  const todas: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return todas;
  }
}

async function segredos(admin: any): Promise<Record<string, string>> {
  const { data, error } = await admin.from('config_segredos').select('chave, valor');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r: any) => [r.chave, r.valor]));
}

/** Convocados (vencidos + próximos) dos estados pedidos. */
async function convocados(admin: any, ufs: string[]): Promise<ConvocacaoUniforme[]> {
  const fichas = await lerTudo((de, ate) => admin.from('fichas_epi')
    .select('id, numero, nome_funcionario, cpf_snapshot, matricula_snapshot, funcao, posto_snapshot, uf, status, data_assinatura_colaborador, data_entrega')
    .eq('status', 'assinada').in('uf', ufs).order('id').range(de, ate));
  const ids = new Set(fichas.map((f: any) => f.id));
  const itens = await lerTudo((de, ate) => admin.from('fichas_epi_itens')
    .select('ficha_id, epi_id, descricao, recebido').order('id').range(de, ate));
  const porFicha = new Map<string, any[]>();
  for (const i of itens) {
    if (!ids.has(i.ficha_id)) continue;
    const l = porFicha.get(i.ficha_id);
    if (l) l.push(i); else porFicha.set(i.ficha_id, [i]);
  }
  const { data: catalogo, error } = await admin.from('epis').select('id, nome, tipo');
  if (error) throw new Error(error.message);
  const { data: postos, error: ePostos } = await admin.from('postos')
    .select('nome, apelidos, troca_uniforme_meses, troca_uniforme_obrigatoria');
  if (ePostos) throw new Error(ePostos.message);
  const senior = await lerTudo((de, ate) => admin.from('colaboradores_senior')
    .select('num_cad, cpf, cargo, posto_descricao, nome_local, uf, ativo').order('id').range(de, ate));

  const base: FichaBase[] = fichas.map((f: any) => ({
    id: f.id, numero: f.numero, nome: f.nome_funcionario ?? '', cpf: f.cpf_snapshot, matricula: f.matricula_snapshot,
    funcao: f.funcao, posto: f.posto_snapshot, uf: f.uf, status: f.status,
    assinadoEm: f.data_assinatura_colaborador, dataEntrega: f.data_entrega,
    itens: (porFicha.get(f.id) ?? []).map(i => ({ epiId: i.epi_id, descricao: i.descricao, recebido: i.recebido })),
  }));
  return calcularTrocasUniforme(base, (catalogo ?? []) as ItemCatalogo[], new Date(), criarRegraTroca(postos ?? []), criarBuscaSenior(senior))
    .filter(t => t.situacao !== 'em_dia' && ufs.includes(t.uf)); // estado atual (Senior) pode ser outro
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret` } });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const admin = serviceClient();
    const s = await segredos(admin);
    const corpo = await req.json().catch(() => ({}));

    // ---------- Automático (agendador) ----------
    if (corpo.modo === 'automatico') {
      if (!s.cron_secret || req.headers.get('x-cron-secret') !== s.cron_secret) return json({ error: 'Não autorizado' }, 401);
      const { data: cfg } = await admin.from('email_convocacao_config').select('*').eq('id', 1).maybeSingle();
      const hoje = dataBrasilia(new Date());
      const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
      if (!cfg?.automatico) return json({ enviado: false, motivo: 'envio automático desligado' });
      if (cfg.dia_semana !== diaSemana) return json({ enviado: false, motivo: 'não é o dia configurado' });
      if (cfg.ultimo_envio_automatico === hoje) return json({ enviado: false, motivo: 'já enviado hoje' });
      const para = (cfg.destinatarios ?? []).filter((e: string) => EMAIL.test(e));
      const copia = (cfg.copia ?? []).filter((e: string) => EMAIL.test(e) && !para.includes(e));
      if (para.length === 0) return json({ enviado: false, motivo: 'sem destinatários' });
      const { data: estados } = await admin.from('estados').select('uf');
      const ufs = cfg.ufs?.length ? cfg.ufs : (estados ?? []).map((e: any) => e.uf);
      const lista = await convocados(admin, ufs);
      const m = montarEmail(lista, ufs);
      const { accessToken, caixa } = await acessoParaEnviar(admin);
      await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
      await admin.from('email_convocacao_config').update({ ultimo_envio_automatico: hoje }).eq('id', 1);
      return json({ enviado: true, colaboradores: lista.length, destinatarios: para.length });
    }

    // ---------- Manual (botão) ----------
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);
    const { data: pode } = await admin.rpc('has_permission', {
      _user_id: caller.profileId, _module: 'fichas_uniforme', _action: 'view',
    });
    if (!pode) return json({ error: 'Sem permissão para ver fichas de uniforme' }, 403);

    const para = Array.from(new Set((corpo.destinatarios ?? []).map((e: string) => String(e).trim().toLowerCase())))
      .filter((e: string) => EMAIL.test(e)) as string[];
    if (para.length === 0) return json({ error: 'Informe ao menos um e-mail válido' }, 400);
    const copia = (Array.from(new Set((corpo.copia ?? []).map((e: string) => String(e).trim().toLowerCase()))) as string[])
      .filter(e => EMAIL.test(e) && !para.includes(e));
    if (para.length + copia.length > 30) return json({ error: 'Máximo de 30 e-mails (destinatários + cópia)' }, 400);

    const { data: permitidos } = await admin.from('user_estados').select('uf').eq('user_id', caller.profileId);
    const meus = (permitidos ?? []).map((r: any) => r.uf);
    const ufs = corpo.uf ? meus.filter((u: string) => u === corpo.uf) : meus;
    if (ufs.length === 0) return json({ error: 'Sem acesso a esse estado' }, 403);

    const lista = await convocados(admin, ufs);
    const m = montarEmail(lista, ufs);
    const { accessToken, caixa } = await acessoParaEnviar(admin);
    await enviarComo(accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, caixa);
    return json({ enviado: true, colaboradores: lista.length, destinatarios: para.length, copia: copia.length });
  } catch (e) {
    if (e instanceof ErroMicrosoft) return json({ error: e.message }, 502);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
