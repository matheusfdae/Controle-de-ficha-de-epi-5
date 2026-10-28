import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  compararContagem, compararTamanhos, gerarPlanilhaInventario, lerPlanilhaInventario, montarLinhasInventario,
  type ItemCatalogoInventario, type SaldoTamanho,
} from '@/lib/inventarioPlanilha';

const catalogo: ItemCatalogoInventario[] = [
  { id: 'luva', nome: 'Luva de raspa', tipo: 'epi', ca_numero: '123', ativo: true },
  { id: 'calca', nome: 'Calça Rip Stop', tipo: 'uniforme', ca_numero: null, ativo: true },
  { id: 'velho', nome: 'Capacete antigo', tipo: 'epi', ca_numero: null, ativo: false },
  { id: 'velho2', nome: 'Bota antiga', tipo: 'epi', ca_numero: null, ativo: false },
];
const saldos: SaldoTamanho[] = [
  { epi_id: 'luva', uf: 'DF', tamanho: 'ÚNICO', estoque: 10 },
  { epi_id: 'calca', uf: 'DF', tamanho: 'G', estoque: 3 },
  { epi_id: 'calca', uf: 'GO', tamanho: 'P', estoque: 5 },
  { epi_id: 'calca', uf: 'DF', tamanho: 'ÚNICO', estoque: 0 },
  { epi_id: 'velho', uf: 'DF', tamanho: 'ÚNICO', estoque: 2 },
  { epi_id: 'velho2', uf: 'GO', tamanho: 'ÚNICO', estoque: 4 },
];

describe('montarLinhasInventario', () => {
  const linhas = montarLinhasInventario(catalogo, saldos, 'DF');

  it('uniformes primeiro, por nome e tamanho; tamanhos de outros estados entram com saldo 0', () => {
    expect(linhas.map(l => `${l.item}|${l.tamanho}|${l.saldo}`)).toEqual([
      'Calça Rip Stop|P|0', 'Calça Rip Stop|G|3', 'Capacete antigo|ÚNICO|2', 'Luva de raspa|ÚNICO|10',
    ]);
  });

  it('inativo sem saldo no estado e "ÚNICO" que sobrou de cadastro antigo ficam de fora', () => {
    expect(linhas.some(l => l.item === 'Bota antiga')).toBe(false);
    expect(linhas.some(l => l.epiId === 'calca' && l.tamanho === 'ÚNICO')).toBe(false);
  });
});

describe('compararTamanhos', () => {
  it('ordem de roupa, depois números, ÚNICO por último', () => {
    expect(['GG', '40', 'ÚNICO', 'P', '38', 'M'].sort(compararTamanhos)).toEqual(['P', 'M', 'GG', '38', '40', 'ÚNICO']);
  });
});

/** Simula o almoxarifado: abre a planilha gerada e digita na coluna Contagem. */
async function preencher(bytes: ArrayBuffer, contagens: Record<string, ExcelJS.CellValue>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.getWorksheet('Contagem')!;
  const col: Record<string, number> = {};
  ws.getRow(1).eachCell((c, n) => { col[String(c.value)] = n; });
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const k = `${row.getCell(col['Item']).value}|${row.getCell(col['Tamanho']).value}`;
    if (k in contagens) row.getCell(col['Contagem']).value = contagens[k];
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('planilha de inventário (ida e volta)', () => {
  const linhas = montarLinhasInventario(catalogo, saldos, 'DF');

  it('contagem às cegas não leva a coluna de saldo visível', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await gerarPlanilhaInventario(linhas, { uf: 'DF', mostrarSaldo: false, geradoPor: 'Teste' }));
    const cab: string[] = [];
    wb.getWorksheet('Contagem')!.getRow(1).eachCell(c => { cab.push(String(c.value)); });
    expect(cab).not.toContain('Saldo no sistema');
    expect(wb.getWorksheet('Informações')!.getCell('B1').value).toBe('DF');
  });

  it('lê o estado, as contagens e quem ficou em branco', async () => {
    const bytes = await gerarPlanilhaInventario(linhas, { uf: 'DF', mostrarSaldo: true, geradoPor: 'Teste' });
    const r = await lerPlanilhaInventario(await preencher(bytes, { 'Calça Rip Stop|G': 1, 'Luva de raspa|ÚNICO': '12', 'Calça Rip Stop|P': 0 }));
    expect(r.uf).toBe('DF');
    expect(r.erros).toEqual([]);
    expect(r.linhas.map(l => [l.epiId, l.tamanho, l.contado, l.saldoPlanilha])).toEqual([
      ['calca', 'P', 0, 0], ['calca', 'G', 1, 3], ['velho', 'ÚNICO', null, 2], ['luva', 'ÚNICO', 12, 10],
    ]);
  });

  it('aponta contagem que não é número inteiro', async () => {
    const bytes = await gerarPlanilhaInventario(linhas, { uf: 'DF', mostrarSaldo: false, geradoPor: 'Teste' });
    const r = await lerPlanilhaInventario(await preencher(bytes, { 'Luva de raspa|ÚNICO': 'dez', 'Calça Rip Stop|G': 2.5 }));
    expect(r.erros).toHaveLength(2);
    expect(r.erros[0]).toContain('Calça Rip Stop');
  });

  it('recusa arquivo que não é a planilha de inventário', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Plan1').addRow(['a']);
    await expect(lerPlanilhaInventario((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow('planilha de inventário');
  });
});

describe('compararContagem', () => {
  it('diferença contra o saldo de agora; avisa quando mudou depois da planilha; branco fica de fora', () => {
    const r = compararContagem([
      { epiId: 'calca', tamanho: 'G', item: 'Calça', contado: 1, observacao: '', saldoPlanilha: 3 },
      { epiId: 'luva', tamanho: 'ÚNICO', item: 'Luva', contado: 12, observacao: '', saldoPlanilha: 9 },
      { epiId: 'velho', tamanho: 'ÚNICO', item: 'Capacete', contado: null, observacao: 'quebrado', saldoPlanilha: 2 },
    ], saldos, 'DF');
    expect(r.map(x => [x.epiId, x.atual, x.contado, x.diferenca, x.mudouDesdePlanilha])).toEqual([
      ['calca', 3, 1, -2, false], ['luva', 10, 12, 2, true],
    ]);
  });
});
