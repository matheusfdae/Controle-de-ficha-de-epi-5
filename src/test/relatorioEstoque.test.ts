import { describe, expect, it } from 'vitest';
import {
  calcularEstoque, estadosDoRelatorio, montarEmailEstoque, montarEmailReposicao, ItemEstoque, TamanhoEstoque,
} from '../../supabase/functions/_shared/relatorioEstoque';

const item = (id: string, nome: string, minimo: number, extra: Partial<ItemEstoque> = {}): ItemEstoque =>
  ({ id, nome, codigo: null, ca_numero: null, tipo: 'epi', estoque_minimo: minimo, ativo: true, ...extra });

const itens = [
  item('bota', 'Bota de segurança', 10),
  item('luva', 'Luva', 5),
  item('capacete', 'Capacete', 2),
  item('velho', 'Item inativo', 0, { ativo: false }),
];
const tamanhos: TamanhoEstoque[] = [
  { epi_id: 'bota', uf: 'DF', tamanho: '40', estoque: 4, estoque_minimo: 0 },
  { epi_id: 'bota', uf: 'DF', tamanho: '42', estoque: 6, estoque_minimo: 0 },
  { epi_id: 'luva', uf: 'DF', tamanho: 'ÚNICO', estoque: 30, estoque_minimo: 0 },
  { epi_id: 'luva', uf: 'MT', tamanho: 'ÚNICO', estoque: 0, estoque_minimo: 0 },
];

describe('relatório de estoque', () => {
  it('usa a regra da tela Estoque por item e estado', () => {
    const df = calcularEstoque(itens, tamanhos, ['DF']);
    const sit = Object.fromEntries(df.map(l => [l.item.id, [l.saldo, l.situacao]]));
    expect(sit.bota).toEqual([10, 'Crítico']);        // 4 + 6 = 10, igual ao mínimo
    expect(sit.luva).toEqual([30, 'OK']);
    expect(sit.capacete).toEqual([0, 'Sem estoque']);  // sem linha de estoque no estado
    expect(sit.velho).toBeUndefined();                 // inativo fica de fora
    expect(df.map(l => l.situacao)).toEqual(['Sem estoque', 'Crítico', 'OK']); // alertas primeiro
  });

  it('sem estados escolhidos, usa só os que têm estoque cadastrado', () => {
    expect(estadosDoRelatorio([], tamanhos)).toEqual(['DF', 'MT']);
    expect(estadosDoRelatorio(['MT'], tamanhos)).toEqual(['MT']);
  });

  it('monta e-mail com os alertas e a planilha anexa', () => {
    const ufs = ['DF', 'MT'];
    const m = montarEmailEstoque(calcularEstoque(itens, tamanhos, ufs), ufs);
    expect(m.alerta).toBe(5); // DF: capacete, bota · MT: bota, luva, capacete
    expect(m.assunto).toContain('5 item(ns) em alerta');
    expect(m.html).toContain('Bota de segurança');
    expect(m.anexo.nome).toMatch(/^estoque-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(m.anexo.base64.length).toBeGreaterThan(100);
  });

  it('mínimo do estado vale sobre o mínimo geral do item', () => {
    const minimos = [{ epi_id: 'luva', uf: 'DF', minimo: 40 }, { epi_id: 'bota', uf: 'DF', minimo: 3 }];
    const df = calcularEstoque(itens, tamanhos, ['DF'], minimos);
    const sit = Object.fromEntries(df.map(l => [l.item.id, [l.minimo, l.situacao]]));
    expect(sit.luva).toEqual([40, 'Crítico']);  // 30 <= 40
    expect(sit.bota).toEqual([3, 'OK']);        // 10 > 3
    expect(sit.capacete).toEqual([2, 'Sem estoque']); // sem mínimo no estado: usa o geral (2)
  });

  it('monta o pedido de reposição com o que falta para o mínimo', () => {
    const linhas = calcularEstoque(itens, tamanhos, ['DF'], [{ epi_id: 'luva', uf: 'DF', minimo: 40 }])
      .filter(l => l.item.id === 'luva');
    const m = montarEmailReposicao(linhas);
    expect(m.assunto).toBe('Pedido de reposição — Luva (DF)');
    expect(m.html).toContain('ÚNICO: 30');
    expect(m.html).toContain('>10</td>'); // falta 10 para o mínimo
  });
});
