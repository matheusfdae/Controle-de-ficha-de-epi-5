import * as XLSX from 'xlsx';
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

// Mapeia variações de nome de coluna -> chave canônica
const COLUMN_ALIASES: Record<string, string> = {
  nome: 'nome', nome_funcionario: 'nome', funcionario: 'nome', colaborador: 'nome',
  cpf: 'cpf',
  matricula: 'matricula',
  funcao: 'funcao', cargo: 'funcao',
  setor: 'setor', departamento: 'setor',
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
  posto_servico: 'posto', posto: 'posto', local: 'posto',
  data_validade: 'data_validade', validade: 'data_validade',
};

function parseDate(value: any): string | undefined {
  if (!value) return undefined;
  // Excel serial date
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const str = value.toString().trim();
  // dd/mm/yyyy
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  return undefined;
}

export async function importFichasFromExcel(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const result: ImportResult = { total: rows.length, sucesso: 0, erros: [] };

  // Normaliza chaves usando aliases
  const normalized = rows.map((row, idx) => {
    const out: Record<string, any> = { __linha: idx + 2 };
    for (const [k, v] of Object.entries(row)) {
      const canonical = COLUMN_ALIASES[norm(k)] || norm(k);
      out[canonical] = v;
    }
    return out;
  });

  // Agrupa por colaborador (nome + cpf + data_entrega)
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
      setor: (first.setor || '').toString().trim(),
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

export function downloadTemplateExcel() {
  const headers = [
    'nome_funcionario', 'cpf', 'matricula', 'funcao', 'setor', 'empresa',
    'telefone', 'motivo', 'turno', 'data_entrega', 'observacoes',
    'descricao_item', 'ca', 'quantidade', 'tamanho', 'posto_servico', 'data_validade',
  ];
  const exemplo = [
    {
      nome_funcionario: 'João da Silva', cpf: '000.000.000-00', matricula: '12345',
      funcao: 'Operador', setor: 'Produção', empresa: 'Empresa LTDA',
      telefone: '11999999999', motivo: 'admissao', turno: 'diurno',
      data_entrega: '01/01/2026', observacoes: '',
      descricao_item: 'Capacete', ca: '12345', quantidade: 1, tamanho: 'M',
      posto_servico: 'Linha 1', data_validade: '01/01/2027',
    },
    {
      nome_funcionario: 'João da Silva', cpf: '000.000.000-00', matricula: '12345',
      funcao: 'Operador', setor: 'Produção', empresa: 'Empresa LTDA',
      telefone: '11999999999', motivo: 'admissao', turno: 'diurno',
      data_entrega: '01/01/2026', observacoes: '',
      descricao_item: 'Luva', ca: '54321', quantidade: 2, tamanho: 'G',
      posto_servico: 'Linha 1', data_validade: '',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(exemplo, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fichas');
  XLSX.writeFile(wb, 'modelo-importacao-fichas.xlsx');
}
