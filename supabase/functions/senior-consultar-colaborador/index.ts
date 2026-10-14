// deno-lint-ignore-file
// Busca de um colaborador para a Nova Ficha (por matrícula ou CPF).
//
// 1. Primeiro na lista já gravada (colaboradores_senior, atualizada 3x ao dia
//    com posto e escala): resposta na hora, sem depender da Senior.
// 2. Se não estiver lá (admitido depois da última atualização, desligado),
//    consulta a Senior; por matrícula, colaborador e posto/escala em paralelo.
//
// sem_posto: procura em lote (aba Fichas de Colaboradores Senior), sem as
// consultas de posto/escala na Senior.
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior } from '../_shared/seniorConfig.ts';
import {
  colaboradorDaLista, consultarColaborador, consultarColaboradorPorCpf, cpfValido, escolherCadastro,
  normalizeCpf, postoEscalaDoColaborador, SeniorError, type ColaboradorSenior,
} from '../_shared/senior.ts';

const inteiroPositivo = (v: unknown) => Number.isInteger(Number(v)) && Number(v) > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);

    const admin = serviceClient();
    const pode = async (module: string, action = 'create') =>
      (await admin.rpc('has_permission', { _user_id: caller.profileId, _module: module, _action: action })).data === true;
    // Nova Ficha (quem cria fichas) ou a procura das fichas sem dono em Colaboradores Senior.
    const permissoes = await Promise.all([pode('fichas_epi'), pode('fichas_uniforme'), pode('colaboradores', 'view')]);
    if (!permissoes.some(Boolean)) return json({ error: 'Sem permissão para consultar a Senior' }, 403);

    const { num_emp, tip_col = 1, num_cad, cpf, sem_posto } = await req.json();
    const porCpf = cpf !== undefined;
    if (porCpf && !cpfValido(String(cpf))) return json({ error: 'CPF inválido' }, 400);
    if (!porCpf && ![num_emp, tip_col, num_cad].every(inteiroPositivo)) {
      return json({ error: 'Informe empresa, tipo e cadastro (números inteiros)' }, 400);
    }

    // ---------- 1. Lista já gravada (só quem ainda está ativo nela) ----------
    let consulta = admin.from('colaboradores_senior').select('*').eq('ativo', true);
    consulta = porCpf
      ? consulta.eq('cpf', normalizeCpf(String(cpf)))
      : consulta.eq('num_emp', Number(num_emp)).eq('tip_col', Number(tip_col)).eq('num_cad', Number(num_cad));
    const { data: linhas, error: erroLista } = await consulta.limit(10);
    if (erroLista) console.error('colaboradores_senior:', erroLista.message);
    const daLista = escolherCadastro((linhas ?? []).map(colaboradorDaLista)) as
      (ReturnType<typeof colaboradorDaLista> | undefined);
    if (daLista) {
      const atualizadoEm = (linhas ?? []).find((l: any) => l.num_cad === daLista.numCad)?.sincronizado_em ?? null;
      return json({ colaborador: daLista, fonte: 'lista', atualizadoEm });
    }

    // ---------- 2. Senior ----------
    const { cfg } = await carregarSenior(admin);
    if (!cfg) return json({ error: 'Integração Senior não configurada no servidor' }, 503);
    const semPostoNaSenior = (e: any) => {
      console.error('posto/escala:', e?.message ?? e);
      return null;
    };

    let c: ColaboradorSenior | undefined;
    let posto = null;
    if (porCpf) {
      c = escolherCadastro(await consultarColaboradorPorCpf(cfg, String(cpf)));
      if (c && !sem_posto) posto = await postoEscalaDoColaborador(cfg, c).catch(semPostoNaSenior);
    } else {
      const m = { numEmp: Number(num_emp), tipCol: Number(tip_col), numCad: Number(num_cad) };
      // Pela matrícula já se sabe quem é: colaborador e posto/escala ao mesmo tempo.
      const [lista, p] = await Promise.all([
        consultarColaborador(cfg, m),
        sem_posto ? Promise.resolve(null) : postoEscalaDoColaborador(cfg, m).catch(semPostoNaSenior),
      ]);
      c = lista[0];
      posto = p;
    }
    if (!c) return json({ error: 'Colaborador não encontrado na Senior' }, 404);
    // Não grava em colaboradores_senior: a lista vem da atualização automática
    // (aqui um demitido achado pelo CPF entraria como ativo).
    return json({ colaborador: { ...c, ...posto }, fonte: 'senior' });
  } catch (e: any) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    if (e?.name === 'TimeoutError') return json({ error: 'Senior não respondeu a tempo' }, 504);
    if (e instanceof TypeError) return json({ error: `Não foi possível conectar à Senior: ${e.message}` }, 502);
    return json({ error: e.message || String(e) }, 500);
  }
});
