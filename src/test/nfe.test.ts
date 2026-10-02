import { describe, it, expect } from 'vitest';
import { parseNFeXml, sugerirEpi, extrairCA, extrairTamanho, casarTamanho } from '@/lib/nfe';

const CHAVE = '53261012345678000199550010000012341000012345';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
  <ide><serie>1</serie><nNF>1234</nNF><dhEmi>2026-09-30T10:15:00-03:00</dhEmi></ide>
  <emit><CNPJ>12345678000199</CNPJ><xNome>EPI DISTRIBUIDORA LTDA</xNome></emit>
  <det nItem="1"><prod><cProd>BOT-40</cProd><cEAN>SEM GTIN</cEAN>
    <xProd>BOTINA SEGURANCA SPIDER PRO CA 48583 N 40</xProd><uCom>PAR</uCom>
    <qCom>10.0000</qCom><vUnCom>89.9000000000</vUnCom></prod></det>
  <det nItem="2"><prod><cProd>GAND-G</cProd><cEAN>7891234567895</cEAN>
    <xProd>GANDOLA GABARDINE AZUL TAM GG</xProd><uCom>UN</uCom>
    <qCom>25</qCom><vUnCom>45.5</vUnCom></prod></det>
 </infNFe></NFe>
 <protNFe><infProt><chNFe>${CHAVE}</chNFe></infProt></protNFe>
</nfeProc>`;

const catalogo = [
  { id: 'sapato', nome: 'Sapato Antiderrapante Spider Pro', ca_numero: '48583', codigo: null },
  { id: 'gandola', nome: 'Gandola em Gabardine Azul', ca_numero: null, codigo: null },
  { id: 'calca', nome: 'Calça em Gabardine Azul', ca_numero: null, codigo: null },
  { id: 'luva', nome: 'Luva Nitrílica', ca_numero: '12345', codigo: 'LUV01' },
];

describe('parseNFeXml', () => {
  it('lê cabeçalho e itens de um nfeProc', () => {
    const nfe = parseNFeXml(xml);
    expect(nfe).toMatchObject({
      chave: CHAVE, numero: '1234', serie: '1', dataEmissao: '2026-09-30',
      fornecedor: { nome: 'EPI DISTRIBUIDORA LTDA', cnpj: '12345678000199' },
    });
    expect(nfe.itens).toEqual([
      { nItem: 1, codigo: 'BOT-40', ean: null, descricao: 'BOTINA SEGURANCA SPIDER PRO CA 48583 N 40',
        unidade: 'PAR', quantidade: 10, valorUnitario: 89.9 },
      { nItem: 2, codigo: 'GAND-G', ean: '7891234567895', descricao: 'GANDOLA GABARDINE AZUL TAM GG',
        unidade: 'UN', quantidade: 25, valorUnitario: 45.5 },
    ]);
  });

  it('recusa arquivos que não são NF-e completa', () => {
    expect(() => parseNFeXml('isto não é xml')).toThrow(/XML válido/);
    expect(() => parseNFeXml('<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"/>')).toThrow(/resumo/);
    expect(() => parseNFeXml('<cte/>')).toThrow(/não é um XML de NF-e/);
  });
});

describe('sugestão de EPI', () => {
  it('extrai CA e tamanho da descrição', () => {
    expect(extrairCA('LUVA NITRILICA C.A.: 12345')).toBe('12345');
    expect(extrairCA('BOTINA CA Nº 48583 PRETA')).toBe('48583');
    expect(extrairCA('CAMISA POLO AZUL')).toBeNull();
    expect(extrairTamanho('GANDOLA TAM GG')).toBe('GG');
    expect(extrairTamanho('BOTINA SPIDER Nº 42')).toBe('42');
    expect(extrairTamanho('CALCA BRIM AZUL - G')).toBe('G');
    expect(extrairTamanho('CAPACETE ABA FRONTAL')).toBeNull();
    expect(extrairTamanho('RESPIRADOR PFF2 N95')).toBeNull();
  });

  it('prioriza memória do fornecedor, depois CA, código e nome', () => {
    const memoria = [{ fornecedor_cnpj: '12345678000199', codigo_fornecedor: 'GAND-G', epi_id: 'calca', tamanho: 'G' }];
    expect(sugerirEpi({ codigo: 'GAND-G', descricao: 'GANDOLA GABARDINE AZUL TAM GG' }, '12.345.678/0001-99', catalogo, memoria))
      .toEqual({ epiId: 'calca', tamanho: 'G', origem: 'memoria' });
    expect(sugerirEpi({ codigo: 'X', descricao: 'BOTINA SPIDER CA 48583 N 40' }, null, catalogo, []))
      .toEqual({ epiId: 'sapato', tamanho: '40', origem: 'ca' });
    expect(sugerirEpi({ codigo: 'luv01', descricao: 'LUVA' }, null, catalogo, []))
      .toEqual({ epiId: 'luva', tamanho: null, origem: 'codigo' });
    expect(sugerirEpi({ codigo: 'Z', descricao: 'GANDOLA GABARDINE AZUL TAM GG' }, null, catalogo, []))
      .toEqual({ epiId: 'gandola', tamanho: 'GG', origem: 'nome' });
    expect(sugerirEpi({ codigo: 'Z', descricao: 'PROTETOR AURICULAR PLUG' }, null, catalogo, [])).toBeNull();
  });

  it('casa tamanho com o já cadastrado', () => {
    expect(casarTamanho('gg', ['P', 'GG'])).toBe('GG');
    expect(casarTamanho('XG', ['P', 'GG'])).toBe('XG');
    expect(casarTamanho(null, ['P'])).toBeNull();
  });
});
