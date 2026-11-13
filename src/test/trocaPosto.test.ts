import { describe, expect, it } from 'vitest';
import { envioParado, filtrarTrocas, nomePosto, postoDaMesmaEmpresa, previaSenior, type TrocaPosto } from '@/modules/trocaPosto/lib/trocaPostoService';
import { LIMITE_LEITURA_MS, LIMITE_SENIOR_MS, ehDemo, comHoraDaLeitura, erroEstrutura, motivosParaTentar, recusouMotivo, tentarMotivos, jaNoPostoNovo, liberadaNoLocalhost, lidoRecente, resumoEnvio, motivoSenior, parametrosDesfazer, parametrosEnvio, semResposta } from '../../supabase/functions/_shared/trocaPostoSenior';

const t = {
  id: '1', codigo: 'TP-AB12CD34', created_at: '2026-11-13T12:00:00Z', status: 'pendente',
  colaborador_senior_id: 'x', num_emp: 3, tip_col: 1, num_cad: 3008990, colaborador_nome: 'JOSÉ DA SILVA', cargo: 'HEAD', uf: 'DF',
  posto_atual_estrutura: 103, posto_atual_codigo: 'PO2178', posto_atual_descricao: 'TERRACAP SEDE', escala_atual_codigo: 10, escala_atual_nome: '12X36',
  local_atual: null, posto_novo_estrutura: 103, posto_novo_codigo: 'PO2202', posto_novo_descricao: 'RESERVA DF',
  escala_nova_codigo: null, escala_nova_nome: null, data_inicio: '2026-11-13', motivo: 'Remanejamento operacional', observacao: 'a pedido do cliente',
  solicitante_id: null, solicitante_nome: 'Fulano', decidido_por: null, decidido_nome: null, decidido_em: null, decisao_obs: null,
  senior_enviado_em: null, senior_resposta: null, motivo_senior: 998, manter_cargo: false, cargo_atual_codigo: '0148',
  centro_custo_atual: null, padrao_posto: null, senior_enviado_por: null, senior_desfeito_em: null, senior_lido: null,
} as TrocaPosto;

