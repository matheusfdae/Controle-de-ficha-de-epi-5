import { describe, expect, it } from 'vitest';
import { formatarCpf, formatarTelefone, matriculaValida, MOTIVOS } from '@/modules/crachas/lib/solicitacaoService';

describe('solicitação de crachá', () => {
  it('matrícula: só números, até 9 dígitos', () => {
    expect(matriculaValida('1000514')).toBe(1000514);
    expect(matriculaValida(' 1.000.514 ')).toBe(1000514);
    expect(matriculaValida('')).toBeNull();
    expect(matriculaValida('abc')).toBeNull();
    expect(matriculaValida('1234567890')).toBeNull();
  });

  it('formata CPF enquanto digita', () => {
    expect(formatarCpf('529')).toBe('529');
    expect(formatarCpf('5299')).toBe('529.9');
    expect(formatarCpf('5299822')).toBe('529.982.2');
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('529982247259999')).toBe('529.982.247-25');
  });

  it('formata telefone fixo e celular', () => {
    expect(formatarTelefone('61')).toBe('61');
    expect(formatarTelefone('6133334444')).toBe('(61) 3333-4444');
    expect(formatarTelefone('61999998888')).toBe('(61) 99999-8888');
  });

  it('motivos batem com os aceitos pelo banco', () => {
    expect(MOTIVOS.map(m => m.valor)).toEqual(['primeira_via', 'perda', 'dano', 'mudanca_cargo', 'mudanca_nome', 'outro']);
  });
});
