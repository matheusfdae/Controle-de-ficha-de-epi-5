import { describe, expect, it } from 'vitest';
import { casarPrecos, lerAbaPrecos, lerPreco } from '@/modules/pedidos/lib/planilhaPrecos';

describe('lerPreco', () => {
  it('número, R$ com vírgula e milhar', () => {
    expect(lerPreco(12.9)).toBe(12.9);
    expect(lerPreco('R$ 1.234,56')).toBe(1234.56);
    expect(lerPreco('3,5')).toBe(3.5);
    expect(lerPreco('7.25')).toBe(7.25);
    expect(lerPreco('a combinar')).toBeNull();
    expect(lerPreco(null)).toBeNull();
  });
});

describe('lerAbaPrecos', () => {
  it('acha o cabeçalho, prefere preço unitário ao total e avisa preço ilegível', () => {
    const r = lerAbaPrecos('Preços', [
      ['Tabela de preços 2026'],
      [],
      ['Cód', 'Descrição do item', 'Unid.', 'Preço unitário', 'Valor total'],
      [1, 'AGUA SANITARIA 5LT QBOA ORIGINAL', 'galão', 'R$ 9,90', 99],
      [2, 'Luva nitrílica', 'par', 3.2, 32],
      [3, 'Item sem preço', 'un', null, null],
      [4, 'Item ruim', 'un', 'consultar', null],
    ]);
    expect(r.itens.map(i => [i.nome, i.preco])).toEqual([['AGUA SANITARIA 5LT QBOA ORIGINAL', 9.9], ['Luva nitrílica', 3.2]]);
    expect(r.avisos).toEqual(['Preços linha 7: preço ilegível em "Item ruim"']);
  });
  it('aba sem colunas de item e preço: nada', () => {
    expect(lerAbaPrecos('MENU', [['MENU'], ['Postos']]).itens).toEqual([]);
  });
});

describe('casarPrecos', () => {
  it('liga ao catálogo sem acento/pontuação; o que não existe fica de fora', () => {
    const lidos = [
      { nome: 'agua sanitaria 5lt qboa original', preco: 9.9, aba: 'A', linha: 2 },
      { nome: 'Detergente — 5 L', preco: 20, aba: 'A', linha: 3 },
      { nome: 'Nada disso', preco: 1, aba: 'A', linha: 4 },
    ];
    const r = casarPrecos(lidos, [{ nome: 'ÁGUA SANITÁRIA 5LT QBOA ORIGINAL' }, { nome: 'Detergente — 5 L' }]);
    expect(r.achados.map(a => [a.nome, a.preco])).toEqual([['ÁGUA SANITÁRIA 5LT QBOA ORIGINAL', 9.9], ['Detergente — 5 L', 20]]);
    expect(r.naoAchados.map(n => n.nome)).toEqual(['Nada disso']);
  });
});
