import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { formatarCnpj, produtosSemLigacao, type ItemNotaSefaz, type NotaSefaz } from '@/modules/pedidos/lib/sefazService';

const nota = (chave: string, emissao: string, extra: Partial<NotaSefaz> = {}): NotaSefaz => ({
  chave, emitente_cnpj: '12345678000190', emitente_nome: 'FORNECEDOR', numero: '1', emissao, valor_total: 10,
  situacao: 'completa', ciencia_em: null, ciencia_erro: null, ...extra,
});
const item = (id: string, chave: string, codigo: string | null, extra: Partial<ItemNotaSefaz> = {}): ItemNotaSefaz => ({
  id, chave, n_item: 1, codigo, descricao: `PRODUTO ${codigo}`, unidade: 'UN', quantidade: 1, valor_unit: 5, material_id: null, ...extra,
});

describe('produtosSemLigacao', () => {
  it('um por fornecedor + código, com o item da nota mais recente', () => {
    const r = produtosSemLigacao(
      [nota('a', '2026-11-01'), nota('b', '2026-11-05'), nota('c', '2026-11-03', { emitente_cnpj: '99999999000199', emitente_nome: 'OUTRO' })],
      [item('1', 'a', 'X', { valor_unit: 4 }), item('2', 'b', 'X', { valor_unit: 6 }), item('3', 'c', 'X')],
    );
    expect(r.map(p => [p.fornecedor, p.item.id, p.notas])).toEqual([['FORNECEDOR', '2', 2], ['OUTRO', '3', 1]]);
  });

  it('ignora ligado, sem código, cancelada e resumo', () => {
    const r = produtosSemLigacao(
      [nota('a', '2026-11-01'), nota('b', '2026-11-02', { situacao: 'cancelada' }), nota('c', '2026-11-03', { situacao: 'resumo' })],
      [item('1', 'a', 'X', { material_id: 'm' }), item('2', 'a', null), item('3', 'b', 'Y'), item('4', 'c', 'Z')],
    );
    expect(r).toEqual([]);
  });
});

it('formatarCnpj', () => {
  expect(formatarCnpj('72591894000142')).toBe('72.591.894/0001-42');
  expect(formatarCnpj(null)).toBe('—');
});
