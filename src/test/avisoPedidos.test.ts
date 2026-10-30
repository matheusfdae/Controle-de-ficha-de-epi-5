import { describe, expect, it } from 'vitest';
import { agruparAvisos, montarEmailAviso, montarEmailEpi, type PedidoAviso } from '../../supabase/functions/_shared/avisoPedidos';
import { converterEmbalagem, sugerirMaterial } from '@/modules/pedidos/lib/pedidosService';

const pedido = (o: Partial<PedidoAviso>): PedidoAviso => ({
  id: 'p1', codigo: 'SOL-2026-000007', posto_id: 'A', posto: 'POSTO A', uf: 'DF', status: 'enviada', data_pedido: '2026-10-30',
  solicitante_nome: 'LIDER', valor: 120, excede_teto: false, sem_preco: false, tem_epi: false, recorrente: false, itens: '12 un Vassoura', ...o,
});

describe('agruparAvisos', () => {
  const papeis = [
    { user_id: 'sup', nivel: 'supervisor', uf: 'DF', postos: [] },
    { user_id: 'supB', nivel: 'supervisor', uf: 'DF', postos: ['B'] },
    { user_id: 'com', nivel: 'compras', uf: 'DF', postos: [] },
    { user_id: 'comer', nivel: 'comercial', uf: 'DF', postos: [] },
    { user_id: 'ger', nivel: 'gerencia', uf: 'DF', postos: [] },
    { user_id: 'sem', nivel: 'supervisor', uf: 'DF', postos: [] },
  ];
  const usuarios = [
    { id: 'sup', nome: 'Ana Souza', email: 'Ana@x.com ' },
    { id: 'supB', nome: 'Bia', email: 'bia@x.com' },
    { id: 'com', nome: 'Caio', email: 'caio@x.com' },
    { id: 'comer', nome: 'Duda', email: 'duda@x.com' },
    { id: 'ger', nome: 'Edu', email: 'edu@x.com' },
    { id: 'sem', nome: 'Sem e-mail', email: null },
  ];

  it('cada etapa vai para o papel dela, um e-mail por pessoa', () => {
    const r = agruparAvisos([
      pedido({ id: 'p1', posto_id: 'A' }), pedido({ id: 'p2', posto_id: 'B' }),
      pedido({ id: 'p3', status: 'em_orcamento' }), pedido({ id: 'p4', status: 'a_faturar' }),
      pedido({ id: 'p5', status: 'aguardando_aprovacao' }), pedido({ id: 'p6', uf: 'GO' }),
    ], papeis, usuarios);
    const por = Object.fromEntries(r.avisos.map(a => [a.email, a.pedidos.map(p => p.id)]));
    expect(por).toEqual({
      'ana@x.com': ['p1', 'p2'], 'bia@x.com': ['p2'], 'caio@x.com': ['p3', 'p4'], 'duda@x.com': ['p5'], 'edu@x.com': ['p5'],
    });
    expect(r.semDestinatario.map(p => p.id)).toEqual(['p6']);
  });
});

describe('e-mails', () => {
  it('aviso destaca excesso de teto, escapa HTML e monta o link', () => {
    const m = montarEmailAviso('Ana Souza', [
      pedido({ id: 'p1', valor: 100 }),
      pedido({ id: 'p2', codigo: 'SOL-2026-000008', status: 'aguardando_aprovacao', valor: 2000.5, excede_teto: true, posto: '<b>X</b>' }),
    ], 'https://epi.exemplo.com/');
    expect(m.assunto).toBe('2 pedido(s) de material esperando por você (1 com excesso de teto)');
    expect(m.html).toContain('Olá, Ana.');
    expect(m.html).toContain('https://epi.exemplo.com/pedidos');
    expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(m.html).toContain('Aprovar o excesso de teto');
    expect(m.html.indexOf('SOL-2026-000008')).toBeLessThan(m.html.indexOf('SOL-2026-000007'));
    expect(m.html).toMatch(/2\.000,50/);
  });
  it('sem link, explica onde abrir', () => {
    expect(montarEmailAviso('Bia', [pedido({})], null).html).toContain('Minhas tarefas');
  });
  it('aviso de EPI lista os pedidos', () => {
    const m = montarEmailEpi([pedido({ tem_epi: true, itens: '2 par Luva PVC' })], null);
    expect(m.assunto).toContain('SOL-2026-000007');
    expect(m.html).toContain('2 par Luva PVC');
  });
});

describe('importação do XML', () => {
  const materiais = [
    { id: 'pap', nome: 'Papel higiênico' },
    { id: 'pap-fl', nome: 'Papel higiênico folha dupla' },
    { id: 'vas', nome: 'Vassoura' },
    { id: 'velho', nome: 'Rodo', ativo: false },
  ];
  it('sugere o item com mais palavras na descrição', () => {
    expect(sugerirMaterial('PAPEL HIGIENICO FOLHA DUPLA 30M FD C/12', materiais)).toBe('pap-fl');
    expect(sugerirMaterial('PAPEL HIGIÊNICO ROLAO 300M', materiais)).toBe('pap');
    expect(sugerirMaterial('VASSOURAS DE PELO', materiais)).toBe('vas');
  });
  it('sem todas as palavras, ou item inativo, não sugere', () => {
    expect(sugerirMaterial('PAPEL TOALHA', materiais)).toBeNull();
    expect(sugerirMaterial('RODO 40CM', materiais)).toBeNull();
  });
  it('converte a embalagem para a unidade do item', () => {
    expect(converterEmbalagem(2, 54, 12)).toEqual({ quantidade: 24, valor_unitario: 4.5 });
    expect(converterEmbalagem(3, 10, 3)).toEqual({ quantidade: 9, valor_unitario: 3.3333 });
    expect(converterEmbalagem(5, 7, 0)).toEqual({ quantidade: 5, valor_unitario: 7 });
  });
});
