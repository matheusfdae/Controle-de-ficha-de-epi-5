import ExcelJS from 'exceljs';
import { LinhaGeo } from '@/lib/geoPlanilha';

const valor = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map(t => t.text).join('');
  }
  return v;
};

/** Fundo avermelhado (ex.: FFC7CE do "estilo ruim" do Excel) = linha pendente. */
function ehVermelho(cell: ExcelJS.Cell): boolean {
  const argb = cell.fill && 'fgColor' in cell.fill ? cell.fill.fgColor?.argb : undefined;
  if (!argb || argb.length < 8) return false;
  const [r, g, b] = [2, 4, 6].map(i => parseInt(argb.slice(i, i + 2), 16));
  return r >= 200 && r - g >= 40 && r - b >= 30;
}

/**
 * Lê a planilha GEO: em cada aba (menos RESUMO), colunas
 * Nome Posto | Latitude | Longitude | ... (cabeçalho na linha 1).
 */
export async function lerPlanilhaGeo(arquivo: ArrayBuffer): Promise<LinhaGeo[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo);
  const linhas: LinhaGeo[] = [];
  for (const ws of wb.worksheets) {
    const cab = ws.getRow(1).values as ExcelJS.CellValue[];
    const textoCab = cab.map(c => String(valor(c) ?? '').toLowerCase()).join('|');
    if (!textoCab.includes('nome') || !/lat|lag/.test(textoCab)) continue; // aba RESUMO etc.
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const nome = String(valor(row.getCell(1).value) ?? '').trim();
      if (!nome) return;
      linhas.push({
        aba: ws.name,
        nome,
        latitude: valor(row.getCell(2).value),
        longitude: valor(row.getCell(3).value),
        vermelha: [1, 2, 3].some(c => ehVermelho(row.getCell(c))),
      });
    });
  }
  return linhas;
}
