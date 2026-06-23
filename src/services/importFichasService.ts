import ExcelJS from 'exceljs';
import { EPIFicha, EPIItem } from '@/types/epi';
import { saveFicha, generateId } from './fichaService';

export interface ImportResult {
  total: number;
  sucesso: number;
  erros: { linha: number; motivo: string }[];
}

const norm = (s: string) =>
  s.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const COLUMN_ALIASES: Record<string, string> = {
  nome: 'nome', nome_funcionario: 'nome', funcionario: 'nome', colaborador: 'nome',
  cpf: 'cpf',
  matricula: 'matricula',
  funcao: 'funcao', cargo: 'funcao',
  setor: 'posto', departamento: 'posto', posto_servico: 'posto',
  posto: 'posto',
  empresa: 'empresa',
  telefone: 'telefone', celular: 'telefone', whatsapp: 'telefone',
  motivo: 'motivo',
  turno: 'turno',
  data_entrega: 'data_entrega', entrega: 'data_entrega',
  observacoes: 'observacoes', obs: 'observacoes',
  descricao: 'descricao', item: 'descricao', epi: 'descricao', descricao_item: 'descricao',
  ca: 'ca', numero_ca: 'ca', n_ca: 'ca',
  quantidade: 'quantidade', qtd: 'quantidade', qtde: 'quantidade',
  tamanho: 'tamanho', numeracao: 'tamanho',
  local: 'posto',
  data_validade: 'data_validade', validade: 'data_validade',
};

function parseDate(value: any): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = value.toString().trim();
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  return undefined;
}

function cellValue(v: any): any {
  if (v === null || v === undefined) return '';
  // ExcelJS may return objects for rich text/hyperlink/formula results
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('text' in v) return v.text;
    if ('result' in v) return v.result;
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((r: any) => r.text).join('');
    }
    if ('hyperlink' in v) return v.text || v.hyperlink;
  }
  return v;
}

export async function importFichasFromExcel(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.worksheets[0];

  const rows: any[] = [];
  if (sheet) {
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = (cellValue(cell.value) || '').toString();
    });
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const h = headers[col];
        if (h) obj[h] = cellValue(cell.value);
      });
      rows.push({ __linha: rowNumber, ...obj });
    });
  }

  const result: ImportResult = { total: rows.length, sucesso: 0, erros: [] };

  const normalized = rows.map((row) => {
    const out: Record<string, any> = { __linha: row.__linha };
    for (const [k, v] of Object.entries(row)) {
      if (k === '__linha') continue;
      const canonical = COLUMN_ALIASES[norm(k)] || norm(k);
      out[canonical] = v;
    }
    return out;
  });

  const groups = new Map<string, any[]>();
  for (const r of normalized) {
    const nome = (r.nome || '').toString().trim();
    if (!nome) {
      result.erros.push({ linha: r.__linha, motivo: 'Nome do funcionário ausente' });
      continue;
    }
    const key = `${nome}__${r.cpf || ''}__${r.data_entrega || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [, lines] of groups) {
    const first = lines[0];
    const itens: EPIItem[] = lines
      .filter(l => (l.descricao || '').toString().trim())
      .map(l => ({
        id: generateId(),
        descricao: (l.descricao || '').toString().trim(),
        ca: (l.ca || '').toString().trim(),
        quantidade: parseInt(l.quantidade) || 1,
        tamanho: (l.tamanho || '').toString().trim(),
        dataEntrega: parseDate(first.data_entrega) || new Date().toISOString().split('T')[0],
        postoServico: (l.posto || '').toString().trim(),
        recebido: false,
        dataValidade: parseDate(l.data_validade),
      }));

    const ficha: EPIFicha = {
      id: generateId(),
      nomeFuncionario: (first.nome || '').toString().trim(),
      funcao: (first.funcao || '').toString().trim(),
      telefone: (first.telefone || '').toString().trim(),
      cpf: (first.cpf || '').toString().trim(),
      matricula: (first.matricula || '').toString().trim(),
      motivo: (first.motivo || 'admissao').toString().toLowerCase() as any,
      turno: (first.turno || 'diurno').toString().toLowerCase() as any,
      posto: (first.posto || '').toString().trim(),
      empresa: (first.empresa || '').toString().trim(),
      dataEntrega: parseDate(first.data_entrega) || new Date().toISOString().split('T')[0],
      itens,
      status: 'pendente',
      criadoEm: new Date().toISOString(),
      observacoes: (first.observacoes || '').toString().trim() || undefined,
    };

    try {
      await saveFicha(ficha);
      result.sucesso++;
    } catch (err: any) {
      result.erros.push({ linha: first.__linha, motivo: err.message || 'Erro ao salvar' });
    }
  }

  return result;
}

export async function downloadTemplateExcel() {
  const headers = [
    'nome_funcionario', 'cpf', 'matricula', 'funcao', 'posto', 'empresa',
    'telefone', 'motivo', 'turno', 'data_entrega', 'observacoes',
    'descricao_item', 'ca', 'quantidade', 'tamanho', 'posto_servico', 'data_validade',
  ];
  const exemplo = [
    ['João da Silva', '000.000.000-00', '12345', 'Operador', 'Produção', 'Empresa LTDA',
      '11999999999', 'admissao', 'diurno', '01/01/2026', '',
      'Capacete', '12345', 1, 'M', 'Linha 1', '01/01/2027'],
    ['João da Silva', '000.000.000-00', '12345', 'Operador', 'Produção', 'Empresa LTDA',
      '11999999999', 'admissao', 'diurno', '01/01/2026', '',
      'Luva', '54321', 2, 'G', 'Linha 1', ''],
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fichas');
  ws.addRow(headers);
  exemplo.forEach(r => ws.addRow(r));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-fichas.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