describe('troca de posto', () => {
  it('monta o envio do Posto_4 igual ao teste real de 13/11', () => {
    expect(parametrosEnvio(t)).toEqual({
      numEmp: 3, tipCol: 1, numCad: 3008990, iniAtu: '13/11/2026', posTra: 'PO2202', motPos: 998,
      obsPos: 'TP-AB12CD34 - Remanejamento operacional - a pedido do cliente', tipOpe: 'I',
    });
  });

  it('manter cargo manda codCar; escala nunca vai (codEsc faz a Senior recusar o 998)', () => {
    const p = parametrosEnvio({ ...t, manter_cargo: true, escala_nova_codigo: 8516 });
    expect(p.codCar).toBe('0148');
    expect(p).not.toHaveProperty('codEsc');
    expect(parametrosEnvio({ ...t, manter_cargo: true, cargo_atual_codigo: null }).codCar).toBeUndefined();
  });

  it('escala Permanente: manda só a turma atual, sem codEsc (teste real de 13/11)', () => {
    expect(parametrosEnvio(t, { escala: 8516, turma: 1 })).toEqual({
      numEmp: 3, tipCol: 1, numCad: 3008990, iniAtu: '13/11/2026', posTra: 'PO2202', motPos: 998,
      obsPos: 'TP-AB12CD34 - Remanejamento operacional - a pedido do cliente', tipOpe: 'I', codTma: 1,
    });
    expect(parametrosEnvio(t, { escala: 8516, turma: 3 }).codTma).toBe(3);
    // troca antiga com escala nova salva: continua sem codEsc, com a turma atual
    const p = parametrosEnvio({ ...t, escala_nova_codigo: 9000 }, { escala: 8516, turma: 3 });
    expect(p).not.toHaveProperty('codEsc');
    expect(p.codTma).toBe(3);
    // sem turma lida: 1; sem leitura: não manda
    expect(parametrosEnvio(t, { escala: 8516, turma: null }).codTma).toBe(1);
    expect(parametrosEnvio(t)).not.toHaveProperty('codTma');
  });

  it('recusa mostra o que foi enviado (sem a observação)', () => {
    expect(resumoEnvio(parametrosEnvio(t, { escala: 8516, turma: 1 })))
      .toBe('numEmp=3, tipCol=1, numCad=3008990, iniAtu=13/11/2026, posTra=PO2202, motPos=998, tipOpe=I, codTma=1');
  });

  it('leitura recente da conferência dispensa ler de novo no envio', () => {
    const agora = Date.parse('2026-11-13T19:00:00Z');
    const sit = { posto: 'PO0035', estrutura: 103, cargo: '0049', local: '13275', centroCusto: '2635', escala: 8516, turma: 1 };
    const lido = comHoraDaLeitura(sit, new Date(agora - 60000));
    expect(lidoRecente(lido, agora)).toEqual(sit);
    expect(lidoRecente(comHoraDaLeitura(sit, new Date(agora - 11 * 60000)), agora)).toBeNull(); // velha
    const { lido_em: _x, ...semHora } = lido!;
    expect(lidoRecente(semHora, agora)).toBeNull();
    const { turma: _t, ...semTurma } = lido!; // leitura de antes da turma
    expect(lidoRecente(semTurma, agora)).toBeNull();
    expect(lidoRecente({ erro_leitura: 'x', lido_em: lido!.lido_em }, agora)).toBeNull();
    expect(lidoRecente(null, agora)).toBeNull();
  });

  it('mudança de salário: 998 recusado no Mot. alt. -> tenta 002, depois 004', async () => {
    const RECUSA = 'Não foi possível atribuir o valor "998" para o campo "Mot. alt." da tela "FRHISCOL"';
    expect(recusouMotivo(RECUSA)).toBe(true);
    expect(recusouMotivo('É obrigatório informar turma')).toBe(false);
    expect(recusouMotivo(null)).toBe(false);
    expect(motivosParaTentar()).toEqual([998, 2, 4]);
    expect(motivosParaTentar(2)).toEqual([2, 998, 4]);   // desfazer: o que gravou primeiro
    expect(motivosParaTentar(77)).toEqual([998, 2, 4]);  // código desconhecido sai

    const chamados: number[] = [];
    const senior = (aceita: number | null, outro?: string) => async (m: number) => {
      chamados.push(m);
      if (outro) return outro;
      return m === aceita ? null : RECUSA.replace('998', String(m));
    };
    expect(await tentarMotivos(senior(998), [998, 2, 4], 48000)).toEqual({ erro: null, motivo: 998, tentados: [998] });
    chamados.length = 0;
    expect(await tentarMotivos(senior(2), [998, 2, 4], 48000)).toEqual({ erro: null, motivo: 2, tentados: [998, 2] });
    expect(chamados).toEqual([998, 2]);
    // recusa que não é do motivo: para na hora
    const r = await tentarMotivos(senior(null, 'É obrigatório informar turma'), [998, 2, 4], 48000);
    expect(r).toEqual({ erro: 'É obrigatório informar turma', motivo: 998, tentados: [998] });
    // nenhum passa: diz quais tentou
    const nenhum = await tentarMotivos(senior(null), [998, 2, 4], 48000);
    expect(nenhum.tentados).toEqual([998, 2, 4]);
    expect(nenhum.erro).toMatch(/motivos tentados: 998, 002, 004/);
    // sem tempo para outra tentativa (limite de 60 s da VM)
    let relogio = 0;
    const lento = async (m: number) => { relogio += 45000; return RECUSA.replace('998', String(m)); };
    expect((await tentarMotivos(lento, [998, 2, 4], 48000, () => relogio)).tentados).toEqual([998]);
  });

  it('já gravada na Senior: não reenvia', () => {
    expect(jaNoPostoNovo(t, { posto: 'PO2202', estrutura: 103 })).toBe(true);
    expect(jaNoPostoNovo(t, { posto: 'PO2202', estrutura: null })).toBe(true);
    expect(jaNoPostoNovo(t, { posto: 'PO2178', estrutura: 103 })).toBe(false);
    expect(jaNoPostoNovo(t, { posto: 'PO2202', estrutura: 101 })).toBe(false);
    expect(jaNoPostoNovo(t, null)).toBe(false);
  });

  it('leitura da turma + gravação cabem no limite de 60 s da VM', () => {
    expect(LIMITE_LEITURA_MS + Math.max(25000, LIMITE_SENIOR_MS - LIMITE_LEITURA_MS)).toBeLessThan(55000);
  });

  it('desfazer apaga com excHis', () => {
    expect(parametrosDesfazer(t)).toEqual({ numEmp: 3, tipCol: 1, numCad: 3008990, iniAtu: '13/11/2026', posTra: 'PO2202', motPos: 998, excHis: 'S', tipOpe: 'E' });
  });

  it('motivo da tela -> motivo da Senior', () => {
    // sempre 998 (Movimentação 5 Estrelas), qualquer motivo da tela
    expect(motivoSenior('Encerramento do posto')).toBe(998);
    expect(motivoSenior('Abertura de posto')).toBe(998);
    expect(motivoSenior('Promoção / mudança de função')).toBe(998);
    expect(motivoSenior('Pedido do cliente')).toBe(998);
    // troca antiga gravada no banco com outro código também vai com 998
    expect(parametrosEnvio({ ...t, motivo_senior: 4, motivo: 'Encerramento do posto' }).motPos).toBe(998);
    expect(parametrosEnvio({ ...t, motivo_senior: 2 }).motPos).toBe(998);
    expect(parametrosDesfazer({ ...t, motivo_senior: 10 }).motPos).toBe(998);
  });

  it('prévia mostra o motivo com o nome', () => {
    const p = Object.fromEntries(previaSenior(t).map(c => [c.campo, c.valor]));
    expect(p.motPos).toBe('998 - Movimentação 5 Estrelas');
    expect(p.iniAtu).toBe('13/11/2026');
  });

  it('nome do posto', () => {
    expect(nomePosto('TERRACAP SEDE', 1, '0101')).toBe('TERRACAP SEDE (1/0101)');
    expect(nomePosto(null, null, null)).toBe('sem posto na Senior');
  });

  it('filtra por status e texto sem acento', () => {
    const ts = [t, { ...t, id: '2', status: 'aprovada', colaborador_nome: 'MARIA' } as TrocaPosto];
    expect(filtrarTrocas(ts, 'todas', 'jose reserva')).toHaveLength(1);
    expect(filtrarTrocas(ts, 'aprovada', '')).toHaveLength(1);
    expect(filtrarTrocas(ts, 'pendente', 'maria')).toHaveLength(0);
  });
});

