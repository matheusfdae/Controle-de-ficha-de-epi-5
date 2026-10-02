// Leitura do XML da NF-e (modelo 55) e sugestão de qual EPI/uniforme do
// catálogo corresponde a cada item da nota. Tudo roda no navegador.

export interface NFeItem {
  nItem: number;
  codigo: string;          // cProd: código do produto no fornecedor
  ean: string | null;      // cEAN ("SEM GTIN" vira null)
  descricao: string;       // xProd
  unidade: string;         // uCom (UN, PAR, CX...)
  quantidade: number;      // qCom
  valorUnitario: number | null; // vUnCom
}

export interface NFe {
  chave: string | null;
  numero: string | null;
  serie: string | null;
  dataEmissao: string | null; // YYYY-MM-DD
  fornecedor: { nome: string | null; cnpj: string | null };
  itens: NFeItem[];
}

const first = (root: Element | Document, tag: string): Element | null =>
  root.getElementsByTagNameNS('*', tag)[0] ?? null;
const text = (root: Element | Document | null, tag: string): string | null => {
  const v = root ? first(root, tag)?.textContent?.trim() : null;
  return v ? v : null;
};

export function parseNFeXml(xml: string): NFe {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('O arquivo não é um XML válido.');
  }
  const inf = first(doc, 'infNFe');
  if (!inf) {
    if (first(doc, 'resNFe')) {
      throw new Error('Este XML é só o resumo da NF-e. Peça ao fornecedor o XML completo (nfeProc).');
    }
    throw new Error('O arquivo não é um XML de NF-e.');
  }

  const ide = first(inf, 'ide');
  const emit = first(inf, 'emit');
  const chave = (inf.getAttribute('Id') || '').replace(/\D/g, '') || text(doc, 'chNFe');

  const itens = Array.from(inf.getElementsByTagNameNS('*', 'det')).map((det, i) => {
    const prod = first(det, 'prod');
    const ean = text(prod, 'cEAN');
    const vUn = text(prod, 'vUnCom');
    return {
      nItem: Number(det.getAttribute('nItem')) || i + 1,
      codigo: text(prod, 'cProd') || '',
      ean: ean && /^\d+$/.test(ean) ? ean : null,
      descricao: text(prod, 'xProd') || '',
      unidade: (text(prod, 'uCom') || '').toUpperCase(),
      quantidade: Number(text(prod, 'qCom') || 0),
      valorUnitario: vUn ? Number(vUn) : null,
    };
  });

  return {
    chave: chave && chave.length === 44 ? chave : null,
    numero: text(ide, 'nNF'),
    serie: text(ide, 'serie'),
    dataEmissao: (text(ide, 'dhEmi') || text(ide, 'dEmi'))?.slice(0, 10) ?? null,
    fornecedor: { nome: text(emit, 'xNome'), cnpj: text(emit, 'CNPJ') || text(emit, 'CPF') },
    itens,
  };
}

// ---------------------------------------------------------------------------
// Sugestão de correspondência item da nota -> EPI do catálogo
// ---------------------------------------------------------------------------

export interface CatalogoItem {
  id: string;
  nome: string;
  ca_numero: string | null;
  codigo: string | null;
}

export interface CodigoFornecedor {
  fornecedor_cnpj: string;
  codigo_fornecedor: string;
  epi_id: string;
  tamanho: string | null;
}

export type OrigemSugestao = 'memoria' | 'ca' | 'codigo' | 'nome';

export interface Sugestao {
  epiId: string;
  tamanho: string | null;
  origem: OrigemSugestao;
}

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'com', 'para', 'p', 'e', 'a', 'o',
  'tam', 'tamanho', 'cor', 'un', 'und', 'pc', 'par', 'ref', 'mod', 'modelo']);

export function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s: string) {
  return new Set(normalizar(s).split(' ').filter(t => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t)));
}

/** Nº do CA citado na descrição ("CA 12345", "C.A.: 12345", "CA nº 12345"). */
export function extrairCA(descricao: string): string | null {
  return descricao.match(/\bC\.?\s?A\.?\s*(?:n[º°o.]?\s*)?[:.-]?\s*(\d{3,6})\b/i)?.[1] ?? null;
}

const TAMANHOS_LETRA = 'PP|P|M|G|GG|XG|XGG|EG|EGG|EXG|G1|G2|G3|G4';

/** Tamanho citado na descrição ("TAM 42", "Nº 40", "... GG" no final). */
export function extrairTamanho(descricao: string): string | null {
  const d = descricao.toUpperCase();
  const tam = d.match(new RegExp(`\\bTAM(?:ANHO)?\\.?\\s*[:-]?\\s*(\\d{1,2}|${TAMANHOS_LETRA})\\b`));
  if (tam) return tam[1];
  // "Nº 40", "N. 40", "N 40" — mas não "N95" (máscara PFF2).
  const num = d.match(/\bN(?:[º°O.]\s*|\s+)(\d{2})\b/);
  if (num) return num[1];
  const fim = d.match(new RegExp(`[\\s/-](${TAMANHOS_LETRA})\\s*$`));
  return fim?.[1] ?? null;
}

/**
 * Sugere o EPI de um item da nota, na ordem de confiança:
 * memória do fornecedor > nº do CA > código interno > semelhança do nome.
 */
export function sugerirEpi(
  item: Pick<NFeItem, 'codigo' | 'descricao'>,
  cnpj: string | null,
  catalogo: CatalogoItem[],
  memoria: CodigoFornecedor[],
): Sugestao | null {
  const cnpjNum = (cnpj || '').replace(/\D/g, '');
  const lembrado = memoria.find(m => m.fornecedor_cnpj === cnpjNum && m.codigo_fornecedor === item.codigo);
  if (lembrado && catalogo.some(c => c.id === lembrado.epi_id)) {
    return { epiId: lembrado.epi_id, tamanho: lembrado.tamanho, origem: 'memoria' };
  }

  const tamanho = extrairTamanho(item.descricao);
  const ca = extrairCA(item.descricao);
  const porCa = ca && catalogo.find(c => (c.ca_numero || '').replace(/\D/g, '') === ca);
  if (porCa) return { epiId: porCa.id, tamanho, origem: 'ca' };

  const porCodigo = item.codigo && catalogo.find(c => c.codigo && normalizar(c.codigo) === normalizar(item.codigo));
  if (porCodigo) return { epiId: porCodigo.id, tamanho, origem: 'codigo' };

  const tDesc = tokens(item.descricao);
  let melhor: { id: string; score: number } | null = null;
  for (const c of catalogo) {
    const tNome = tokens(c.nome);
    if (!tNome.size) continue;
    const comuns = [...tNome].filter(t => tDesc.has(t)).length;
    const score = comuns / tNome.size;
    if (comuns >= 2 || (tNome.size === 1 && comuns === 1)) {
      if (!melhor || score > melhor.score) melhor = { id: c.id, score };
    }
  }
  return melhor && melhor.score >= 0.5 ? { epiId: melhor.id, tamanho, origem: 'nome' } : null;
}

/** Casa o tamanho com um já cadastrado ignorando maiúsculas ("g" -> "G"). */
export function casarTamanho(tamanho: string | null, existentes: string[]): string | null {
  if (!tamanho) return null;
  return existentes.find(t => t.trim().toLowerCase() === tamanho.trim().toLowerCase()) ?? tamanho.trim();
}
