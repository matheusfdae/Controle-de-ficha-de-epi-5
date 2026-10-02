// Leitura do PDF do DANFE (representação impressa da NF-e). Só funciona
// com PDF digital — o gerado pelo sistema do fornecedor. PDF escaneado não
// tem texto e cai no erro "PDF sem texto".
//
// Cabeçalho: vem da chave de acesso de 44 dígitos impressa no DANFE, que
// carrega CNPJ do emitente, série e número (bem mais confiável que ler os
// rótulos). Itens: o quadro "DADOS DO PRODUTO/SERVIÇO" é lido por posição —
// as colunas saem dos rótulos do cabeçalho do quadro (CÓDIGO, DESCRIÇÃO,
// UN, QUANT, V. UNIT...) e cada linha de texto é distribuída entre elas.
import type { NFe, NFeItem } from '@/lib/nfe';

export interface TextoPdf {
  str: string;
  x: number;     // canto esquerdo
  y: number;     // linha de base (PDF: cresce para cima)
  w: number;     // largura
}

interface Coluna { tipo: TipoColuna; x0: number; x1: number }
type TipoColuna = 'codigo' | 'descricao' | 'unidade' | 'quantidade' | 'vunit' | 'outra';

const TOL_LINHA = 2.5;

function agruparLinhas(itens: TextoPdf[]): TextoPdf[][] {
  const linhas: { y: number; itens: TextoPdf[] }[] = [];
  for (const it of [...itens].filter(i => i.str.trim()).sort((a, b) => b.y - a.y)) {
    const l = linhas.find(l => Math.abs(l.y - it.y) <= TOL_LINHA);
    if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
  }
  return linhas.map(l => l.itens.sort((a, b) => a.x - b.x));
}

const textoLinha = (l: TextoPdf[]) => l.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function tipoDoRotulo(rotulo: string): TipoColuna {
  const r = semAcento(rotulo).replace(/[^A-Z]/g, '');
  if (/^COD/.test(r)) return 'codigo';
  if (/DESCRI/.test(r)) return 'descricao';
  if (/^(UN|UND|UNID|UNIDADE|UNCOM)$/.test(r)) return 'unidade';
  if (/^(QUANT|QUANTIDADE|QTD|QTDE|QUANTCOM)/.test(r)) return 'quantidade';
  if (/UNIT/.test(r)) return 'vunit';
  return 'outra';
}

/**
 * pt-BR ("1.234,5000") ou ponto decimal ("10.0000"). Sem vírgula, ponto com
 * exatamente 3 dígitos depois é milhar ("1.200" = 1200).
 */
