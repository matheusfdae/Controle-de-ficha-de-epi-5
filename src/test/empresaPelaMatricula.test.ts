import { describe, it, expect } from 'vitest';
import { empresaPelaMatricula } from '@/lib/empresaPelaMatricula';

describe('empresaPelaMatricula', () => {
  it('1 = MATRIZ, 3 = APOIO, resto sem regra', () => {
    expect(empresaPelaMatricula('1000514')).toBe('MATRIZ');
    expect(empresaPelaMatricula(' 3008990')).toBe('APOIO');
    expect(empresaPelaMatricula('2001')).toBeNull();
    expect(empresaPelaMatricula('')).toBeNull();
  });
});
