import { describe, expect, it } from 'vitest';
import { acimaDaMedia, compararComAnterior, mediaUltimos, type PedidoAnterior } from '@/modules/pedidos/lib/mediaPedidos';

const ped = (codigo: string, status: string, valor: number, itens: [string, number, number | null][]): PedidoAnterior => ({
  id: codigo, codigo, data_pedido: '2026-10-01', status, valor_total: valor,
  itens: itens.map(([material_id, quantidade, quantidade_atendida]) => ({ material_id, quantidade, quantidade_atendida, quantidade_pedida: quantidade })),
});

describe('média dos últimos 3 pedidos', () => {
  const ultimos = [
    ped('P3', 'atendida', 300, [['agua', 4, 3], ['alcool', 6, null]]),   // atendido: conta o entregue (3)
    ped('P2', 'a_atender', 200, [['agua', 6, null]]),                    // sem álcool: conta 0
    ped('P1', 'atendida', 100, [['agua', 3, 3], ['alcool', 3, 3]]),
  ];
  it('quantidade média por pedido (pedido sem o item conta 0)', () => {
    const m = mediaUltimos(ultimos);
    expect(m.pedidos).toBe(3);
    expect(m.porItem.get('agua')!.media).toBe(4);
    expect(m.porItem.get('alcool')!.media).toBe(3);
    expect(m.porItem.get('alcool')!.valores.map(v => v.quantidade)).toEqual([6, 0, 3]);
    expect(m.valorMedio).toBe(200);
  });
  it('sem pedidos antes', () => {
    expect(mediaUltimos([])).toMatchObject({ pedidos: 0, valorMedio: null });
  });
  it('acima da média = mais de 50% acima (ou item que não vinha)', () => {
    expect(acimaDaMedia(6, 4)).toBe(false);
    expect(acimaDaMedia(7, 4)).toBe(true);
    expect(acimaDaMedia(2, 0)).toBe(true);
    expect(acimaDaMedia(2, undefined)).toBe(false);
  });
});

describe('comparação com o pedido anterior', () => {
  const anterior = ped('P9', 'atendida', 0, [['agua', 4, 4], ['alcool', 6, 6], ['saco', 2, 2]]);
  it('itens iguais, que aumentaram, diminuíram, novos e que saíram', () => {
    const c = compararComAnterior([
      { material_id: 'agua', quantidade_pedida: 4 },   // igual
      { material_id: 'alcool', quantidade_pedida: 9 }, // +3
      { material_id: 'pano', quantidade_pedida: 5 },   // novo
    ], anterior)!;
    expect(c.anterior.codigo).toBe('P9');
    expect(c.porItem.get('agua')).toEqual({ antes: 4, agora: 4, dif: 0, novo: false });
    expect(c.porItem.get('alcool')).toEqual({ antes: 6, agora: 9, dif: 3, novo: false });
    expect(c.porItem.get('pano')).toEqual({ antes: 0, agora: 5, dif: 5, novo: true });
    expect(c.sairam).toEqual([{ material_id: 'saco', antes: 2 }]);
    expect(c).toMatchObject({ iguais: 1, aumentaram: 1, diminuiram: 0, novos: 1, totalAntes: 12, totalAgora: 18 });
  });
  it('sem pedido anterior', () => {
    expect(compararComAnterior([{ material_id: 'agua', quantidade_pedida: 1 }], undefined)).toBeNull();
  });
});

describe('historicoPorItem (link do líder)', () => {
  const item = (material_id: string, nome: string, pedida: number, atendida: number | null = null) =>
    ({ material_id, nome, unidade: 'un', quantidade: pedida, quantidade_pedida: pedida, quantidade_atendida: atendida });

  it('monta uma linha por item, com o que foi pedido em cada pedido e a média', async () => {
    const { historicoPorItem } = await import('@/modules/pedidos/lib/mediaPedidos');
    const linhas = historicoPorItem([
      { status: 'enviada', itens: [item('a', 'Álcool', 6)] },
      { status: 'atendida', itens: [item('a', 'Álcool', 5, 4), item('b', 'Detergente', 2, 2)] },
      { status: 'atendida', itens: [item('a', 'Álcool', 5, 5)] },
    ]);
    expect(linhas.map(l => l.nome)).toEqual(['Álcool', 'Detergente']);
    expect(linhas[0].valores).toEqual([{ pedida: 6, recebeu: null }, { pedida: 5, recebeu: 4 }, { pedida: 5, recebeu: 5 }]);
    expect(linhas[0].media).toBe(5); // 6 (ainda não entregue) + 4 + 5 entregues
    expect(linhas[1].valores[0]).toEqual({ pedida: 0, recebeu: null });
    expect(linhas[1].media).toBe(0.67);
  });

  it('sem pedidos, sem linhas', async () => {
    const { historicoPorItem } = await import('@/modules/pedidos/lib/mediaPedidos');
    expect(historicoPorItem([])).toEqual([]);
  });
});
