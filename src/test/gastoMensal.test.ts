import { describe, expect, it } from 'vitest';
import { acumulado, lerAbaGasto, lerCusto, parcelasDaFormula, type Celula } from '@/modules/pedidos/lib/planilhaGasto';
import { lerValorDigitado } from '@/modules/pedidos/lib/gastoMensalService';

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const d = (s: string) => new Date(`${s}T00:00:00Z`);
// Linha com rótulo nas colunas B..D (mesclado: o Excel repete o valor) e os 12 meses em E..P.
const lin = (b: Celula, c: Celula, meses: Celula[] = [], extra: Record<number, Celula> = {}) => {
  const r: Celula[] = [null, b, c, c && typeof b === 'string' && b === c ? c : null, ...Array.from({ length: 12 }, (_, i) => meses[i] ?? null)];
  for (const [k, v] of Object.entries(extra)) r[Number(k)] = v;
  return r;
};

function abaExemplo() {
  const g: Celula[][] = [
    [],
    lin(null, null, [], { 3: 'PEDIDO DE MATERIAL - Rev.00' }),
    lin('ORD', 'ITEM', [], { 4: 'POSTO: CRESM (CREDEQ)', 10: 'CUSTO EM CONTRATO: R$ 32.000,00' }),
    lin(null, null, MESES),
    lin(1, 'BOLSA VINIL AMAR.C/ZIP', ['10 und', null, '08 und']),
    lin(2, 'LUVA NITRILICA', [null, 3]),
    lin(3, null),                                     // linha numerada vazia
    lin('HC CLEAN', 'HC CLEAN'),                      // rótulo mesclado ORD+ITEM: seção
    lin(4, 'ALCOOL 70 1L', [null, null, null, '3 lt']),
    lin('OMNI', 'ITEM', MESES, { 1: 5, 0: 'OMNI' }),  // 2º cabeçalho: seção OMNI
    lin(6, 'PAPEL TOALHA', [null, null, null, null, null, null, null, '5 cxs']),
    lin('DATA DE FATURAMENTO', 'DATA DE FATURAMENTO', [d('2026-01-03'), 'Sob Demanda', '00/00/00', d('2026-04-02')]),
    lin(null, null, [null, 'Sob Demanda', d('2026-03-11'), '04/08/2026 (emissão para agosto)']),
    lin('VALOR   PREVISTO  (R$):', 'VALOR   PREVISTO  (R$):', [32000, 32000, 32000, '-']),
    lin('VALOR REALIZADO (R$):', 'VALOR REALIZADO (R$):', [28639.12, 0, 16081.64, 100]),
    lin('SALDO (R$):', 'SALDO (R$):', [3360.88, 32000, 15918.36, -100]),
    [],
    lin('EQUIPAMENTOS', null, [], { 11: 'ACUMULADO' }),
    lin('QTD', 'DESCRIÇÃO', [null, null, null], { 4: 'UN. (R$)', 5: 'SUBTOTAL' }),
    lin(2, 'CARRO FUNC.', [], { 4: 599, 5: 1198 }),
    lin(1, 'ENCERADEIRA', [], { 4: 3590, 5: 3590 }),
    [],
    lin('O contrato será encerrado no dia 16/06/2026', null),
    lin('EQUIPAMENTOS', null),                        // bloco repetido mais abaixo: ignorado
    lin('QTD', 'DESCRIÇÃO', [], { 4: 'UN. (R$)', 5: 'SUBTOTAL' }),
    lin(2, 'CARRO FUNC.', [], { 4: 599, 5: 1198 }),
  ];
  const f: (string | null)[][] = g.map(() => []);
  f[14][4] = '=26520.06+2119.06';
  f[14][6] = '=8424.71-E88';
  return lerAbaGasto('CRESM (CREDEQ)', g, f)!;
}