export function numeroBr(s: string): number | null {
  const t = s.trim();
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.'))
    : /^\d+\.(\d{1,2}|\d{4})$/.test(t) ? Number(t) : Number(t.replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Colunas do quadro de produtos a partir dos rótulos do cabeçalho. */
function montarColunas(banda: TextoPdf[]): Coluna[] {
  // Rótulos quebrados em duas linhas ("VALOR" sobre "UNIT.") viram uma coluna.
  const grupos: { x0: number; x1: number; textos: string[] }[] = [];
  for (const it of [...banda].sort((a, b) => a.x - b.x)) {
    const x1 = it.x + it.w;
    const g = grupos.find(g => it.x < g.x1 - 1 && x1 > g.x0 + 1);
    if (g) { g.x0 = Math.min(g.x0, it.x); g.x1 = Math.max(g.x1, x1); g.textos.push(it.str); }
    else grupos.push({ x0: it.x, x1, textos: [it.str] });
  }
  grupos.sort((a, b) => a.x0 - b.x0);
  const centros = grupos.map(g => (g.x0 + g.x1) / 2);
  return grupos.map((g, i) => ({
    tipo: tipoDoRotulo(g.textos.join(' ')),
    x0: i === 0 ? -Infinity : (centros[i - 1] + centros[i]) / 2,
    x1: i === grupos.length - 1 ? Infinity : (centros[i] + centros[i + 1]) / 2,
  }));
}

const FIM_QUADRO = /DADOS ADICIONAIS|CALCULO DO ISSQN|INFORMACOES COMPLEMENTARES|RESERVADO AO FISCO/;

/** Itens do quadro de produtos de uma página (linhas já agrupadas). */
function itensDaPagina(linhas: TextoPdf[][], proximoN: number): NFeItem[] {
  const iCab = linhas.findIndex(l => {
    const t = semAcento(textoLinha(l));
    return /DESCRI/.test(t) && (/QUANT|QTD/.test(t) || /\bUN\b/.test(t));
  });
  if (iCab < 0) return [];

  // Cabeçalho do quadro pode ocupar a linha do "DESCRIÇÃO" e a de baixo.
  const yCab = linhas[iCab][0].y;
  let fimCab = iCab;
  while (fimCab + 1 < linhas.length && yCab - linhas[fimCab + 1][0].y < 9
         && !linhas[fimCab + 1].some(i => numeroBr(i.str) !== null && i.str.length > 3)) fimCab++;
  const colunas = montarColunas(linhas.slice(iCab, fimCab + 1).flat());
  if (!colunas.some(c => c.tipo === 'descricao') || !colunas.some(c => c.tipo === 'quantidade')) return [];

  const itens: NFeItem[] = [];
  for (const linha of linhas.slice(fimCab + 1)) {
    if (FIM_QUADRO.test(semAcento(textoLinha(linha)))) break;
    const cel: Partial<Record<TipoColuna, string>> = {};
    for (const it of linha) {
      const centro = it.x + it.w / 2;
      const col = colunas.find(c => centro >= c.x0 && centro < c.x1);
      if (col) cel[col.tipo] = [cel[col.tipo], it.str.trim()].filter(Boolean).join(' ');
    }
    const qtd = cel.quantidade ? numeroBr(cel.quantidade) : null;
    if (qtd !== null && cel.descricao) {
      itens.push({
        nItem: proximoN + itens.length,
        codigo: cel.codigo ?? '',
        ean: null,
        descricao: cel.descricao,
        unidade: (cel.unidade ?? '').toUpperCase(),
        quantidade: qtd,
        valorUnitario: cel.vunit ? numeroBr(cel.vunit) : null,
      });
    } else if (itens.length && cel.descricao && !cel.quantidade) {
      // Descrição que quebrou em mais de uma linha.
      itens[itens.length - 1].descricao += ' ' + cel.descricao;
    }
  }
  return itens;
}

export function parseDanfe(paginas: TextoPdf[][]): NFe & { cnpjsNoDocumento: string[] } {
  if (!paginas.some(p => p.some(i => i.str.trim()))) {
    throw new Error('PDF sem texto — parece escaneado. Use o XML ou digite os itens.');
  }
  const linhasPorPagina = paginas.map(agruparLinhas);
  const textoTodo = linhasPorPagina.flat().map(textoLinha).join('\n');

  const chave = linhasPorPagina.flat()
    .map(l => textoLinha(l).replace(/[\s.]/g, '').match(/(?<!\d)\d{44}(?!\d)/)?.[0])
    .find(Boolean) ?? null;

  const cnpjsNoDocumento = [...new Set(
    [...textoTodo.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)].map(m => m[0].replace(/\D/g, '')),
  )];

  const data = textoTodo.match(/EMISS[ÃA]O[\s\S]{0,120}?(\d{2})\/(\d{2})\/(\d{4})/i);
  const numeroTexto = textoTodo.match(/N[º°o.]\s*:?\s*(\d{3}\.\d{3}\.\d{3}|\d{1,9})/)?.[1];

  const itens: NFeItem[] = [];
  for (const linhas of linhasPorPagina) itens.push(...itensDaPagina(linhas, itens.length + 1));
  if (!itens.length) {
    throw new Error('Não encontrei o quadro de produtos neste PDF. Confira se é um DANFE ou digite os itens.');
  }

  return {
    chave,
    // Posições da chave: UF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) ...
    numero: chave ? String(Number(chave.slice(25, 34))) : numeroTexto ? String(Number(numeroTexto.replace(/\D/g, ''))) : null,
    serie: chave ? String(Number(chave.slice(22, 25))) : null,
    dataEmissao: data ? `${data[3]}-${data[2]}-${data[1]}` : null,
    fornecedor: { nome: null, cnpj: chave ? chave.slice(6, 20) : null },
    itens,
    cnpjsNoDocumento,
  };
}

/** Extrai o texto posicionado de cada página com o pdf.js (carregado sob demanda). */
export async function lerTextoPdf(arquivo: File): Promise<TextoPdf[][]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  try {
    const doc = await tarefa.promise;
    const paginas: TextoPdf[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const conteudo = await (await doc.getPage(n)).getTextContent();
      paginas.push(conteudo.items.flatMap(it => ('str' in it && it.str.trim())
        ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }] : []));
    }
    return paginas;
  } finally {
    await tarefa.destroy();
  }
}
