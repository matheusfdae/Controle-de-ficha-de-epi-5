import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { definirLogoTermo, listaCas, pdfTermoEntregaEpi, type LinhaTermoPdf } from '@/lib/termoEpiPdf';
import { distribuidoPorEpi } from '@/modules/pedidos/lib/pedidosService';

const SAIDA = process.env.PDF_SAIDA;
// Assinatura de teste: PNG 1x1 (a do celular é um PNG 3:1).
const ASSINATURA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Termo de EPI', () => {
  it('lista de CAs: um por material, "isento" e sem CA', () => {
    expect(listaCas([
      { material: 'Luva de látex', ca: '10.695' }, { material: 'Luva de látex', ca: '10.695' },
      { material: 'Óculos de proteção', ca: 'CA 36655' }, { material: 'Máscara descartável', ca: 'Isenta' }, { material: 'Bota', ca: null },
    ])).toEqual(['Luva de látex - CA 10.695', 'Óculos de proteção - CA 36655', 'Máscara descartável - isento', 'Bota - CA não informado']);
  });

  it('soma distribuída por EPI do pedido', () => {
    expect(distribuidoPorEpi([
      { pedido_item_id: 'luva', quantidade: 4 }, { pedido_item_id: 'luva', quantidade: 5 }, { pedido_item_id: 'oculos', quantidade: 1 }, { pedido_item_id: null, quantidade: 9 },
    ])).toEqual({ luva: 9, oculos: 1 });
  });

  it('PDF no modelo da planilha: 1 página com poucos nomes, mais páginas com muitos', async () => {
    try { definirLogoTermo('data:image/png;base64,' + readFileSync('src/assets/logo-5estrelas-horizontal.png').toString('base64')); }
    catch { definirLogoTermo(null); }
    const linhas = (n: number): LinhaTermoPdf[] => Array.from({ length: n }, (_, i) => ({
      colaborador_nome: ['ANA PAULA FERREIRA DOS SANTOS', 'BRUNO LIMA', 'MARIA APARECIDA SOUZA'][i % 3], material: i % 4 === 3 ? 'Óculos de proteção' : 'Luva de látex',
      ca: i % 4 === 3 ? '36655' : '10.695', quantidade: 1 + (i % 3), assinatura_url: i % 2 ? null : ASSINATURA, data_assinatura: i % 2 ? null : '2026-11-05T13:30:00Z',
    }));
    const termo = { posto: 'EMBAIXADA DA RUANDA', mes_referencia: '11/2026', lider: 'JULIANA RODRIGUES' };
    const curto = await pdfTermoEntregaEpi({ ...termo, linhas: linhas(5) }, false);
    expect(curto.getNumberOfPages()).toBe(1);
    const longo = await pdfTermoEntregaEpi({ ...termo, linhas: linhas(40) }, false);
    expect(longo.getNumberOfPages()).toBeGreaterThan(1);
    if (SAIDA) {
      writeFileSync(`${SAIDA}/termo-epi-curto.pdf`, Buffer.from(curto.output('arraybuffer')));
      writeFileSync(`${SAIDA}/termo-epi-longo.pdf`, Buffer.from(longo.output('arraybuffer')));
    }
  });
});