describe('planilha de controle de gasto mensal', () => {
  it('cabeçalho, custo e estado', () => {
    const a = abaExemplo();
    expect(a).toMatchObject({ aba: 'CRESM (CREDEQ)', posto: 'CRESM (CREDEQ)', uf: 'GO', custoTexto: 'R$ 32.000,00', custoValor: 32000, rotuloSaldo: 'SALDO' });
    expect(a.avisos).toEqual([]);
  });

  it('itens por seção (HC CLEAN e OMNI), sem a linha numerada vazia', () => {
    const a = abaExemplo();
    expect(a.secoes.map(s => [s.titulo, s.itens.map(i => i.nome)])).toEqual([
      [null, ['BOLSA VINIL AMAR.C/ZIP', 'LUVA NITRILICA']],
      ['HC CLEAN', ['ALCOOL 70 1L']],
      ['OMNI', ['PAPEL TOALHA']],
    ]);
    expect(a.secoes[0].itens[0]).toMatchObject({ ordem: 1, meses: ['10 und', '', '08 und', '', '', '', '', '', '', '', '', ''] });
    expect(a.secoes[0].itens[1].meses[1]).toBe('3');
  });

  it('faturamento: várias datas por mês, texto mesclado uma vez, 00/00/00 vazio', () => {
    const a = abaExemplo();
    expect(a.meses.slice(0, 4).map(m => m.faturamento)).toEqual([
      ['2026-01-03'], ['Sob Demanda'], ['2026-03-11'], ['2026-04-02', '04/08/2026 (emissão para agosto)'],
    ]);
  });

  it('previsto, realizado com as notas e acumulado', () => {
    const a = abaExemplo();
    expect(a.meses[0]).toMatchObject({ previsto: 32000, realizado: 28639.12, parcelas: [26520.06, 2119.06] });
    expect(a.meses[2].parcelas).toBeNull();           // fórmula com referência a célula
    expect(a.meses[3].previsto).toBeNull();            // "-"
    expect(acumulado(a.meses)).toEqual({ previsto: 96000, aplicado: 44820.76, saldo: 51179.24 });
  });

  it('equipamentos (só o 1º bloco) e observações', () => {
    const a = abaExemplo();
    expect(a.equipamentos).toEqual([
      { qtd: 2, descricao: 'CARRO FUNC.', unitario: 599, subtotal: 1198 },
      { qtd: 1, descricao: 'ENCERADEIRA', unitario: 3590, subtotal: 3590 },
    ]);
    expect(a.observacoes).toEqual(['O contrato será encerrado no dia 16/06/2026']);
  });

  it('aba MENU fica de fora; aba sem os meses avisa', () => {
    expect(lerAbaGasto('MENU', [])).toBeNull();
    expect(lerAbaGasto('X', [lin('ORD', 'ITEM')])!.avisos[0]).toMatch(/não encontrado/);
  });

  it('custo em contrato', () => {
    expect(lerCusto('CUSTO EM CONTRATO: R$ 69.678,38')).toEqual({ custoTexto: 'R$ 69.678,38', custoValor: 69678.38 });
    expect(lerCusto('CUSTO EM CONTRATO:  27.424,50')).toEqual({ custoTexto: '27.424,50', custoValor: 27424.5 });
    expect(lerCusto('CUSTO EM CONTRATO: Sob Demanda')).toEqual({ custoTexto: 'Sob Demanda', custoValor: null });
    expect(lerCusto('CUSTO EM CONTRATO: R$ ?').custoValor).toBeNull();
  });

  it('parcelas da fórmula', () => {
    expect(parcelasDaFormula('=7266.29-699.3')).toEqual([7266.29, -699.3]);
    expect(parcelasDaFormula('=27972.4')).toBeNull();
    expect(parcelasDaFormula('=SUM(E1:E3)')).toBeNull();
  });

  it('valor digitado na edição', () => {
    expect(lerValorDigitado('1.234,56')).toEqual({ total: 1234.56, parcelas: null });
    expect(lerValorDigitado('26.829,76 + 8.755,64 - 100')).toEqual({ total: 35485.4, parcelas: [26829.76, 8755.64, -100] });
    expect(lerValorDigitado('R$ 300')).toEqual({ total: 300, parcelas: null });
    expect(lerValorDigitado('')).toEqual({ total: null, parcelas: null });
    expect(lerValorDigitado('abc')).toBe('invalido');
  });
});
