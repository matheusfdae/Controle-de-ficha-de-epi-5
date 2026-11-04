import { describe, expect, it } from 'vitest';
import {
  agruparAvisos, avisaTeto, montarEmailAviso, montarEmailEpi, montarEmailTeto, passouTeto, type PedidoAviso,
} from '../../supabase/functions/_shared/avisoPedidos';

const pedido = (o: Partial<PedidoAviso>): PedidoAviso => ({
  id: 'p1', codigo: 'SOL-2026-000007', posto_id: 'A', posto: 'POSTO A', uf: 'DF', status: 'enviada', data_pedido: '2026-10-30',
  solicitante_nome: 'LIDER', tem_epi: false, recorrente: false,
  itens: [{ nome: 'Vassoura', quantidade: 12, unidade: 'un', epi: false }], ...o,
});

describe('agruparAvisos', () => {
  const papeis = [
    { user_id: 'sup', nivel: 'supervisor', uf: 'DF', postos: [] },
    { user_id: 'supB', nivel: 'supervisor', uf: 'DF', postos: ['B'] },
    { user_id: 'com', nivel: 'compras', uf: 'DF', postos: [] },
    { user_id: 'ger', nivel: 'gerencia', uf: 'DF', postos: [] },
    { user_id: 'sem', nivel: 'supervisor', uf: 'DF', postos: [] },
  ];
  const usuarios = [
    { id: 'sup', nome: 'Ana Souza', email: 'Ana@x.com ' },
    { id: 'supB', nome: 'Bia', email: 'bia@x.com' },
    { id: 'com', nome: 'Caio', email: 'caio@x.com' },
    { id: 'ger', nome: 'Edu', email: 'edu@x.com' },
    { id: 'sem', nome: 'Sem e-mail', email: null },
  ];

  it('conferência vai para o supervisor; atendimento para compras; um e-mail por pessoa', () => {
    const r = agruparAvisos([
      pedido({ id: 'p1', posto_id: 'A' }), pedido({ id: 'p2', posto_id: 'B' }),
      pedido({ id: 'p3', status: 'a_atender' }), pedido({ id: 'p4', status: 'atendida' }), pedido({ id: 'p6', uf: 'GO' }),
    ], papeis, usuarios);
    const por = Object.fromEntries(r.avisos.map(a => [a.email, a.pedidos.map(p => p.id)]));
    expect(por).toEqual({ 'ana@x.com': ['p1', 'p2'], 'bia@x.com': ['p2'], 'caio@x.com': ['p3'] });
    expect(r.semDestinatario.map(p => p.id)).toEqual(['p4', 'p6']);
  });
});

describe('e-mails', () => {
  it('aviso mostra o que fazer, escapa HTML e monta o link, sem valores', () => {
    const m = montarEmailAviso('Ana Souza', [
      pedido({ id: 'p1' }), pedido({ id: 'p2', codigo: 'SOL-2026-000008', status: 'a_atender', posto: '<b>X</b>', tem_epi: true }),
    ], 'https://epi.exemplo.com/');
    expect(m.assunto).toBe('2 pedidos de material esperando por você');
    expect(m.html).toContain('Olá, Ana.');
    expect(m.html).toContain('https://epi.exemplo.com/pedidos?pedido=p1');
    expect(m.html).toContain('Abrir todos os pedidos');
    expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(m.html).toContain('Conferir o material');
    expect(m.html).toContain('Atender');
    expect(m.html).not.toMatch(/R\$|teto/i);
  });
  it('sem link, explica onde abrir', () => {
    expect(montarEmailAviso('Bia', [pedido({})], null).html).toContain('Minhas tarefas');
  });
  it('aviso de EPI lista os pedidos', () => {
    const m = montarEmailEpi([pedido({ tem_epi: true, itens: [{ nome: 'Luva PVC', quantidade: 2, unidade: 'par', epi: true }] })], null);
    expect(m.assunto).toContain('SOL-2026-000007');
    expect(m.html).toMatch(/Luva PVC[\s\S]*>2<[\s\S]*par/);
  });
  it('um pedido só: assunto com o código e o posto, quantidades na tabela', () => {
    const m = montarEmailAviso('Ana', [pedido({ itens: [{ nome: 'Água sanitária 5 L', quantidade: 1.5, unidade: 'galão', epi: false }] })], null);
    expect(m.assunto).toBe('Pedido SOL-2026-000007 esperando por você — POSTO A');
    expect(m.html).toContain('1,5');
    expect(m.html).toContain('1 item');
  });
  it('com preço: colunas de valor e total; item sem preço avisado', () => {
    const m = montarEmailAviso('Ana', [pedido({ valor_total: 29.7, itens: [
      { nome: 'Água sanitária', quantidade: 3, unidade: 'galão', epi: false, preco: 9.9 },
      { nome: 'Rodo', quantidade: 1, unidade: 'un', epi: false, preco: null },
    ] })], null);
    expect(m.html).toContain('Total do pedido');
    expect(m.html).toMatch(/R\$\s?29,70/);
    expect(m.html).toContain('sem preço');
  });
});

describe('teto', () => {
  const papeis = [
    { user_id: 'com', nivel: 'comercial', uf: 'DF', postos: [] },
    { user_id: 'ger', nivel: 'gerencia', uf: 'DF', postos: ['B'] },
    { user_id: 'sup', nivel: 'supervisor', uf: 'DF', postos: [] },
  ];
  const usuarios = [{ id: 'com', nome: 'Caio', email: 'caio@x.com' }, { id: 'ger', nome: 'Edu', email: 'edu@x.com' }, { id: 'sup', nome: 'Ana', email: 'ana@x.com' }];
  it('passou = gasto maior que o teto; sem teto nunca passa', () => {
    expect(passouTeto(100, 100)).toBe(false);
    expect(passouTeto(100, 100.01)).toBe(true);
    expect(passouTeto(null, 999)).toBe(false);
  });
  it('vai para Comercial e Gerência do estado (respeitando os postos marcados), não para o supervisor', () => {
    const r = agruparAvisos([pedido({ id: 'a', posto_id: 'A' }), pedido({ id: 'b', posto_id: 'B' })], papeis, usuarios, avisaTeto);
    expect(Object.fromEntries(r.avisos.map(a => [a.email, a.pedidos.map(p => p.id)]))).toEqual({ 'caio@x.com': ['a', 'b'], 'edu@x.com': ['b'] });
  });
  it('e-mail mostra o gasto do mês contra o teto', () => {
    const m = montarEmailTeto('Caio Souza', [pedido({ teto: { teto: 500, gasto: 620.5, mes: '2026-11-01' }, valor_total: 120.5 })], 'https://x.com');
    expect(m.assunto).toBe('Teto ultrapassado: POSTO A (SOL-2026-000007)');
    expect(m.html).toContain('novembro/2026');
    expect(m.html).toMatch(/R\$\s?620,50/);
    expect(m.html).toContain('124%');
    expect(m.html).toContain('segue normalmente');
  });
});
