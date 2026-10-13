import { describe, it, expect } from 'vitest';
import { tirarFundoPixels } from '@/lib/carimbo';

describe('tirarFundoPixels', () => {
  it('deixa transparente o fundo amarelado e mantém a tinta vermelha', () => {
    const w = 10, h = 10;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([250, 240, 160, 255], i * 4); // papel amarelado
    const tinta = (4 * w + 5) * 4;
    px.set([200, 30, 40, 255], tinta); // tinta vermelha no meio
    const quase = (5 * w + 5) * 4;
    px.set([245, 235, 165, 255], quase); // sujeira quase da cor do papel
    tirarFundoPixels(px, w, h);
    expect(px[3]).toBe(0);
    expect(px[quase + 3]).toBe(0);
    expect(px[tinta + 3]).toBe(255);
    expect([...px.slice(tinta, tinta + 3)]).toEqual([200, 30, 40]);
  });
});
