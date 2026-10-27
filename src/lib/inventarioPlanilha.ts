// Planilha de inventário (contagem física) do estoque de um estado.
// Vai para o almoxarifado em branco na coluna "Contagem"; volta preenchida e a
// tela compara com o saldo do sistema antes de gravar (aplicar_inventario_estoque).
// Cada linha leva um código interno (item|tamanho) numa coluna escondida, para a
// volta não depender do nome do item.
import ExcelJS from 'exceljs';

export const TAMANHO_UNICO = 'ÚNICO';
const ABA_CONTAGEM = 'Contagem';
const ABA_INFO = 'Informações';
const COL = {
  tipo: 'Tipo', item: 'Item', ca: 'CA', tamanho: 'Tamanho', saldo: 'Saldo no sistema',
  contagem: 'Contagem', obs: 'Observação', codigo: 'Código interno', saldoGeracao: 'Saldo na geração',
};

export interface ItemCatalogoInventario {
  id: string; nome: string; tipo: 'epi' | 'uniforme'; ca_numero: string | null; ativo: boolean;
}
export interface SaldoTamanho { epi_id: string; uf: string; tamanho: string; estoque: number }

export interface LinhaInventario {
  epiId: string; item: string; tipo: 'epi' | 'uniforme'; ca: string; tamanho: string; saldo: number;
}

export interface LinhaContada {
  epiId: string; tamanho: string; item: string;
  /** null = não contado (fica como está). */
  contado: number | null;
  observacao: string;
  saldoPlanilha: number | null;
}

export interface ComparacaoContagem extends LinhaContada {
  contado: number;
  atual: number;
  diferenca: number;
  /** O saldo do sistema mudou entre gerar a planilha e subir a contagem (entrega, entrada...). */
  mudouDesdePlanilha: boolean;
}

const chave = (epiId: string, tamanho: string) => `${epiId}|${tamanho}`;

const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'EXG', 'G1', 'G2', 'G3', 'G4'];

/** PP < P < M < G < GG ...; números em ordem numérica; ÚNICO por último. */
export function compararTamanhos(a: string, b: string): number {
  const peso = (t: string) => {
    const s = t.trim().toUpperCase();
    if (s === TAMANHO_UNICO) return [3, 0, s] as const;
    const i = ORDEM_TAMANHOS.indexOf(s);
    if (i >= 0) return [0, i, s] as const;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? [1, n, s] as const : [2, 0, s] as const;
  };
  const [ga, va, sa] = peso(a);
  const [gb, vb, sb] = peso(b);
  return ga - gb || va - vb || sa.localeCompare(sb, 'pt-BR');
}

/**
 * Uma linha por item × tamanho do estado. Os tamanhos de cada item são os que ele
 * tem em QUALQUER estado (para o contador achar o tamanho mesmo sem saldo aqui);
 * item sem tamanho vira ÚNICO. Item inativo só entra se ainda tiver saldo no estado.
 */
export function montarLinhasInventario(
  catalogo: ItemCatalogoInventario[], saldos: SaldoTamanho[], uf: string,
): LinhaInventario[] {
  const tamanhos = new Map<string, Set<string>>();
  const saldoUf = new Map<string, number>();
  for (const s of saldos) {
    const tam = s.tamanho?.trim() || TAMANHO_UNICO;
    if (!tamanhos.has(s.epi_id)) tamanhos.set(s.epi_id, new Set());
    tamanhos.get(s.epi_id)!.add(tam);
    if (s.uf === uf) saldoUf.set(chave(s.epi_id, tam), (saldoUf.get(chave(s.epi_id, tam)) ?? 0) + s.estoque);
  }
  const linhas: LinhaInventario[] = [];
  for (const it of catalogo) {
    const tams = [...(tamanhos.get(it.id) ?? new Set([TAMANHO_UNICO]))];
    // "ÚNICO" junto com tamanhos de verdade é resto de cadastro antigo: só entra se tiver saldo.
    const usados = tams.length > 1 ? tams.filter(t => t !== TAMANHO_UNICO || (saldoUf.get(chave(it.id, t)) ?? 0) > 0) : tams;
    const temSaldo = usados.some(t => (saldoUf.get(chave(it.id, t)) ?? 0) > 0);
    if (!it.ativo && !temSaldo) continue;
    for (const t of usados) {
      linhas.push({ epiId: it.id, item: it.nome, tipo: it.tipo, ca: it.ca_numero ?? '', tamanho: t, saldo: saldoUf.get(chave(it.id, t)) ?? 0 });
    }
  }
  return linhas.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'uniforme' ? -1 : 1)
    || a.item.localeCompare(b.item, 'pt-BR') || compararTamanhos(a.tamanho, b.tamanho));
}

