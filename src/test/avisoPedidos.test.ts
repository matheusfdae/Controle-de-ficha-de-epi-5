import { describe, expect, it } from 'vitest';
import { agruparAvisos, montarEmailAviso, type PedidoAviso } from '../../supabase/functions/_shared/avisoPedidos';
import { converterEmbalagem, sugerirMaterial } from '@/modules/pedidos/lib/pedidosService';

const pedido = (o: Partial<PedidoAviso>): PedidoAviso => ({
  id: 'p1', numero: 7, posto_id: 'A', posto: 'POSTO A', uf: 'DF', nivel_atual: 'supervisor', data_pedido: '2026-10-30',
  solicitante_nome: 'LIDER', valor_estimado: 120, acima_do_teto: false, sem_preco: false, recorrente: false, itens: '12 un Vassoura', ...o,
});

describe('agruparAvisos', () => {
  const aprovadores = [
    { user_id: 'u1', nivel: 'supervisor', uf: 'DF', postos: [] },
    { user_id: 'u2', nivel: 'supervisor', uf: 'DF', postos: ['B'] },
    { user_id: 'u3', nivel: 'gerente', uf: 'DF', postos: [] },
    { user_id: 'u4', nivel: 'supervisor', uf: 'DF', postos: [] },
  ];
  const usuarios = [
    { id: 'u1', nome: 'Ana Souza', email: 'Ana@x.com ' },
    { id: 'u2', nome: 'Bia', email: 'bia@x.com' },
    { id: 'u3', nome: 'Caio', email: 'caio@x.com' },
    { id: 'u4', nome: 'Sem e-mail', email: null },
  ];

  it('um e-mail por pessoa, respeitando nível, estado e postos', () => {
    const r = agruparAvisos([
      pedido({ id: 'p1', posto_id: 'A' }), pedido({ id: 'p2', numero: 8, posto_id: 'B' }),
      pedido({ id: 'p3', numero: 9, nivel_atual: 'gerente' }), pedido({ id: 'p4', numero: 10, uf: 'GO' }),
    ], aprovadores, usuarios);
    const por = Object.fromEntries(r.avisos.map(a => [a.email, a.pedidos.map(p => p.id)]));
    expect(por).toEqual({ 'ana@x.com': ['p1', 'p2'], 'bia@x.com': ['p2'], 'caio@x.com': ['p3'] });
    expect(r.avisados).toEqual(['p1', 'p2', 'p3']);
    expect(r.semAprovador.map(p => p.id)).toEqual(['p4']);
  });
});

describe('montarEmailAviso', () => {
  it('destaca acima do teto, escapa HTML e monta o link', () => {
    const m = montarEmailAviso('Ana Souza', [
      pedido({ id: 'p1', valor_estimado: 100 }),
      pedido({ id: 'p2', numero: 8, valor_estimado: 2000.5, acima_do_teto: true, posto: '<b>X</b>' }),
    ], 'https://epi.exemplo.com/');
    expect(m.assunto).toBe('2 pedido(s) de material para aprovar (1 acima do teto)');
    expect(m.html).toContain('Olá, Ana.');
    expect(m.html).toContain('https://epi.exemplo.com/pedidos');
    expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(m.html.indexOf('PM-000008')).toBeLessThan(m.html.indexOf('PM-000007'));
    expect(m.html).toMatch(/2\.100,50/);
  });
  it('sem link, explica onde abrir', () => {
    expect(montarEmailAviso('Bia', [pedido({})], null).html).toContain('Minha aprovação');
  });
});

describe('importação do XML', () => {
  const materiais = [
    { id: 'pap', nome: 'Papel higiênico' },
    { id: 'pap-fl', nome: 'Papel higiênico folha dupla' },
    { id: 'vas', nome: 'Vassoura' },
    { id: 'velho', nome: 'Rodo', ativo: false },
  ];
  it('sugere o material com mais palavras na descrição', () => {
    expect(sugerirMaterial('PAPEL HIGIENICO FOLHA DUPLA 30M FD C/12', materiais)).toBe('pap-fl');
    expect(sugerirMaterial('PAPEL HIGIÊNICO ROLAO 300M', materiais)).toBe('pap');
    expect(sugerirMaterial('VASSOURAS DE PELO', materiais)).toBe('vas');
  });
  it('sem todas as palavras, ou material inativo, não sugere', () => {
    expect(sugerirMaterial('PAPEL TOALHA', materiais)).toBeNull();
    expect(sugerirMaterial('RODO 40CM', materiais)).toBeNull();
  });
  it('converte a embalagem para a unidade do material', () => {
    expect(converterEmbalagem(2, 54, 12)).toEqual({ quantidade: 24, valor_unitario: 4.5 });
    expect(converterEmbalagem(3, 10, 3)).toEqual({ quantidade: 9, valor_unitario: 3.3333 });
    expect(converterEmbalagem(5, 7, 0)).toEqual({ quantidade: 5, valor_unitario: 7 });
  });
});
