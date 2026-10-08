import { describe, expect, it } from 'vitest';
import { chaveSolta, corrigirCoordenada, limparNomePosto, processarGeo, ufDaLinha } from '@/lib/geoPlanilha';

describe('limparNomePosto', () => {
  it.each([
    ['CAESB - SIA -BOMBEIRO BRIGADISTA - DIU 12H - C/INTRA', 'CAESB - SIA'],
    ['TERRACAP -NUTAN -VIGILANTE - NOT 12H - C/INTRA', 'TERRACAP - NUTAN'],
    ['TERRACAP - CA06-VIGILANTE - DIU 12H - C/INTRA', 'TERRACAP - CA06'],
    ['TERRACAP - ADE 05 SAMAMBAIA - VIGILANTE - NOT 12H', 'TERRACAP - ADE 05 SAMAMBAIA'],
    ['RESERVA IGUATEMI VIGILANTE DF - DU 12H - S/INTRA', 'RESERVA IGUATEMI'],
    ['SEC DE SAUDE - UBS 10 PLANALTINA - VIG. NOT 12X36- C/I', 'SEC DE SAUDE - UBS 10 PLANALTINA'],
    ['NOVACAP SEDE - BRIGADISTA LIDER DIU 12H - C/INTRA', 'NOVACAP SEDE'],
    ['NOVACAP BRIGADA PLANTONISTA - DIU 12H - S/INTRA', 'NOVACAP'],
    ['CNI CIDADE OCIDENTAL GO VIGILANTE MOT 12H NOT C/INTRA', 'CNI CIDADE OCIDENTAL'],
    ['SUPERMERCADO TATICO PAPILLON (P) VIGILANTE12H DIU S/INT', 'SUPERMERCADO TATICO PAPILLON (P)'],
    ['ARENA BSB SPE - VIGILANTE MOTO - DIU 12H - C/INTRA', 'ARENA BSB SPE'],
    ['HSLCD - VIGILANCIA - DIU 12H - C/INTRA', 'HSLCD'],
    ['PKS - INSPETOR DIU 12H - 10H/22H - S/INTRA', 'PKS'],
    ['SESC SERVIÇO SOCIAL DO COMERCIO - SEDE - 12HRS DIU - S/INTRA', 'SESC SERVIÇO SOCIAL DO COMERCIO - SEDE'],
  ])('%s -> %s', (original, esperado) => {
    expect(limparNomePosto(original)).toBe(esperado);
  });
});

describe('corrigirCoordenada', () => {
  it('mantém coordenada válida', () => expect(corrigirCoordenada(-15.781663, 90)).toBe(-15.781663));
  it('põe o ponto decimal que faltou', () => {
    expect(corrigirCoordenada(-164114747, 90)).toBeCloseTo(-16.4114747, 7);
    expect(corrigirCoordenada(-489230133, 180)).toBeCloseTo(-48.9230133, 7);
  });
  it('aceita texto com vírgula', () => expect(corrigirCoordenada('-15,79', 90)).toBe(-15.79));
  it('vazio vira null', () => {
    expect(corrigirCoordenada(null, 90)).toBeNull();
    expect(corrigirCoordenada('', 90)).toBeNull();
  });
});

describe('processarGeo', () => {
  it('junta o mesmo lugar com funções diferentes e ignora pendentes', () => {
    const r = processarGeo([
      { aba: 'DF - BRASILIA', nome: 'ARMANDO NETO - BOMBEIRO BRIGADISTA - 12H DIU', latitude: -15.790418, longitude: -47.879026, vermelha: false },
      { aba: 'DF - BRASILIA', nome: 'ARMANDO NETO - VIGILANTE - DIU 12H', latitude: -15.790476, longitude: -47.879024, vermelha: false },
      { aba: 'DF - BRASILIA', nome: 'BANCO X - VIGILANTE', latitude: null, longitude: null, vermelha: false },
      { aba: 'GOÍAS', nome: 'CONSERVAS OLE VIGILANTE 12H', latitude: -17.69, longitude: -49.15, vermelha: true },
    ]);
    expect(r.postos).toHaveLength(1);
    expect(r.postos[0]).toMatchObject({ nome: 'ARMANDO NETO', uf: 'DF', latitude: -15.790418 });
    expect(r.postos[0].origem).toHaveLength(2);
    expect(r.ignoradas.map(i => i.motivo)).toEqual(['sem coordenada', 'marcada em vermelho (pendente)']);
  });

  it('avisa coordenada repetida e fora do estado', () => {
    const r = processarGeo([
      { aba: 'DF - BRASILIA', nome: 'SESI SOBRADINHO - BOMBEIRO', latitude: -15.79646, longitude: -47.88263, vermelha: false },
      { aba: 'DF - BRASILIA', nome: 'SESI TAGUATINGA - BOMBEIRO', latitude: -15.79646, longitude: -47.88263, vermelha: false },
      { aba: 'DF - BRASILIA', nome: 'SESI GAMA - BOMBEIRO', latitude: -16.70206, longitude: -49.27952, vermelha: false },
    ]);
    const por = Object.fromEntries(r.postos.map(p => [p.nome, p.avisos.join(' / ')]));
    expect(por['SESI SOBRADINHO']).toContain('SESI TAGUATINGA');
    expect(por['SESI GAMA']).toBe('coordenada fora de DF');
  });

  it('estado pela aba; Mato Grosso pela longitude', () => {
    expect(ufDaLinha('DF - BRASILIA', 'X', -47.9)).toBe('DF');
    expect(ufDaLinha('GOÍAS', 'X', -49.15)).toBe('GO');
    expect(ufDaLinha('GOÍAS', 'BINATURAL', -56.08)).toBe('MT');
  });

  it('chave solta ignora acento, hífen e espaço', () => {
    expect(chaveSolta('TERRACAP - GARAGEM')).toBe(chaveSolta('Terracap Garagem'));
    expect(chaveSolta('SESI GUARÁ')).toBe(chaveSolta('sesi guara'));
  });
});
