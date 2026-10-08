import { describe, expect, it } from 'vitest';
import { calcularTrocasUniforme, criarClassificador } from '@/lib/convocacaoUniforme';
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

describe('criarClassificador', () => {
  it('pelo catálogo ou pela descrição digitada', () => {
    const tipo = criarClassificador(catalogo);
    expect(tipo({ epiId: 'luva', descricao: '' })).toBe('epi');
    expect(tipo({ epiId: undefined, descricao: 'GANDOLA EM RIP STOP AZUL' })).toBe('uniforme');
    expect(tipo({ epiId: undefined, descricao: 'Coisa desconhecida' })).toBeNull();
  });
});

describe('calcularTrocasUniforme', () => {
  it('troca 3 meses depois da assinatura', () => {
    const [c] = calcularTrocasUniforme([ficha({
      assinadoEm: '2026-07-01T13:00:00Z', itens: [item({ epiId: 'gandola', descricao: 'Gandola' })],
    })], catalogo, hoje);
    expect(c.dataAssinatura).toBe('2026-07-01');
    expect(c.dataTroca).toBe('2026-10-01');
    expect(c.situacao).toBe('vencido');
    expect(c.diasRestantes).toBe(-7);
  });

  it('próximo quando vence em até 30 dias; em dia depois disso', () => {
    const r = calcularTrocasUniforme([
      ficha({ cpf: '111.111.111-11', assinadoEm: '2026-07-20T12:00:00Z', itens: [item({ epiId: 'calca' })] }),
      ficha({ cpf: '222.222.222-22', assinadoEm: '2026-09-20T12:00:00Z', itens: [item({ epiId: 'calca' })] }),
    ], catalogo, hoje);
    expect(r.map(x => x.situacao)).toEqual(['proximo', 'em_dia']);
  });

  it('vale a ÚLTIMA ficha de uniforme assinada do colaborador (mesmo CPF)', () => {
    const r = calcularTrocasUniforme([
      ficha({ cpf: '123.456.789-00', assinadoEm: '2026-03-01T12:00:00Z', itens: [item({ epiId: 'gandola' })] }),
      ficha({ cpf: '12345678900', assinadoEm: '2026-09-01T12:00:00Z', itens: [item({ epiId: 'gandola' })] }),
    ], catalogo, hoje);
    expect(r).toHaveLength(1);
    expect(r[0].dataTroca).toBe('2026-12-01');
  });

  it('ignora pendente, ficha só de EPI e item não entregue', () => {
    const r = calcularTrocasUniforme([
      ficha({ status: 'pendente', itens: [item({ epiId: 'gandola' })] }),
      ficha({ nomeFuncionario: 'B', assinadoEm: '2026-08-01T12:00:00Z', itens: [item({ epiId: 'luva' })] }),
      ficha({ nomeFuncionario: 'C', assinadoEm: '2026-08-01T12:00:00Z', itens: [
        item({ epiId: 'luva', recebido: true }), item({ epiId: 'gandola', recebido: false })] }),
    ], catalogo, hoje);
    expect(r).toHaveLength(0);
  });

  it('assinada sem data registrada usa a data de entrega e avisa', () => {
    const [c] = calcularTrocasUniforme([ficha({
      assinadoEm: undefined, dataEntrega: '2026-08-15', itens: [item({ epiId: 'gandola' })],
    })], catalogo, hoje);
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
