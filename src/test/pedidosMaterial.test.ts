import { describe, expect, it } from 'vitest';
import {
  catalogoDoPosto, chavePeriodo, classificarVariacao, materiaisPediveis, nomeMaterial, serieGastos, tetoNoMes,
  valorDoPedido, variacaoTabela, type Material,
} from '@/modules/pedidos/lib/pedidosService';

const tetos = [
  { posto_id: 'a', vigente_desde: '2026-01-01', valor: 100000 },
  { posto_id: 'a', vigente_desde: '2026-10-01', valor: 120000 },
  { posto_id: 'b', vigente_desde: '2026-11-01', valor: 5000 },
];

describe('tetoNoMes', () => {
  it('usa a última definição com vigência até o mês', () => {
    expect(tetoNoMes(tetos, 'a', '2026-09-30')).toBe(100000);
    expect(tetoNoMes(tetos, 'a', '2026-10-15')).toBe(120000);
    expect(tetoNoMes(tetos, 'a', '2027-02-01')).toBe(120000);
  });
  it('sem definição antes do mês = sem teto', () => {
    expect(tetoNoMes(tetos, 'b', '2026-10-31')).toBeNull();
    expect(tetoNoMes(tetos, 'x', '2026-10-31')).toBeNull();
  });
});

describe('valorDoPedido', () => {
  it('real da compra vence o estimado', () => {
    expect(valorDoPedido({ valor_real: 140, valor_estimado: 100 })).toBe(140);
    expect(valorDoPedido({ valor_real: null, valor_estimado: 100 })).toBe(100);
  });
});

describe('chavePeriodo', () => {
  it('quinzena: dias 1–15 e 16–fim', () => {
    expect(chavePeriodo('2026-10-15', 'quinzena')).toBe('2026-10-01');
    expect(chavePeriodo('2026-10-16', 'quinzena')).toBe('2026-10-16');
    expect(chavePeriodo('2026-10-31', 'mes')).toBe('2026-10-01');
  });
});

describe('serieGastos', () => {
  const pedidos = [
    { data_aprovacao: '2026-09-30', valor_real: null, valor_estimado: 50 },
    { data_aprovacao: '2026-10-01', valor_real: null, valor_estimado: 100 },
    { data_aprovacao: '2026-10-01', valor_real: 30.1, valor_estimado: 20 },
    { data_aprovacao: '2026-10-20', valor_real: null, valor_estimado: 70 },
    { data_aprovacao: null, valor_real: null, valor_estimado: 999 },
  ];
  const teto = (mes: string) => tetoNoMes(tetos, 'a', mes);

  it('diário: todos os dias, acumulado do mês e teto', () => {
    const s = serieGastos(pedidos, '2026-10-01', '2026-10-31', 'dia', teto);
    expect(s).toHaveLength(31);
    expect(s[0]).toMatchObject({ chave: '2026-10-01', rotulo: '01/10', gasto: 130.1, acumulado: 130.1, teto: 120000 });
    expect(s[19]).toMatchObject({ gasto: 70, acumulado: 200.1 });
    expect(s[30].acumulado).toBe(200.1);
  });

  it('quinzenal atravessando meses zera o acumulado na virada', () => {
    const s = serieGastos(pedidos, '2026-09-01', '2026-10-31', 'quinzena', teto);
    expect(s.map(p => p.chave)).toEqual(['2026-09-01', '2026-09-16', '2026-10-01', '2026-10-16']);
    expect(s.map(p => p.gasto)).toEqual([0, 50, 130.1, 70]);
    expect(s.map(p => p.acumulado)).toEqual([0, 50, 130.1, 200.1]);
    expect(s[1].teto).toBe(100000);
  });

  it('mensal atravessando o ano', () => {
    const s = serieGastos(pedidos, '2026-09-01', '2027-01-31', 'mes', teto);
    expect(s.map(p => p.rotulo)).toEqual(['set/26', 'out/26', 'nov/26', 'dez/26', 'jan/27']);
    expect(s[1].gasto).toBe(200.1);
  });
});

describe('classificarVariacao', () => {
  it('aumento de 40% (R$ 10 -> R$ 14)', () => {
    expect(classificarVariacao(14, 10)).toEqual({ tipo: 'aumentou', percentual: 40 });
  });
  it('baixa, mesmo preço e primeira compra', () => {
    expect(classificarVariacao(9.5, 10)).toEqual({ tipo: 'baixou', percentual: -5 });
    expect(classificarVariacao(10.0001, 10.0001)).toEqual({ tipo: 'manteve', percentual: 0 });
    expect(classificarVariacao(10, null)).toEqual({ tipo: 'primeira', percentual: null });
  });
  it('diferença de 1 centésimo de centavo conta', () => {
    expect(classificarVariacao(10.0001, 10).tipo).toBe('aumentou');
  });
});

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
  it('posto sob demanda só vê os itens liberados', () => {
    const cat = [{ id: 'a', nome: 'A', unidade: 'un', categoria: null, grupo: null }, { id: 'b', nome: 'B', unidade: 'un', categoria: null, grupo: null }];
    expect(catalogoDoPosto(cat, { id: 'p', nome: 'P', uf: 'DF', sob_demanda: true, itens: ['b'] }).map(x => x.id)).toEqual(['b']);
    expect(catalogoDoPosto(cat, { id: 'p', nome: 'P', uf: 'DF', sob_demanda: false, itens: null })).toHaveLength(2);
  });
});

it('orçado x tabela', () => {
  expect(variacaoTabela(14, 10)).toBe(40);
  expect(variacaoTabela(9.5, 10)).toBe(-5);
  expect(variacaoTabela(10, null)).toBeNull();
});

it('valor que conta no teto: nota, orçado, estimado', () => {
  expect(valorDoPedido({ valor_real: null, valor_orcado: 95, valor_estimado: 100 })).toBe(95);
  expect(valorDoPedido({ valor_real: 90, valor_orcado: 95, valor_estimado: 100 })).toBe(90);
});
