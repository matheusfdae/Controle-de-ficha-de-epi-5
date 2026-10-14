// deno-lint-ignore-file
// Planilha .xlsx mínima, sem dependências (roda na Edge Function, no vite e no
// navegador): uma aba, cabeçalho em negrito com filtro, primeira linha
// congelada e largura das colunas. O .xlsx é um ZIP de arquivos XML; aqui o ZIP
// é gravado sem compressão ("stored"), que o Excel abre normalmente.

export type Celula = string | number | null | undefined;

const enc = new TextEncoder();

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP sem compressão com os arquivos dados. */
function zip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true); v.setUint16(10, 0, true); v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true); v.setUint32(18, a.dados.length, true); v.setUint32(22, a.dados.length, true);
    v.setUint16(26, nome.length, true); v.setUint16(28, 0, true);
    local.set(nome, 30);
    partes.push(local, a.dados);

    const cab = new Uint8Array(46 + nome.length);
    const w = new DataView(cab.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true); w.setUint16(12, 0, true); w.setUint16(14, 0x21, true);
    w.setUint32(16, crc, true); w.setUint32(20, a.dados.length, true); w.setUint32(24, a.dados.length, true);
    w.setUint16(28, nome.length, true); w.setUint32(42, deslocamento, true);
    cab.set(nome, 46);
    central.push(cab);
    deslocamento += local.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamCentral, true); f.setUint32(16, deslocamento, true);
  const tudo = [...partes, ...central, fim];
  const saida = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of tudo) { saida.set(p, i); i += p.length; }
  return saida;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de controle não são válidos em XML.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Letra da coluna: 0 -> A, 25 -> Z, 26 -> AA. */
function coluna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Gera o .xlsx: `cabecalho` na linha 1 (negrito, com filtro e congelada) e
 * `linhas` abaixo. `larguras` em caracteres, uma por coluna.
 */
export function gerarXlsx(aba: string, cabecalho: string[], linhas: Celula[][], larguras: number[] = []): Uint8Array {
  const celula = (v: Celula, ref: string, estilo = 0) => {
    if (v === null || v === undefined || v === '') return '';
    const s = estilo ? ` s="${estilo}"` : '';
    return typeof v === 'number' && Number.isFinite(v)
      ? `<c r="${ref}"${s}><v>${v}</v></c>`
      : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
  };
  const todas = [cabecalho as Celula[], ...linhas];
  const linhasXml = todas.map((l, r) =>
    `<row r="${r + 1}">${l.map((v, c) => celula(v, `${coluna(c)}${r + 1}`, r === 0 ? 1 : 0)).join('')}</row>`).join('');
  const ultima = `${coluna(Math.max(cabecalho.length - 1, 0))}${todas.length}`;
  const cols = larguras.length
    ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';

  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${linhasXml}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`;
  const nomeAba = xml(aba.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  const arquivos: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nomeAba}'!$A$1:$${coluna(Math.max(cabecalho.length - 1, 0))}$${todas.length}</definedName></definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', planilha],
  ];
  return zip(arquivos.map(([nome, conteudo]) => ({ nome, dados: enc.encode(conteudo) })));
}

/** Base64 dos bytes (anexo do e-mail). */
export function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
