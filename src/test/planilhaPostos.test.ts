import { describe, expect, it } from 'vitest';
import { acharPosto, chaveNome, lerAba, ufSugerida, unidadeDaQuantidade, type Celula } from '@/modules/pedidos/lib/planilhaPostos';

// Grade no formato das abas reais (colunas B=ORD, C=ITEM, E..P = JAN..DEZ).
const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const linha = (ord: Celula, item: Celula, qtds: Celula[] = [], a: Celula = null): Celula[] => [a, ord, item, null, ...qtds];
const grade: Celula[][] = [
  [],
  [null, null, null, 'PEDIDO DE MATERIAL - Rev.00'],
  [null, 'ORD', 'ITEM', null, 'POSTO: VITÓRIA - SÃO PEDRO', null, null, null, null, null, 'CUSTO EM CONTRATO: R$ 41.517,93'],
  [null, null, null, null, ...meses],
  linha(1, 'ALCOOL GEL HGAB 800ML RF SANTHER', ['36 rf', null, '40 rf', null, '20 rf']),
  linha(2, 'BALDE  C/ALCA 4L', ['02 und']),
  linha(null, 'AGUA SANITARIA 12X1LT YPE'),                 // sem ordem, maiúsculas: é item
  linha(null, 'PANO MICROFIBRA VERDE 70x98 PRIMEPRO'),       // "x" minúsculo não faz virar anotação
  linha(3, 'alcool gel hgab 800ml rf santher'),             // repetido (mesma chave)
  linha(4, 'HC CLEAN'),                                     // rótulo
  linha(null, 'O Contrato encerrado no dia 09/06/2026'),    // anotação
  linha(57, 'ITEM', meses, 'OMNI'),                         // subseção
  linha(58, 'PAPEL TOALHA EXCELENCE INT18X150F', [5]),
  [null, 'VALOR   PREVISTO  (R$):', null, null, 41517.93],
  [null, 'VARIAÇÃO R$', null, null, 10],
  ['EQUIPAMENTOS'],
  ['QTD', 'DESCRIÇÃO', null, 'UN. (R$)'],
  [2, 'CARRO FUNC. PLAST.C/B VINIL PTO PRIMEPRO', null, 599],
];

describe('lerAba', () => {
  const a = lerAba('VITÓRIA - SÃO PEDRO ', grade)!;
  it('posto, estado e teto', () => {
    expect(a).toMatchObject({ aba: 'VITÓRIA - SÃO PEDRO', posto: 'VITÓRIA - SÃO PEDRO', uf: 'ES', teto: 41517.93 });
  });
  it('itens: sem rótulos, anotações, totais, repetidos nem equipamentos', () => {
    expect(a.itens.map(i => i.nome)).toEqual([
      'ALCOOL GEL HGAB 800ML RF SANTHER', 'BALDE C/ALCA 4L', 'AGUA SANITARIA 12X1LT YPE', 'PANO MICROFIBRA VERDE 70x98 PRIMEPRO', 'PAPEL TOALHA EXCELENCE INT18X150F',
    ]);
  });
  it('unidade pelas quantidades e subseção', () => {
    expect(a.itens[0].unidade).toBe('refil');
    expect(a.itens[1].unidade).toBe('un');
    expect(a.itens[2].unidade).toBeNull();
    expect(a.itens[4].secao).toBe('OMNI');
    expect(a.avisos.join(' ')).toMatch(/repetido.*anotação|anotação.*repetido|Subseção "OMNI"/s);
  });
  it('aba MENU e aba sem cabeçalho', () => {
    expect(lerAba('MENU', grade)).toBeNull();
    expect(lerAba('X', [['nada']])!.avisos[0]).toMatch(/Cabeçalho/);
  });
  it('sem custo em contrato = teto vazio com aviso', () => {
    const g = grade.map(l => l.map(v => (typeof v === 'string' && v.startsWith('CUSTO') ? null : v)));
    const b = lerAba('BASE', g)!;
    expect(b.teto).toBeNull();
    expect(b.avisos[0]).toMatch(/CUSTO EM CONTRATO/);
  });
});

it('unidade da quantidade', () => {
  expect(unidadeDaQuantidade('2cx')).toBe('caixa');
  expect(unidadeDaQuantidade('03 gl')).toBe('galão');
  expect(unidadeDaQuantidade(12)).toBeNull();
  expect(unidadeDaQuantidade('00/00/00')).toBeUndefined();
  expect(unidadeDaQuantidade(new Date())).toBeUndefined();
});

it('estado sugerido', () => {
  expect(ufSugerida('HOSP. JATAÍ', 'HOSPITAL JATAÍ')).toBe('GO');
  expect(ufSugerida('NDB - SÃO PAULO', 'NDB - SP')).toBe('SP');
  expect(ufSugerida('CNI', 'CNI (EAN e ERS)')).toBe('DF');
});

it('acha o posto cadastrado pelo nome', () => {
  const postos = [{ id: '1', nome: 'Embaixada da Itália', uf: 'DF' }, { id: '2', nome: 'CNI', uf: 'DF' }, { id: '3', nome: 'Hospital Jataí', uf: 'GO' }];
  const a = (aba: string, posto: string) => acharPosto({ aba, posto, uf: 'DF', teto: null, itens: [], avisos: [] }, postos)?.id ?? null;
  expect(a('EMB. ITÁLIA', 'EMBAIXADA DA ITÁLIA')).toBe('1');
  expect(a('HOSP. JATAÍ', 'HOSPITAL JATAÍ')).toBe('3');
  expect(a('CNI', 'CNI (EAN e ERS)')).toBe('2');
  expect(a('MILLS', 'MILLS')).toBeNull();
  expect(chaveNome(' Água  Sanitária ')).toBe('AGUA SANITARIA');
});