describe('travas do envio', () => {
  it('demo nunca vai; localhost só matrícula liberada', () => {
    expect(ehDemo({ codigo: 'TP-DEMO001' })).toBe(true);
    expect(ehDemo({ codigo: 'TP-AB12CD34' })).toBe(false);
    expect(liberadaNoLocalhost({ num_emp: 3, num_cad: 3008990 })).toBe(true);
    expect(liberadaNoLocalhost({ num_emp: 1, num_cad: 3008990 })).toBe(false);
    expect(liberadaNoLocalhost({ num_emp: 1, num_cad: 55 }, '3/3008990, 1/55')).toBe(true);
  });
});

describe('só dentro da mesma empresa', () => {
  it('lista: empresa 1 só vê posto da empresa 1; empresa 3 só da 3', () => {
    const p101 = { estrutura: 101, codigo: 'PO010380', descricao: 'TERRACAP', uf: 'DF', colaboradores: 4, empresas: [1] };
    const p103 = { estrutura: 103, codigo: 'PO2202', descricao: 'MARKETING', uf: 'DF', colaboradores: 1, empresas: [3] };
    const emp3 = { num_emp: 3, posto_estrutura: 103 };
    const emp1 = { num_emp: 1, posto_estrutura: 101 };
    expect(postoDaMesmaEmpresa(p103, emp3)).toBe(true);
    expect(postoDaMesmaEmpresa(p101, emp3)).toBe(false);
    expect(postoDaMesmaEmpresa(p101, emp1)).toBe(true);
    expect(postoDaMesmaEmpresa(p103, emp1)).toBe(false);
    expect(postoDaMesmaEmpresa({ ...p103, empresas: [4] }, emp3)).toBe(false);
    expect(postoDaMesmaEmpresa(p103, { num_emp: 3, posto_estrutura: null })).toBe(false);
  });

  it('envio: posto de outra empresa não vai', () => {
    expect(erroEstrutura({ posto_atual_estrutura: 103, posto_novo_estrutura: 103 })).toBeNull();
    expect(erroEstrutura({ posto_atual_estrutura: 103, posto_novo_estrutura: 101, num_emp: 3 })).toContain('entre empresas');
    expect(erroEstrutura({ posto_atual_estrutura: null, posto_novo_estrutura: 101 })).toContain('sem posto');
  });
});

describe('envio à Senior em passos curtos', () => {
  it('cada chamada à Senior para antes do limite de 60 s das funções da VM', () => {
    expect(LIMITE_SENIOR_MS).toBeLessThan(55000);
  });

  it('reconhece quando a Senior não respondeu (não dá para saber se gravou)', () => {
    const tempo = new Error('The signal has been aborted'); tempo.name = 'TimeoutError';
    expect(semResposta(tempo)).toBe(true);
    expect(semResposta(new TypeError('fetch failed'))).toBe(true);
    expect(semResposta(new Error('Senior: Não houve resultados'))).toBe(false);
  });

  it('"enviando" só libera reenvio depois de 3 minutos', () => {
    const agora = Date.parse('2026-11-13T14:00:00Z');
    expect(envioParado({ status: 'enviando', senior_envio_iniciado_em: '2026-11-13T13:58:30Z' }, agora)).toBe(false);
    expect(envioParado({ status: 'enviando', senior_envio_iniciado_em: '2026-11-13T13:56:00Z' }, agora)).toBe(true);
    expect(envioParado({ status: 'aprovada', senior_envio_iniciado_em: null }, agora)).toBe(false);
  });
});
