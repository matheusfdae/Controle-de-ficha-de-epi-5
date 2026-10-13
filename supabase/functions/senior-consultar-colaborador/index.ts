// deno-lint-ignore-file
import { verifyCaller, serviceClient, json, corsHeaders } from '../_shared/clerk.ts';
import { carregarSenior } from '../_shared/seniorConfig.ts';
import {
  consultarColaborador, consultarColaboradorPorCpf, cpfValido, escolherCadastro, postoEscalaDoColaborador, SeniorError,
} from '../_shared/senior.ts';


const inteiroPositivo = (v: unknown) => Number.isInteger(Number(v)) && Number(v) > 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const caller = await verifyCaller(req);
    if (!caller) return json({ error: 'Não autenticado' }, 401);

    const admin = serviceClient();
    const pode = async (module: string) =>
      (await admin.rpc('has_permission', { _user_id: caller.profileId, _module: module, _action: 'create' })).data === true;
    if (!(await pode('fichas_epi')) && !(await pode('fichas_uniforme'))) {
      return json({ error: 'Sem permissão para criar fichas' }, 403);
    }

    const { cfg } = await carregarSenior(serviceClient());
    if (!cfg) return json({ error: 'Integração Senior não configurada no servidor' }, 503);

    const { num_emp, tip_col = 1, num_cad, cpf } = await req.json();
    let c;
    if (cpf !== undefined) {
      if (!cpfValido(String(cpf))) return json({ error: 'CPF inválido' }, 400);
      c = escolherCadastro(await consultarColaboradorPorCpf(cfg, String(cpf)));
    } else {
      if (![num_emp, tip_col, num_cad].every(inteiroPositivo)) {
        return json({ error: 'Informe empresa, tipo e cadastro (números inteiros)' }, 400);
      }
      [c] = await consultarColaborador(cfg, {
        numEmp: Number(num_emp), tipCol: Number(tip_col), numCad: Number(num_cad),
      });
    }
    if (!c) return json({ error: 'Colaborador não encontrado na Senior' }, 404);

    const { error } = await admin.from('colaboradores_senior').upsert({
      num_emp: c.numEmp, tip_col: c.tipCol, num_cad: c.numCad, nome: c.nome,
      cpf: c.cpf, telefone: c.telefone, email: c.email, data_admissao: c.dataAdmissao,
      empresa_nome: c.empresaNome, cod_fil: c.codFil, razao_social: c.razaoSocial,
      cod_local: c.codLocal, nome_local: c.nomeLocal, cod_cargo: c.codCargo, cargo: c.cargo,
      cod_centro_custo: c.codCentroCusto, centro_custo: c.centroCusto,
      situacao: c.situacao, situacao_descricao: c.situacaoDescricao,
      data_afastamento: c.dataAfastamento, sincronizado_em: new Date().toISOString(),
    }, { onConflict: 'num_emp,tip_col,num_cad' });
    // O cache é conveniência: se falhar, a consulta em si continua valendo.
    if (error) console.error('colaboradores_senior upsert:', error.message);

    // Posto de trabalho e escala vêm de outra consulta; se falhar, segue sem eles.
    const posto = await postoEscalaDoColaborador(cfg, c).catch((e) => {
      console.error('posto/escala:', e?.message ?? e);
      return null;
    });
    return json({ colaborador: { ...c, ...posto } });
  } catch (e: any) {
    if (e instanceof SeniorError) return json({ error: e.message }, 502);
    if (e?.name === 'TimeoutError') return json({ error: 'Senior não respondeu a tempo' }, 504);
    if (e instanceof TypeError) return json({ error: `Não foi possível conectar à Senior: ${e.message}` }, 502);
    return json({ error: e.message || String(e) }, 500);
  }
});
