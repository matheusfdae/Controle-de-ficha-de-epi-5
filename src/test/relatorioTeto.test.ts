import { describe, expect, it } from 'vitest';
import { relatorioTeto, variacao } from '@/modules/pedidos/lib/relatorioTeto';
import type { GastoPosto } from '@/modules/pedidos/lib/gastoMensalService';
import type { PedidoCompleto } from '@/modules/pedidos/lib/pedidosService';

const meses = (prev: (number | null)[], real: (number | null)[]) =>
  Array.from({ length: 12 }, (_, k) => ({ faturamento: [], previsto: prev[k] ?? null, realizado: real[k] ?? null, parcelas: null }));

describe('relatório do teto de gasto', () => {
  it('variação como na planilha: sem sinal, vermelho se passou', () => {
    expect(variacao(2600.18, 5672.05)).toEqual({ valor: 3071.87, tom: 'passou' });
    expect(variacao(2600.18, 2131.96)).toEqual({ valor: 468.22, tom: 'sobrou' });
    expect(variacao(0, 0)).toEqual({ valor: 0, tom: 'zero' });
  });

  it('usa o controle de gasto mensal do posto (DF Plaza Office)', () => {
    const controle = {
      custo_texto: 'R$ 2.600,18', custo_valor: 2600.18,
      dados: { rotuloSaldo: 'VARIAÇÃO', meses: meses(Array(10).fill(2600.18), [5672.05, 3639.82, 4136.62, 2131.96, 4814.46, 0, 4573.37, 2568.01, 5923.18, 6634.15]) },
    } as unknown as GastoPosto;
    const r = relatorioTeto(2026, controle, [], 1000, 12);
    expect(r.origem).toBe('controle');
    expect(r.custoTexto).toBe('R$ 2.600,18');
    expect(r.acumulado).toEqual({ previsto: 26001.8, aplicado: 40093.62, saldo: -14091.82 });
  });

  it('sem controle: pelos pedidos do sistema, teto como previsto', () => {
    const ped = (data: string, valor: number, status = 'atendida', atendida: string | null = `${data}T15:00:00Z`) =>
      ({ data_pedido: data, valor_total: valor, status, atendida_em: atendida } as unknown as PedidoCompleto);
    const r = relatorioTeto(2026, null, [ped('2026-11-03', 100), ped('2026-11-10', 50.5), ped('2026-11-12', 999, 'cancelada'), ped('2025-11-01', 7)], 300, 12);
    expect(r.origem).toBe('pedidos');
    expect(r.meses[10]).toMatchObject({ previsto: 300, realizado: 150.5, faturamento: ['2026-11-03', '2026-11-10'] });
    expect(r.acumulado.previsto).toBe(3600);
  });

  it('só até o mês de referência: os seguintes zerados', () => {
    const controle = { custo_texto: 'R$ 100,00', custo_valor: 100, atualizado_em: '2026-11-05T10:00:00Z',
      dados: { rotuloSaldo: 'VARIAÇÃO', meses: meses(Array(12).fill(100), Array(12).fill(80)) } } as unknown as GastoPosto;
    const r = relatorioTeto(2026, controle, [], null, 10);
    expect(r.meses[9]).toMatchObject({ previsto: 100, realizado: 80 });
    expect(r.meses[10]).toEqual({ faturamento: [], previsto: 0, realizado: 0, parcelas: null });
    expect(r.acumulado).toEqual({ previsto: 1000, aplicado: 800, saldo: 200 });
  });

  it('mês de referência padrão', async () => {
    const { mesDeReferencia } = await import('@/modules/pedidos/lib/relatorioTeto');
    expect(mesDeReferencia(2026, new Date(2026, 10, 11))).toBe(10); // 11/11 -> outubro
    expect(mesDeReferencia(2026, new Date(2026, 0, 15))).toBe(1);
    expect(mesDeReferencia(2025, new Date(2026, 10, 11))).toBe(12);
  });

  it('mês inicial: com planilha, o último mês preenchido (sem passar do atual)', async () => {
    const { mesInicial } = await import('@/modules/pedidos/lib/relatorioTeto');
    const hoje = new Date(2026, 10, 12); // 12/11/2026
    const comNov = { dados: { meses: meses(Array(12).fill(100), [...Array(11).fill(90), 0]) } } as unknown as GastoPosto;
    expect(mesInicial(2026, comNov, hoje)).toBe(11);          // planilha já tem novembro
    const ateSet = { dados: { meses: meses(Array(12).fill(100), [...Array(9).fill(90), 0, 0, 0]) } } as unknown as GastoPosto;
    expect(mesInicial(2026, ateSet, hoje)).toBe(10);          // não volta antes do último mês fechado
    const comDez = { dados: { meses: meses(Array(12).fill(100), Array(12).fill(90)) } } as unknown as GastoPosto;
    expect(mesInicial(2026, comDez, hoje)).toBe(11);          // não passa do mês atual
    expect(mesInicial(2026, null, hoje)).toBe(10);            // sem planilha: último mês fechado
  });
});
