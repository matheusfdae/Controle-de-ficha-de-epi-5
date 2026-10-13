// deno-lint-ignore-file
// Atualização automática da lista de colaboradores da Senior, uma parte por
// chamada (cada uma cabe no limite de 60 s das Edge Functions da VM).
// Chamada pelo agendador da VM (deploy/producao/senior-atualizar.sh, 3x ao dia)
// com o header x-cron-secret; não é chamada pelo navegador.
//
// Corpo:
//   { etapa: 'colaboradores', empresa, periodo }   periodo = 0, 1 ou 2 (admissão)
//   { etapa: 'finalizar', empresa, desde }         marca os desligados (só se tudo deu certo)
//   { etapa: 'postos', empresa, parte }            lote de 400 matrículas; responde "partes"
//   { etapa: 'descricoes' }                        nomes dos postos e escalas
import { serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior, mesmoSegredo } from '../_shared/seniorConfig.ts';
import {
  buscarEtapa, emLotes, EMPRESAS_SENIOR, MATRICULAS_POR_LOTE, SeniorError,
} from '../_shared/senior.ts';

/** Lê todas as linhas (o Supabase devolve no máximo 1000 por consulta). */
async function lerTudo(consulta: (de: number, ate: number) => any): Promise<any[]> {
  const todas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) return todas;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const admin = serviceClient();
  const { cfg, cronSecret } = await carregarSenior(admin);
  const recebido = req.headers.get('x-cron-secret') ?? '';
  if (!cronSecret || !mesmoSegredo(recebido, cronSecret)) return json({ error: 'Não autorizado' }, 401);
  if (!cfg) return json({ error: 'Integração Senior não configurada no servidor' }, 503);

  const inicio = Date.now();
  const segundos = () => Math.round((Date.now() - inicio) / 1000);
  try {
    const { etapa, empresa: e, periodo, parte, desde } = await req.json().catch(() => ({}));
    const empresa = Number(e);
    if (etapa !== 'descricoes' && !EMPRESAS_SENIOR.includes(empresa)) {
      return json({ error: `Empresa inválida. Use ${EMPRESAS_SENIOR.join(' ou ')}` }, 400);
    }

    if (etapa === 'colaboradores') {
      const r = await buscarEtapa(cfg, { etapa, empresa, periodo: Number(periodo) });
      const { data, error } = await admin.rpc('sincronizar_colaboradores_senior', {
        _empresas: [empresa], _dados: r.dados, _inativar: false,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, empresa, periodo: Number(periodo), gravados: data?.gravados, segundos: segundos() });
    }

    if (etapa === 'finalizar') {
      const { data, error } = await admin.rpc('senior_inativar_ausentes', { _empresa: empresa, _desde: desde });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, empresa, inativados: data, segundos: segundos() });
    }

    if (etapa === 'postos') {
      const linhas = await lerTudo((de, ate) => admin.from('colaboradores_senior')
        .select('num_cad').eq('num_emp', empresa).eq('ativo', true).order('num_cad').range(de, ate));
      const lotes = emLotes(linhas.map((l: any) => l.num_cad as number), MATRICULAS_POR_LOTE);
      const n = Number(parte) || 0;
      if (n >= lotes.length) return json({ ok: true, etapa, empresa, parte: n, partes: lotes.length, atualizados: 0 });
      const r = await buscarEtapa(cfg, { etapa, empresa, matriculas: lotes[n] });
      const { data, error } = await admin.rpc('senior_gravar_postos_escalas', { _empresa: empresa, _dados: r.dados });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, empresa, parte: n, partes: lotes.length, atualizados: data, segundos: segundos() });
    }

    if (etapa === 'descricoes') {
      // Só os nomes que faltam (código novo ou trocado), no máximo 300 postos por chamada.
      const sem = await lerTudo((de, ate) => admin.from('colaboradores_senior')
        .select('posto_estrutura, posto_codigo, posto_descricao, escala_codigo, escala_nome').eq('ativo', true)
        .or('and(posto_codigo.not.is.null,posto_descricao.is.null),and(escala_codigo.not.is.null,escala_nome.is.null)')
        .order('id').range(de, ate));
      const postos = [...new Set(sem.filter((u: any) => u.posto_codigo && !u.posto_descricao)
        .map((u: any) => `${u.posto_estrutura}|${u.posto_codigo}`))];
      const escalas = [...new Set(sem.filter((u: any) => u.escala_codigo && !u.escala_nome).map((u: any) => u.escala_codigo))];
      if (!postos.length && !escalas.length) return json({ ok: true, etapa, faltam: 0, postos: 0, escalas: 0 });
      const r = await buscarEtapa(cfg, { etapa, postos: postos.slice(0, 300), escalas: escalas.slice(0, 150) });
      const { data, error } = await admin.rpc('senior_gravar_descricoes', { _postos: r.postos, _escalas: r.escalas });
      if (error) return json({ error: error.message }, 500);
      const faltam = Math.max(0, postos.length - 300) + Math.max(0, escalas.length - 150);
      return json({ ok: true, etapa, ...data, faltam, segundos: segundos() });
    }

    return json({ error: 'Etapa inválida: use colaboradores, finalizar, postos ou descricoes' }, 400);
  } catch (e: any) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    if (e?.name === 'TimeoutError') return json({ error: 'Senior não respondeu a tempo' }, 504);
    return json({ error: e.message || String(e) }, 500);
  }
});
