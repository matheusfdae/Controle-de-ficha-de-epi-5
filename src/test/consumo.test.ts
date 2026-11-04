import { describe, expect, it } from 'vitest';
import { consumoDoDia, consumoDoPeriodo, diaDoLancamento, diasDoPeriodo, type PlantaoComItens } from '@/modules/pedidos/lib/consumo';

const plantao = (id: string, em: string, itens: [string, number, number, number, number][]): PlantaoComItens => ({
  id, posto_id: 'p', uf: 'DF', status: 'fechado', aberto_em: em, aberto_por_nome: null, fechado_em: em, fechado_por_nome: null,
  observacao_inicio: null, observacao_fim: null, assinatura: null, declaracao_aceita_em: null, tem_diferenca: false,
  itens: itens.map(([m, ini, rec, uso, fim]) => ({ plantao_id: id, material_id: m, qtd_inicio: ini, qtd_recebida: rec, qtd_usada: uso, qtd_fim: fim, diferenca: 0 })),
});

describe('consumo do posto', () => {
  it('dia em Brasília (22h de Brasília ainda é o mesmo dia)', () => {
    expect(diaDoLancamento('2026-10-10T01:30:00Z')).toBe('2026-10-09');
  });
  it('períodos: quinzenas e mês', () => {
    expect(diasDoPeriodo('quinzena', '2026-10-20', 1)).toHaveLength(15);
    expect(diasDoPeriodo('quinzena', '2026-10-20', 2)).toEqual(Array.from({ length: 16 }, (_, i) => `2026-10-${16 + i}`));
    expect(diasDoPeriodo('mes', '2026-02-10')).toHaveLength(28);
    expect(diasDoPeriodo('dia', '2026-10-05')).toEqual(['2026-10-05']);
  });
  it('diário junta os lançamentos do dia: início do primeiro, usado somado, final do último', () => {
    const ps = [
      plantao('a', '2026-10-05T10:00:00-03:00', [['luva', 20, 0, 4, 16], ['agua', 5, 0, 1, 4]]),
      plantao('b', '2026-10-05T18:00:00-03:00', [['luva', 16, 10, 6, 20]]),
      plantao('c', '2026-10-06T10:00:00-03:00', [['luva', 20, 0, 3, 17]]),
    ];
    const d = consumoDoDia(ps, '2026-10-05');
    expect(d.find(x => x.material_id === 'luva')).toMatchObject({ inicio: 20, recebido: 10, usado: 10, final: 20, lancamentos: 2 });
    expect(d.find(x => x.material_id === 'agua')).toMatchObject({ usado: 1 });
  });
  it('período: usado por dia, total, média por dia lançado e pico', () => {
    const ps = [
      plantao('a', '2026-10-01T10:00:00-03:00', [['luva', 20, 0, 4, 16]]),
      plantao('b', '2026-10-02T10:00:00-03:00', [['luva', 16, 0, 6, 10], ['agua', 5, 0, 2, 3]]),
      plantao('c', '2026-10-20T10:00:00-03:00', [['luva', 10, 0, 9, 1]]),
    ];
    const r = consumoDoPeriodo(ps, diasDoPeriodo('quinzena', '2026-10-01', 1));
    expect(r.diasLancados).toEqual(['2026-10-01', '2026-10-02']);
    const luva = r.linhas.find(l => l.material_id === 'luva')!;
    expect(luva).toMatchObject({ total: 10, mediaDia: 5, diasComUso: 2, pico: 6, picoDia: '2026-10-02' });
    expect(r.totalPorDia.slice(0, 3)).toEqual([4, 8, 0]);
  });
});
