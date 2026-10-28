import { describe, it, expect } from 'vitest';
import { formatCpf, mapEmployeeToBadgeData } from '@/modules/crachas/lib/badgeFieldMap';

describe('dados do crachá', () => {
  it('formata o CPF como no crachá impresso', () => {
    expect(formatCpf('70873977106')).toBe('708.739.771-06');
    expect(formatCpf('3500401171')).toBe('035.004.011-71'); // Senior às vezes perde o zero à esquerda
    expect(formatCpf('035.004.011-71')).toBe('035.004.011-71');
    expect(formatCpf(null)).toBe('');
  });

  it('leva CPF formatado e RG para o crachá', () => {
    const d = mapEmployeeToBadgeData({ id: '1', full_name: 'JOSE', cpf: '70873977106', rg: '3456789' });
    expect(d.cpf).toBe('708.739.771-06');
    expect(d.rg).toBe('3456789');
  });
});
