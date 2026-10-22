import { describe, expect, it } from 'vitest';
import { calcularTrocasUniforme, criarClassificador, criarRegraTroca, regraTexto } from '@/lib/convocacaoUniforme';
import { EPIFicha, EPIItem } from '@/types/epi';

const catalogo = [
  { id: 'gandola', nome: 'Gandola em Rip Stop Azul', tipo: 'uniforme' as const },
  { id: 'calca', nome: 'Calça em Rip Stop Azul', tipo: 'uniforme' as const },
  { id: 'luva', nome: 'Luvas de Raspa', tipo: 'epi' as const },
];

const item = (p: Partial<EPIItem>): EPIItem => ({
  id: crypto.randomUUID(), descricao: '', ca: '', quantidade: 1, tamanho: '', dataEntrega: '',
  postoServico: '', recebido: true, ...p,
});

const ficha = (p: Partial<EPIFicha>): EPIFicha => ({
  id: crypto.randomUUID(), nomeFuncionario: 'FULANO', funcao: 'VIGILANTE', telefone: '', motivo: 'admissao',
  turno: 'diurno', empresa: '', cpf: '', matricula: '', posto: 'TERRACAP', uf: 'DF', dataEntrega: '2026-01-01',
  itens: [], status: 'assinada', criadoEm: '2026-01-01T00:00:00Z', ...p,
});

const hoje = new Date(2026, 9, 8); // 08/10/2026
// TERRACAP: contrato com troca obrigatória a cada 3 meses (só para os testes de data).
const postos = [{ nome: 'TERRACAP', troca_uniforme_meses: 3, troca_uniforme_obrigatoria: true }];
const calcular = (fichas: EPIFicha[]) => calcularTrocasUniforme(fichas, catalogo, hoje, postos);

describe('criarClassificador', () => {
  it('pelo catálogo ou pela descrição digitada', () => {
    const tipo = criarClassificador(catalogo);
    expect(tipo({ epiId: 'luva', descricao: '' })).toBe('epi');
    expect(tipo({ epiId: undefined, descricao: 'GANDOLA EM RIP STOP AZUL' })).toBe('uniforme');
    expect(tipo({ epiId: undefined, descricao: 'Coisa desconhecida' })).toBeNull();
  });
});

