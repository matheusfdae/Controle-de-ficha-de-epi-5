import { describe, expect, it } from 'vitest';
import { catalogoDoPosto, materiaisPediveis, nomeMaterial, proximaData, type Material } from '@/modules/pedidos/lib/pedidosService';

describe('catálogo', () => {
  const m = (id: string, nome: string, o: Partial<Material> = {}): Material =>
    ({ id, nome, item_pai_id: null, unidade: 'un', categoria: null, is_epi: false, ativo: true, ...o });
  const todos = [
    m('det', 'Detergente'), m('d500', '500 ml', { item_pai_id: 'det' }), m('d5', '5 L', { item_pai_id: 'det', ativo: false }),
    m('vas', 'Vassoura'), m('rodo', 'Rodo', { ativo: false }),
    m('cera', 'Cera', { ativo: false }), m('c1', '1 L', { item_pai_id: 'cera' }),
  ];
  it('nome com o pai', () => {
    expect(nomeMaterial(todos[1], todos)).toBe('Detergente — 500 ml');
    expect(nomeMaterial(todos[3], todos)).toBe('Vassoura');
  });
  it('pai com variação ativa só agrupa; variação de pai inativo some', () => {
    expect(materiaisPediveis(todos).map(x => x.id)).toEqual(['d500', 'vas']);
  });
  it('posto com lista só vê a lista; sem lista vê tudo', () => {
    const cat = [{ id: 'a', nome: 'A', unidade: 'un', categoria: null, grupo: null }, { id: 'b', nome: 'B', unidade: 'un', categoria: null, grupo: null }];
    expect(catalogoDoPosto(cat, { id: 'p', nome: 'P', uf: 'DF', itens: ['b'] }).map(x => x.id)).toEqual(['b']);
    expect(catalogoDoPosto(cat, { id: 'p', nome: 'P', uf: 'DF', itens: [] })).toHaveLength(0);
    expect(catalogoDoPosto(cat, { id: 'p', nome: 'P', uf: 'DF', itens: null })).toHaveLength(2);
  });
});

describe('repetição', () => {
  it('próxima data por frequência', () => {
    expect(proximaData('2026-10-30', 'diaria')).toBe('2026-10-31');
    expect(proximaData('2026-10-30', 'semanal')).toBe('2026-11-06');
    expect(proximaData('2026-10-30', 'quinzenal')).toBe('2026-11-13');
    expect(proximaData('2026-12-15', 'mensal')).toBe('2027-01-15');
    expect(proximaData('2027-01-31', 'mensal')).toBe('2027-02-28');
  });
});
