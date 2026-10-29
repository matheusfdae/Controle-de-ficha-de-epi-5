import { describe, expect, it } from 'vitest';
import { calcularPainel, svgPainel, FichaPainel } from '../../supabase/functions/_shared/painelFichas';

const agora = new Date('2026-10-29T13:00:00Z');
const fichas: FichaPainel[] = [
  { id: 'a', status: 'assinada', motivo: 'admissao', created_at: '2026-10-05T12:00:00Z' },
  { id: 'b', status: 'pendente', motivo: 'admissao', created_at: '2026-10-20T12:00:00Z' },
  { id: 'c', status: 'pendente', motivo: 'substituicao', created_at: '2026-07-10T12:00:00Z' },
  // 22h de 31/08 em Brasília (01h de 01/09 em UTC): conta em agosto.
  { id: 'd', status: 'pendente', motivo: 'complemento', created_at: '2026-09-01T01:00:00Z' },
  // Mais de 12 meses atrás: fora do gráfico, mas entra nos números.
  { id: 'e', status: 'assinada', motivo: 'substituicao', created_at: '2025-06-01T12:00:00Z' },
];
const itens = [
  { ficha_id: 'a', quantidade: 3, recebido: true },
  { ficha_id: 'b', quantidade: 2, recebido: false },
  { ficha_id: 'c', quantidade: null, recebido: true },
  { ficha_id: 'outra', quantidade: 9, recebido: true },
];

describe('painel das fichas', () => {
  it('faz as mesmas contas do painel da tela', () => {
    const p = calcularPainel(fichas, itens, agora);
    expect([p.total, p.assinadas, p.pendentes, p.pct, p.itens]).toEqual([5, 2, 3, 40, 4]);
    expect(p.porMes).toHaveLength(12);
    expect(p.porMes[0].label).toBe('nov/25');
    expect(p.porMes[11]).toEqual({ label: 'out/26', assinadas: 1, pendentes: 1 });
    expect(p.porMes.find(m => m.label === 'ago/26')).toEqual({ label: 'ago/26', assinadas: 0, pendentes: 1 });
    expect(p.porMotivo).toEqual([
      { motivo: 'Admissão', fichas: 2 }, { motivo: 'Substituição', fichas: 2 }, { motivo: 'Complemento', fichas: 1 },
    ]);
  });

  it('gera o SVG com o estado e os números', () => {
    const svg = svgPainel(calcularPainel(fichas, itens, agora), 'DF', agora);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Fichas de EPI/Uniforme — DF');
    expect(svg).toContain('Situação em 29/10/2026');
    expect(svg).toContain('Substituição');
  });

  it('sem fichas não quebra', () => {
    const svg = svgPainel(calcularPainel([], [], agora), 'GO', agora);
    expect(svg).toContain('Nenhuma ficha');
  });
});
