import { describe, expect, it } from 'vitest';
import { entregaParcial, gastoTeto, indicadores, mesesAte, pedidosPorMes, porEtapa, porPosto, tempoPorEtapa, topItens } from '@/modules/pedidos/lib/gerencial';
import type { Material, PedidoCompleto } from '@/modules/pedidos/lib/pedidosService';

type Evento = PedidoCompleto['eventos'][number];
type Item = PedidoCompleto['itens'][number];
const ev = (para: string, em: string, de: string | null = null) =>
  ({ id: em + para, pedido_id: 'p', de_status: de, para_status: para, papel: null, comentario: null, payload: null, usuario_nome: null, created_at: em }) as Evento;
const item = (material_id: string, quantidade: number, atendida: number | null = null): Item =>
  ({ id: material_id + quantidade, pedido_id: 'p', material_id, quantidade_pedida: quantidade, quantidade, quantidade_atendida: atendida, preco_unit: null });
const pedido = (o: Partial<PedidoCompleto>): PedidoCompleto => ({
  id: 'p', codigo: 'SOL-2026-000001', ano: 2026, numero: 1, posto_id: 'a', uf: 'DF', recorrencia_id: null, data_pedido: '2026-10-01',
  status: 'enviada', tem_epi: false, conferida_em: null, atendida_em: null, observacao: null, solicitante_nome: 'X', solicitante_matricula: null,
  solicitante_cargo: null, solicitante_telefone: null, created_at: '2026-10-01T10:00:00Z', valor_total: 0, sem_preco: false, itens: [], eventos: [], ...o,
});
const postos = [{ id: 'a', nome: 'A', uf: 'DF' }, { id: 'b', nome: 'B', uf: 'DF' }, { id: 'c', nome: 'C', uf: 'GO' }];
const materiais: Material[] = [
  { id: 'vas', nome: 'Vassoura', item_pai_id: null, unidade: 'un', categoria: null, is_epi: false, ativo: true, preco: null },
  { id: 'luva', nome: 'Luva', item_pai_id: null, unidade: 'par', categoria: null, is_epi: true, ativo: true, preco: null },
];

const atendido = pedido({
  id: '1', posto_id: 'a', status: 'atendida', atendida_em: '2026-10-05T10:00:00Z', tem_epi: true,
  itens: [item('vas', 10, 8), item('luva', 20, 20)],
  eventos: [ev('enviada', '2026-10-01T10:00:00Z'), ev('a_atender', '2026-10-02T10:00:00Z', 'enviada'),
    ev('a_atender', '2026-10-02T12:00:00Z', 'a_atender'), ev('atendida', '2026-10-05T10:00:00Z', 'a_atender')],
});
const pedidos = [
  atendido,
  pedido({ id: '2', posto_id: 'a', status: 'a_atender', itens: [item('vas', 2)], eventos: [ev('enviada', '2026-10-03T10:00:00Z'), ev('devolvida', '2026-10-03T11:00:00Z', 'enviada')] }),
  pedido({ id: '3', posto_id: 'b', status: 'enviada', data_pedido: '2026-10-20', itens: [item('luva', 5)] }),
  pedido({ id: '4', posto_id: 'b', status: 'cancelada', itens: [item('vas', 99)] }),
  pedido({ id: '5', posto_id: 'a', status: 'atendida', data_pedido: '2026-09-15', atendida_em: '2026-09-16T10:00:00Z', itens: [item('vas', 1, 1)] }),
];

describe('painel gerencial', () => {
  it('entrega parcial = entregou diferente do conferido', () => {
    expect(entregaParcial(atendido)).toBe(true);
    expect(entregaParcial(pedidos[4])).toBe(false);
    expect(entregaParcial(pedidos[1])).toBe(false);
  });

  it('por posto: pedidos do mês sem cancelados, ordenado do que mais pediu', () => {
    const l = porPosto(pedidos, postos, '2026-10');
    expect(l.map(x => [x.id, x.pedidos, x.linhas, x.atendidos, x.parciais, x.devolvidos, x.emAndamento])).toEqual([
      ['a', 2, 3, 1, 1, 1, 1], ['b', 1, 1, 0, 0, 0, 1],
    ]);
    expect(l[0].diasAtendimento).toBe(4);
  });

  it('indicadores do mês', () => {
    expect(indicadores(pedidos, '2026-10', '2026-09')).toEqual({
      pedidos: 3, pedidosAnterior: 1, emAndamento: 2, atendidos: 1, parciais: 1, devolvidos: 1, comEpi: 1, diasAtendimento: 4,
    });
  });

  it('feitos e atendidos por mês', () => {
    expect(pedidosPorMes(pedidos, ['2026-09', '2026-10'])).toEqual([
      { mes: '2026-09', rotulo: 'set/26', pedidos: 1, atendidos: 1 }, { mes: '2026-10', rotulo: 'out/26', pedidos: 3, atendidos: 1 },
    ]);
  });

  it('etapas abertas agora', () => {
    expect(porEtapa(pedidos).map(e => [e.status, e.pedidos])).toEqual([['enviada', 1], ['devolvida', 0], ['a_atender', 1]]);
  });

  it('itens mais pedidos: nº de pedidos e, no empate, a quantidade entregue (ou conferida)', () => {
    expect(topItens(pedidos, materiais, '2026-10')).toEqual([
      { id: 'luva', nome: 'Luva', unidade: 'par', pedidos: 2, quantidade: 25 },
      { id: 'vas', nome: 'Vassoura', unidade: 'un', pedidos: 2, quantidade: 10 },
    ]);
  });

  it('tempo por etapa ignora anotações', () => {
    expect(tempoPorEtapa([atendido]).map(t => [t.status, t.dias])).toEqual([['enviada', 1], ['a_atender', 3]]);
  });

  it('meses até o escolhido, virando o ano', () => {
    expect(mesesAte('2027-02', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('gastoTeto', () => {
  it('soma o valor do mês (sem cancelados), compara com o teto e põe quem passou primeiro', () => {
    const ps = [
      pedido({ id: '1', posto_id: 'a', valor_total: 300 }), pedido({ id: '2', posto_id: 'a', valor_total: 250, sem_preco: true }),
      pedido({ id: '3', posto_id: 'a', valor_total: 999, status: 'cancelada' }), pedido({ id: '4', posto_id: 'b', valor_total: 80 }),
      pedido({ id: '5', posto_id: 'b', valor_total: 500, data_pedido: '2026-09-30' }),
    ];
    const l = gastoTeto(ps, [
      { id: 'a', nome: 'A', uf: 'DF', teto_material: 500 }, { id: 'b', nome: 'B', uf: 'DF', teto_material: 100 },
      { id: 'c', nome: 'C', uf: 'GO', teto_material: null },
    ], '2026-10');
    expect(l.map(x => [x.id, x.gasto, x.pct, x.passou, x.semPreco])).toEqual([['a', 550, 110, true, 1], ['b', 80, 80, false, 0]]);
  });
});