const AZUL = 'FF1D4ED8';
const AMARELO = 'FFFFF4C2';

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Gera o .xlsx de contagem. Sem `mostrarSaldo`, é contagem às cegas (o saldo vai escondido). */
export async function gerarPlanilhaInventario(linhas: LinhaInventario[], o: {
  uf: string; mostrarSaldo: boolean; geradoPor: string; geradoEm?: Date;
}): Promise<ArrayBuffer> {
  const quando = (o.geradoEm ?? new Date()).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const wb = new ExcelJS.Workbook();
  wb.creator = o.geradoPor;
  const ws = wb.addWorksheet(ABA_CONTAGEM, { views: [{ state: 'frozen', ySplit: 1 }] });
  const colunas: Partial<ExcelJS.Column>[] = [
    { header: COL.tipo, key: 'tipo', width: 10 },
    { header: COL.item, key: 'item', width: 44 },
    { header: COL.ca, key: 'ca', width: 10 },
    { header: COL.tamanho, key: 'tamanho', width: 10 },
    ...(o.mostrarSaldo ? [{ header: COL.saldo, key: 'saldo', width: 12 }] : []),
    { header: COL.contagem, key: 'contagem', width: 12 },
    { header: COL.obs, key: 'obs', width: 36 },
    { header: COL.codigo, key: 'codigo', width: 20, hidden: true },
    { header: COL.saldoGeracao, key: 'saldoGeracao', width: 12, hidden: true },
  ];
  ws.columns = colunas;
  for (const l of linhas) {
    ws.addRow({
      tipo: l.tipo === 'uniforme' ? 'Uniforme' : 'EPI', item: l.item, ca: l.ca, tamanho: l.tamanho,
      saldo: l.saldo, contagem: null, obs: null, codigo: chave(l.epiId, l.tamanho), saldoGeracao: l.saldo,
    });
  }

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  cab.alignment = { vertical: 'middle' };
  cab.height = 20;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length - 2 } };

  // Só "Contagem" e "Observação" ficam liberadas para digitar; Contagem só aceita número inteiro >= 0.
  const cContagem = ws.getColumn('contagem');
  const cObs = ws.getColumn('obs');
  for (let r = 2; r <= linhas.length + 1; r++) {
    const c = ws.getCell(r, cContagem.number);
    c.protection = { locked: false };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    c.dataValidation = {
      type: 'whole', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true,
      errorTitle: 'Contagem', error: 'Digite só a quantidade contada (número inteiro, 0 ou mais).',
    };
    ws.getCell(r, cObs.number).protection = { locked: false };
  }
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, formatColumns: true });

  ws.pageSetup = {
    orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    printTitlesRow: '1:1', margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter.oddHeader = `&L&BInventário de estoque — ${o.uf}&R${quando}`;
  ws.headerFooter.oddFooter = '&LContado por: ____________________   Data: ___/___/______&RPágina &P de &N';

  const info = wb.addWorksheet(ABA_INFO);
  info.columns = [{ width: 22 }, { width: 70 }];
  info.addRows([
    ['Estado', o.uf],
    ['Gerada em', quando],
    ['Gerada por', o.geradoPor],
    ['Linhas', linhas.length],
    [],
    ['Como preencher', '1. Conte cada item no almoxarifado e digite a quantidade na coluna amarela "Contagem".'],
    ['', '2. Item que não existe na prateleira: digite 0. Deixe em branco só o que não foi contado.'],
    ['', '3. Tamanho ou item que não está na lista: escreva na coluna "Observação" da linha mais próxima.'],
    ['', '4. Não apague nem mude a ordem das linhas. Salve e devolva o arquivo para subir no sistema.'],
  ]);
  info.getColumn(1).font = { bold: true };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const textoCelula = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return textoCelula(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('text' in v) return String(v.text);
  }
  return String(v).trim();
};

