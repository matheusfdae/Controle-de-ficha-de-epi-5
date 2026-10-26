import { describe, expect, it } from 'vitest';
import { celularDe, montarMensagem, numeroWhatsApp, prepararEnvios, validarEnvios } from '../../supabase/functions/_shared/whatsapp';
import type { ConvocacaoUniforme } from '@/lib/convocacaoUniforme';

describe('numeroWhatsApp', () => {
  it('aceita celular com ou sem máscara, 55 e zero do DDD', () => {
    expect(numeroWhatsApp('(61) 99876-5432')).toBe('5561998765432');
    expect(numeroWhatsApp('61998765432')).toBe('5561998765432');
    expect(numeroWhatsApp('+55 61 99876-5432')).toBe('5561998765432');
    expect(numeroWhatsApp('061998765432')).toBe('5561998765432');
  });

  it('completa o 9 do celular no formato antigo (8 dígitos começando com 6 a 9)', () => {
    expect(numeroWhatsApp('6196494477')).toBe('5561996494477');
    expect(numeroWhatsApp('(61) 8123-4567')).toBe('5561981234567');
    expect(numeroWhatsApp('55 61 7123-4567')).toBe('5561971234567');
  });

  it('recusa fixo, sem DDD e vazio', () => {
    expect(numeroWhatsApp('(61) 3344-5566')).toBeNull();
    expect(numeroWhatsApp('998765432')).toBeNull();
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });
});

describe('montarMensagem', () => {
  it('usa o primeiro nome e diz se está vencida', () => {
    const m = montarMensagem({ nome: 'MARIA DA SILVA', dataTroca: '2026-09-01', diasRestantes: -10 });
    expect(m).toContain('Olá, Maria!');
    expect(m).toContain('está vencida desde 01/09/2026');
  });

  it('avisa quando ainda vai vencer', () => {
    expect(montarMensagem({ nome: 'João', dataTroca: '2026-11-20', diasRestantes: 25 })).toContain('vence em 20/11/2026');
  });

  it('troca os campos do texto editado; campo desconhecido fica como está', () => {
    const m = montarMensagem({ nome: 'ana maria souza', dataTroca: '2026-11-20', diasRestantes: 25, posto: 'TERRACAP' },
      '{nome}, troca em {data} no {posto}. {nome_completo} {outro}');
    expect(m).toBe('Ana, troca em 20/11/2026 no TERRACAP. ana maria souza {outro}');
  });
});

describe('validarEnvios', () => {
  it('normaliza o celular e tira o número repetido', () => {
    expect(validarEnvios([
      { nome: 'A', numero: '(61) 99999-0000', texto: 'oi' },
      { nome: 'B', numero: '5561999990000', texto: 'oi' },
    ])).toEqual([{ nome: 'A', numero: '5561999990000', texto: 'oi' }]);
  });

  it('recusa lista vazia, celular inválido e texto vazio', () => {
    expect(() => validarEnvios([])).toThrow('Nenhum colaborador');
    expect(() => validarEnvios([{ nome: 'A', numero: '6133334444', texto: 'oi' }])).toThrow('Celular inválido');
    expect(() => validarEnvios([{ nome: 'A', numero: '61999990000', texto: '  ' }])).toThrow('Mensagem vazia');
  });
});

describe('celularDe', () => {
  it('prefere o celular da Senior', () => {
    expect(celularDe({ telefone: '61 99999-1111', telefonesFicha: ['61 98888-2222'] }))
      .toEqual({ numero: '5561999991111', origem: 'senior' });
  });

  it('sem celular na Senior, usa o primeiro celular válido das fichas', () => {
    expect(celularDe({ telefone: '61 3333-4444', telefonesFicha: ['6133335555', '(61) 98888-2222', '61 97777-3333'] }))
      .toEqual({ numero: '5561988882222', origem: 'ficha' });
  });

  it('nenhum celular em lugar nenhum', () => {
    expect(celularDe({ telefone: '', telefonesFicha: ['6133335555'] })).toBeNull();
  });
});

describe('prepararEnvios', () => {
  const t = (nome: string, telefone: string, telefonesFicha: string[] = []) =>
    ({ nome, telefone, telefonesFicha, dataTroca: '2026-11-01', diasRestantes: 5 }) as ConvocacaoUniforme;

  it('usa o celular da ficha quando a Senior não tem', () => {
    const r = prepararEnvios([t('Davi', '', ['61 97777-0000'])]);
    expect(r.envios).toMatchObject([{ nome: 'Davi', numero: '5561977770000', origem: 'ficha' }]);
  });

  it('separa quem não tem celular e não manda duas vezes para o mesmo número', () => {
    const r = prepararEnvios([t('Ana', '61 99999-0000'), t('Bia', ''), t('Ana 2', '(61) 99999-0000'), t('Caio', '6133334444')]);
    expect(r.envios.map(e => e.nome)).toEqual(['Ana']);
    expect(r.semCelular).toEqual(['Bia', 'Caio']);
  });
});
