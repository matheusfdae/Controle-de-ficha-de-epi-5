import { describe, expect, it } from 'vitest';
import { gastoMensal, mesesAte, porEtapa, porPosto, situacao, tempoAteFaturar, tempoPorEtapa } from '@/modules/pedidos/lib/gerencial';
import type { PedidoCompleto } from '@/modules/pedidos/lib/pedidosService';

const pedido = (o: Partial<PedidoCompleto>): PedidoCompleto => ({
  id: 'p', codigo: 'SOL-2026-000001', ano: 2026, numero: 1, posto_id: 'a', uf: 'DF', recorrencia_id: null, data_pedido: '2026-10-01',
  status: 'faturada', valor_estimado: 100, valor_orcado: null, valor_real: null, excede_teto: false, sem_preco: false, tem_epi: false,
  data_aprovacao: '2026-10-02', faturada_em: null, cobrar_cliente: false, cobrado_em: null, cobranca_ref: null, observacao: null,
  solicitante_nome: 'X', solicitante_matricula: null, solicitante_cargo: null, solicitante_telefone: null, created_at: '2026-10-01T10:00:00Z',
  itens: [], eventos: [], compras: [], ...o,
});
const postos = [{ id: 'a', nome: 'A', uf: 'DF' }, { id: 'b', nome: 'B', uf: 'DF' }, { id: 'c', nome: 'C', uf: 'GO' }];
const tetos = [{ posto_id: 'a', vigente_desde: '2026-01-01', valor: 1000 }, { posto_id: 'b', vigente_desde: '2026-01-01', valor: 100 }];

describe('situação do teto', () => {
  it('faixas', () => {
    expect(situacao(700, 1000)).toBe('ok');
    expect(situacao(701, 1000)).toBe('atencao');
    expect(situacao(1000, 1000)).toBe('atencao');
    expect(situacao(1001, 1000)).toBe('acima');
    expect(situacao(5, null)).toBe('sem_teto');
  });
});

describe('porPosto', () => {
  const pedidos = [
    pedido({ id: '1', posto_id: 'a', valor_real: 800 }),
    pedido({ id: '2', posto_id: 'b', valor_orcado: 150, status: 'a_faturar' }),
    pedido({ id: '3', posto_id: 'b', valor_real: 999, cobrar_cliente: true }),
    pedido({ id: '4', posto_id: 'a', valor_real: 500, data_aprovacao: '2026-09-30' }),
    pedido({ id: '5', posto_id: 'a', valor_estimado: 300, status: 'em_orcamento', data_aprovacao: null }),
  ];
  it('gasto do mês, fora sob demanda e outros meses; ordena por uso', () => {
    const l = porPosto(pedidos, postos, tetos, '2026-10');
    expect(l.map(x => [x.id, x.gasto, x.situacao, x.uso])).toEqual([['b', 150, 'acima', 150], ['a', 800, 'atencao', 80]]);
  });
  it('gasto mensal com teto somado', () => {
    expect(gastoMensal(pedidos, postos, tetos, ['2026-09', '2026-10'])).toEqual([
      { mes: '2026-09', rotulo: 'set/26', gasto: 500, teto: 1100 }, { mes: '2026-10', rotulo: 'out/26', gasto: 950, teto: 1100 },
    ]);
  });
  it('etapas', () => {
    expect(porEtapa(pedidos).find(e => e.status === 'em_orcamento')?.pedidos).toBe(1);
  });
});

it('meses até o escolhido, virando o ano', () => {
  expect(mesesAte('2027-02', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
});

describe('tempos', () => {
  const ev = (para: string, em: string, de: string | null = null) =>
    ({ id: em, pedido_id: 'p', de_status: de, para_status: para, papel: null, comentario: null, payload: null, usuario_nome: null, created_at: em }) as PedidoCompleto['eventos'][number];
  const p = pedido({
    status: 'faturada', faturada_em: '2026-10-05T10:00:00Z',
    eventos: [
      ev('enviada', '2026-10-01T10:00:00Z'), ev('em_orcamento', '2026-10-02T10:00:00Z', 'enviada'),
      ev('em_orcamento', '2026-10-02T12:00:00Z', 'em_orcamento'), // anotação: não conta
      ev('a_faturar', '2026-10-03T22:00:00Z', 'em_orcamento'), ev('faturada', '2026-10-05T10:00:00Z', 'a_faturar'),
    ],
  });
  it('tempo médio por etapa ignora anotações', () => {
    expect(tempoPorEtapa([p]).map(t => [t.status, t.dias])).toEqual([['enviada', 1], ['em_orcamento', 1.5], ['aguardando_aprovacao', null], ['a_faturar', 1.5]]);
  });
  it('do envio ao faturamento', () => {
    expect(tempoAteFaturar([p], '2026-10')).toBe(4);
    expect(tempoAteFaturar([p], '2026-09')).toBeNull();
  });
});
