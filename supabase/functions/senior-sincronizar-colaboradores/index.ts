// deno-lint-ignore-file
// Atualização automática da lista de colaboradores da Senior.
// Chamada pelo crontab da VM (3x ao dia, ver deploy/producao/configurar-senior.sh)
// com o header x-cron-secret; não é chamada pelo navegador.
import { serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior, mesmoSegredo } from '../_shared/seniorConfig.ts';
import { buscarEtapa, EMPRESAS_SENIOR, SeniorError } from '../_shared/senior.ts';

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
    const { etapa, empresa } = await req.json().catch(() => ({}));
    if (etapa === 'colaboradores') {
      const r = await buscarEtapa(cfg, { etapa });
      const { data, error } = await admin.rpc('sincronizar_colaboradores_senior', { _empresas: r.empresas, _dados: r.dados });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, ...data, segundos: segundos() });
    }
    if (etapa === 'postos') {
      const r = await buscarEtapa(cfg, { etapa, empresa: Number(empresa) });
      const { data, error } = await admin.rpc('senior_gravar_postos_escalas', { _empresa: r.empresa, _dados: r.dados });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, empresa: r.empresa, atualizados: data, segundos: segundos() });
    }
    if (etapa === 'descricoes') {
      // O Supabase devolve no máximo 1000 linhas por consulta: lê em páginas.
      const usados: any[] = [];
      for (let de = 0; ; de += 1000) {
        const { data: pagina, error: e1 } = await admin.from('colaboradores_senior')
          .select('posto_estrutura, posto_codigo, escala_codigo').eq('ativo', true).order('id').range(de, de + 999);
        if (e1) return json({ error: e1.message }, 500);
        usados.push(...(pagina ?? []));
        if (!pagina || pagina.length < 1000) break;
      }
      const r = await buscarEtapa(cfg, {
        etapa,
        postos: usados.filter((u: any) => u.posto_codigo).map((u: any) => `${u.posto_estrutura}|${u.posto_codigo}`),
        escalas: usados.map((u: any) => u.escala_codigo).filter(Boolean),
      });
      const { data, error } = await admin.rpc('senior_gravar_descricoes', { _postos: r.postos, _escalas: r.escalas });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, etapa, ...data, segundos: segundos() });
    }
    return json({ error: `Etapa inválida. Use colaboradores, postos (empresa ${EMPRESAS_SENIOR.join(' ou ')}) ou descricoes` }, 400);
  } catch (e: any) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    if (e?.name === 'TimeoutError') return json({ error: 'Senior não respondeu a tempo' }, 504);
    return json({ error: e.message || String(e) }, 500);
  }
});
