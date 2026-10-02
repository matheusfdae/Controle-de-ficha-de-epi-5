import { describe, it, expect } from 'vitest';
import { parseDanfe, numeroBr, TextoPdf } from '@/lib/danfe';

// Página sintética no layout do DANFE: posições x/y como o pdf.js entrega
// (y cresce para cima). Larguras aproximadas por 4.5 pt por caractere.
const t = (str: string, x: number, y: number): TextoPdf => ({ str, x, y, w: str.length * 4.5 });

const CHAVE = '53261012345678000199550010000012341000012345';
const grupos = CHAVE.match(/.{4}/g)!.join(' ');

const pagina: TextoPdf[] = [
  t('DANFE', 250, 800),
  t('CHAVE DE ACESSO', 330, 780), t(grupos, 330, 770),
  t('EPI DISTRIBUIDORA LTDA', 40, 790), t('CNPJ', 400, 740), t('12.345.678/0001-99', 400, 730),
  t('DESTINATÁRIO / REMETENTE', 40, 700), t('CNPJ/CPF', 400, 690), t('11.222.333/0001-81', 400, 680),
  t('DATA DA EMISSÃO', 480, 690), t('30/09/2026', 480, 680),
  t('DADOS DO PRODUTO / SERVIÇO', 40, 600),
  // Cabeçalho do quadro, com "V. UNIT." quebrado em duas linhas
  t('CÓDIGO', 40, 585), t('DESCRIÇÃO DO PRODUTO / SERVIÇO', 90, 585), t('NCM/SH', 260, 585),
  t('CST', 300, 585), t('CFOP', 325, 585), t('UN', 355, 585), t('QUANT', 380, 585),
  t('V.', 430, 585), t('UNIT.', 425, 579), t('V. TOTAL', 470, 585),
  // Item 1, descrição continua na linha de baixo
  t('BOT-40', 40, 568), t('BOTINA SEGURANCA SPIDER PRO', 90, 568), t('64039990', 255, 568),
  t('0102', 300, 568), t('5102', 325, 568), t('PAR', 355, 568), t('10,0000', 380, 568),
  t('89,9000', 425, 568), t('899,00', 470, 568),
  t('CA 48583 N 40', 90, 560),
  // Item 2
  t('GAND-G', 40, 548), t('GANDOLA GABARDINE AZUL TAM GG', 90, 548), t('62034200', 255, 548),
  t('0102', 300, 548), t('5102', 325, 548), t('UN', 355, 548), t('1.200,0000', 375, 548),
  t('45,5000', 425, 548), t('54.600,00', 465, 548),
  t('DADOS ADICIONAIS', 40, 300), t('INFORMAÇÕES COMPLEMENTARES 123,0000', 40, 290),
];

describe('parseDanfe', () => {
  it('lê cabeçalho pela chave e itens pelo quadro de produtos', () => {
    const nfe = parseDanfe([pagina]);
    expect(nfe).toMatchObject({
      chave: CHAVE, numero: '1234', serie: '1', dataEmissao: '2026-09-30',
      fornecedor: { cnpj: '12345678000199' },
    });
    expect(nfe.cnpjsNoDocumento).toEqual(['12345678000199', '11222333000181']);
    expect(nfe.itens).toEqual([
      { nItem: 1, codigo: 'BOT-40', ean: null, descricao: 'BOTINA SEGURANCA SPIDER PRO CA 48583 N 40',
        unidade: 'PAR', quantidade: 10, valorUnitario: 89.9 },
      { nItem: 2, codigo: 'GAND-G', ean: null, descricao: 'GANDOLA GABARDINE AZUL TAM GG',
        unidade: 'UN', quantidade: 1200, valorUnitario: 45.5 },
    ]);
  });

  it('numera itens em sequência entre páginas', () => {
    const p2 = pagina.filter(i => i.y >= 540 && i.y <= 600 && !i.str.startsWith('GAND') && i.y !== 548);
    const nfe = parseDanfe([pagina, p2]);
    expect(nfe.itens.map(i => [i.nItem, i.codigo])).toEqual([[1, 'BOT-40'], [2, 'GAND-G'], [3, 'BOT-40']]);
  });

  it('explica quando o PDF é escaneado ou não é DANFE', () => {
    expect(() => parseDanfe([[]])).toThrow(/escaneado/);
    expect(() => parseDanfe([[t('Proposta comercial', 40, 700)]])).toThrow(/quadro de produtos/);
  });

  it('interpreta números em pt-BR', () => {
    expect(numeroBr('1.200,0000')).toBe(1200);
    expect(numeroBr('10,5')).toBe(10.5);
    expect(numeroBr('10.0000')).toBe(10);
    expect(numeroBr('1.200')).toBe(1200);
    expect(numeroBr('PAR')).toBeNull();
  });
});
