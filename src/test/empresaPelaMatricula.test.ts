import { describe, it, expect } from 'vitest';
import { EMPRESAS_SENIOR, empresaDaSenior, empresaPelaMatricula } from '@/lib/empresaPelaMatricula';

describe('empresaPelaMatricula', () => {
  it('1 = segurança (matriz), 3 = apoio, resto sem regra', () => {
    expect(empresaPelaMatricula('1000514')).toBe(EMPRESAS_SENIOR[1]);
    expect(empresaPelaMatricula(' 3008990')).toBe(EMPRESAS_SENIOR[3]);
    expect(empresaPelaMatricula('2001')).toBeNull();
    expect(empresaPelaMatricula('')).toBeNull();
  });
});

describe('empresaDaSenior', () => {
  it('usa o nome da empresa; sem ele, a razão social sem espaços sobrando', () => {
    expect(empresaDaSenior('5 ESTRELAS SERVIÇOS DE APOIO', 'X')).toBe('5 ESTRELAS SERVIÇOS DE APOIO');
    expect(empresaDaSenior(null, '5 ESTRELAS  SISTEMA DE SEGURANÇA LTDA ')).toBe('5 ESTRELAS SISTEMA DE SEGURANÇA LTDA');
    expect(empresaDaSenior('  ', null)).toBeNull();
  });
});

describe('dataCurta', () => {
  it('DD/MM/AA', async () => {
    const { dataCurta } = await import('@/lib/utils');
    expect(dataCurta('2026-10-21')).toBe('21/10/26');
    expect(dataCurta('')).toBe('');
    expect(dataCurta('21/10/2026')).toBe('21/10/2026');
  });
});