describe('calcularTrocasUniforme', () => {
  it('troca no prazo do posto, depois da assinatura', () => {
    const [c] = calcular([ficha({
      assinadoEm: '2026-07-01T13:00:00Z', itens: [item({ epiId: 'gandola', descricao: 'Gandola' })],
    })]);
    expect(c.dataAssinatura).toBe('2026-07-01');
    expect(c.dataTroca).toBe('2026-10-01');
    expect(c.situacao).toBe('vencido');
    expect(c.diasRestantes).toBe(-7);
  });

  it('próximo quando vence em até 30 dias; em dia depois disso', () => {
    const r = calcular([
      ficha({ cpf: '111.111.111-11', assinadoEm: '2026-07-20T12:00:00Z', itens: [item({ epiId: 'calca' })] }),
      ficha({ cpf: '222.222.222-22', assinadoEm: '2026-09-20T12:00:00Z', itens: [item({ epiId: 'calca' })] }),
    ]);
    expect(r.map(x => x.situacao)).toEqual(['proximo', 'em_dia']);
  });

  it('vale a ÚLTIMA ficha de uniforme assinada do colaborador (mesmo CPF)', () => {
    const r = calcular([
      ficha({ cpf: '123.456.789-00', assinadoEm: '2026-03-01T12:00:00Z', itens: [item({ epiId: 'gandola' })] }),
      ficha({ cpf: '12345678900', assinadoEm: '2026-09-01T12:00:00Z', itens: [item({ epiId: 'gandola' })] }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].dataTroca).toBe('2026-12-01');
  });

  it('ignora pendente, ficha só de EPI e item não entregue', () => {
    const r = calcular([
      ficha({ status: 'pendente', itens: [item({ epiId: 'gandola' })] }),
      ficha({ nomeFuncionario: 'B', assinadoEm: '2026-08-01T12:00:00Z', itens: [item({ epiId: 'luva' })] }),
      ficha({ nomeFuncionario: 'C', assinadoEm: '2026-08-01T12:00:00Z', itens: [
        item({ epiId: 'luva', recebido: true }), item({ epiId: 'gandola', recebido: false })] }),
    ]);
    expect(r).toHaveLength(0);
  });

  it('assinada sem data registrada usa a data de entrega e avisa', () => {
    const [c] = calcular([ficha({
      assinadoEm: undefined, dataEntrega: '2026-08-15', itens: [item({ epiId: 'gandola' })],
    })]);
    expect(c.dataAssinatura).toBe('2026-08-15');
    expect(c.semDataAssinatura).toBe(true);
  });
});

describe('datas (fuso de Brasília)', () => {
  it('soma meses respeitando o fim do mês', async () => {
    const { somarMeses } = await import('../../supabase/functions/_shared/convocacaoUniforme');
    expect(somarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(somarMeses('2026-07-01', 3)).toBe('2026-10-01');
  });
  it('assinatura às 23h de Brasília continua no mesmo dia', async () => {
    const { dataBrasilia } = await import('../../supabase/functions/_shared/convocacaoUniforme');
    expect(dataBrasilia('2026-07-02T02:30:00Z')).toBe('2026-07-01');
  });
});

describe('prazo de troca por posto (contrato)', () => {
  const regraDe = criarRegraTroca([
    { nome: 'SESI GAMA', apelidos: ['SESI - GAMA'], troca_uniforme_meses: 6, troca_uniforme_obrigatoria: true },
    { nome: 'IDP NORTE', troca_uniforme_meses: 12, troca_uniforme_obrigatoria: false },
    { nome: 'SEM PRAZO', troca_uniforme_meses: null, troca_uniforme_obrigatoria: true },
  ]);

  it('acha o posto pelo nome ou apelido; sem cadastro ou sem prazo usa 12 meses', () => {
    expect(regraDe('sesi gama')).toEqual({ meses: 6, obrigatoria: true, definida: true, postoCadastro: 'SESI GAMA' });
    expect(regraDe('SESI - GAMA').meses).toBe(6);
    expect(regraDe('IDP NORTE')).toMatchObject({ meses: 12, obrigatoria: false, definida: true });
    expect(regraDe('SEM PRAZO')).toEqual({ meses: 12, obrigatoria: false, definida: false, postoCadastro: 'SEM PRAZO' });
    expect(regraDe('POSTO NOVO')).toEqual({ meses: 12, obrigatoria: false, definida: false });
    // Nome da Senior com a função no fim; e o primeiro nome que bate vale.
    expect(regraDe('IDP NORTE - AGENTE DE PORTARIA').postoCadastro).toBe('IDP NORTE');
    expect(regraDe('NÃO EXISTE', 'SESI GAMA').meses).toBe(6);
  });

  it('a data de troca usa o prazo do posto da última ficha', () => {
    const [a, b] = calcularTrocasUniforme([
      ficha({ cpf: '111.111.111-11', posto: 'SESI GAMA', assinadoEm: '2026-07-01T13:00:00Z', itens: [item({ epiId: 'gandola' })] }),
      ficha({ cpf: '222.222.222-22', posto: 'OUTRO', assinadoEm: '2026-07-01T13:00:00Z', itens: [item({ epiId: 'gandola' })] }),
    ], catalogo, hoje, [{ nome: 'SESI GAMA', troca_uniforme_meses: 6, troca_uniforme_obrigatoria: true }]);
    expect(a.dataTroca).toBe('2027-01-01');
    expect(regraTexto(a.regra)).toBe('Obrigatória · 6 meses');
    expect(b.dataTroca).toBe('2027-07-01');
    expect(regraTexto(b.regra)).toBe('Sem análise · 12 meses');
  });
});

describe('dados da Senior na convocação', () => {
  const postosT = [
    { nome: 'SESI GAMA', troca_uniforme_meses: 6, troca_uniforme_obrigatoria: true },
    { nome: 'TERRACAP', troca_uniforme_meses: 12, troca_uniforme_obrigatoria: false },
  ];
  const fichaUniforme = (p: Partial<EPIFicha>) => ficha({ assinadoEm: '2026-07-01T13:00:00Z', itens: [item({ epiId: 'gandola' })], ...p });

  it('usa o posto atual da Senior (pelo CPF), cargo e matrícula de lá', () => {
    const [c] = calcularTrocasUniforme([fichaUniforme({ cpf: '123.456.789-00', posto: 'TERRACAP', matricula: '' })],
      catalogo, hoje, postosT, [{
        num_cad: 1000514, cpf: '12345678900', cargo: 'ASG', ativo: true, uf: 'DF',
        posto_descricao: '0003-0001-SESI GAMA - ASG', nome_local: 'SESI',
      }]);
    expect(c.origem).toBe('senior');
    expect(c.posto).toBe('SESI GAMA');
    expect(c.regra.meses).toBe(6);
    expect(c.dataTroca).toBe('2027-01-01');
    expect([c.funcao, c.matricula]).toEqual(['ASG', '1000514']);
  });

  it('acha pela matrícula sem CPF; desligado sai; não achado usa a ficha', () => {
    const r = calcularTrocasUniforme([
      fichaUniforme({ nomeFuncionario: 'A', cpf: '', matricula: '3009888', posto: 'TERRACAP' }),
      fichaUniforme({ nomeFuncionario: 'B', cpf: '', matricula: '1000999', posto: 'TERRACAP' }),
      fichaUniforme({ nomeFuncionario: 'C', cpf: '', matricula: '1777777', posto: 'TERRACAP' }),
    ], catalogo, hoje, postosT, [
      { num_cad: 3009888, ativo: true, posto_descricao: '0001-0002-SESI GAMA' },
      { num_cad: 1000999, ativo: false, posto_descricao: '0001-0002-SESI GAMA' },
    ]);
    expect(r.map(t => [t.nome, t.origem, t.regra.meses])).toEqual([['A', 'senior', 6], ['C', 'ficha', 12]]);
  });
});