/** Lê a planilha devolvida. `erros` lista as linhas com contagem que não é um número inteiro >= 0. */
export async function lerPlanilhaInventario(arquivo: ArrayBuffer): Promise<{ uf: string | null; linhas: LinhaContada[]; erros: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo);
  } catch {
    throw new Error('Não consegui abrir o arquivo. Envie a planilha .xlsx gerada pelo sistema.');
  }
  const ws = wb.getWorksheet(ABA_CONTAGEM);
  if (!ws) throw new Error(`Esta não é a planilha de inventário do sistema (falta a aba "${ABA_CONTAGEM}").`);

  const coluna: Record<string, number> = {};
  ws.getRow(1).eachCell((c, n) => { coluna[textoCelula(c.value)] = n; });
  for (const nome of [COL.item, COL.tamanho, COL.contagem, COL.codigo]) {
    if (!coluna[nome]) throw new Error(`A planilha está sem a coluna "${nome}". Gere uma nova pelo sistema.`);
  }

  const infoUf = wb.getWorksheet(ABA_INFO)?.getCell('B1').value;
  const linhas: LinhaContada[] = [];
  const erros: string[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const codigo = textoCelula(row.getCell(coluna[COL.codigo]).value);
    const [epiId, tamanho] = codigo.split('|');
    if (!epiId || !tamanho) return;
    const item = textoCelula(row.getCell(coluna[COL.item]).value);
    const bruto = textoCelula(row.getCell(coluna[COL.contagem]).value);
    let contado: number | null = null;
    if (bruto !== '') {
      const n = Number(bruto.replace(',', '.'));
      if (!Number.isInteger(n) || n < 0) {
        erros.push(`Linha ${r} (${item}, ${tamanho}): "${bruto}" não é uma quantidade válida`);
      } else {
        contado = n;
      }
    }
    const saldoTxt = coluna[COL.saldoGeracao] ? textoCelula(row.getCell(coluna[COL.saldoGeracao]).value) : '';
    linhas.push({
      epiId, tamanho, item, contado,
      observacao: coluna[COL.obs] ? textoCelula(row.getCell(coluna[COL.obs]).value) : '',
      saldoPlanilha: saldoTxt === '' ? null : Number(saldoTxt),
    });
  });
  return { uf: infoUf ? textoCelula(infoUf) : null, linhas, erros };
}

/** Compara o que foi contado com o saldo de agora; linhas em branco ficam de fora. */
export function compararContagem(linhas: LinhaContada[], saldosAgora: SaldoTamanho[], uf: string): ComparacaoContagem[] {
  const agora = new Map<string, number>();
  for (const s of saldosAgora) {
    if (s.uf !== uf) continue;
    const k = chave(s.epi_id, s.tamanho?.trim() || TAMANHO_UNICO);
    agora.set(k, (agora.get(k) ?? 0) + s.estoque);
  }
  const vistos = new Set<string>();
  const res: ComparacaoContagem[] = [];
  for (const l of linhas) {
    if (l.contado === null || vistos.has(chave(l.epiId, l.tamanho))) continue;
    vistos.add(chave(l.epiId, l.tamanho));
    const atual = agora.get(chave(l.epiId, l.tamanho)) ?? 0;
    res.push({
      ...l, contado: l.contado, atual, diferenca: l.contado - atual,
      mudouDesdePlanilha: l.saldoPlanilha !== null && l.saldoPlanilha !== atual,
    });
  }
  return res;
}
