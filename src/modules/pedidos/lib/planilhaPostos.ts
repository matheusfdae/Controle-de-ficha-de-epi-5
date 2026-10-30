/**
 * Leitura da planilha "Controle de gasto mensal ... Por posto - Itens": uma aba
 * por posto com POSTO:, CUSTO EM CONTRATO: R$ ..., ORD/ITEM e os meses JAN–DEZ.
 * Recebe cada aba já como grade (linhas x colunas, 1ª linha = índice 0) e devolve
 * posto, teto, itens (com a unidade usada nas quantidades) e avisos.
 * Regras (testadas na planilha real de 36 abas):
 *  - aba MENU é ignorada;
 *  - um 2º cabeçalho "ITEM" no meio da aba abre uma subseção (ex.: OMNI);
 *  - texto com palavras em minúsculas e sem número de ordem é anotação, não item;
 *  - a partir de "EQUIPAMENTOS" é a lista de equipamentos (fica de fora);
 *  - linhas VALOR PREVISTO / REALIZADO / SALDO e rótulos como "HC CLEAN" não são itens.
 */

export type Celula = string | number | boolean | Date | null | undefined;
export interface ItemPlanilha { nome: string; unidade: string | null; linha: number; secao: string | null }
export interface AbaPosto {
  aba: string; posto: string; uf: string; teto: number | null; itens: ItemPlanilha[]; avisos: string[];
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const UNIDADES: Record<string, string> = {
  und: 'un', un: 'un', unid: 'un', unt: 'un', gl: 'galão', gal: 'galão', cx: 'caixa', pt: 'pacote', pct: 'pacote', fd: 'fardo',
  rf: 'refil', rl: 'rolo', par: 'par', pr: 'par', kg: 'kg', lt: 'litro', l: 'litro', fr: 'frasco', bd: 'balde', sc: 'saco', pc: 'peça',
  dz: 'dúzia', tb: 'tubo', bb: 'bombona', cj: 'conjunto', kit: 'kit', mt: 'metro', m: 'metro',
};
const ROTULOS = new Set(['HC CLEAN']);

export const normalizarTexto = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Chave para comparar nomes: sem acento, maiúsculas, só letras e números. */
export const chaveNome = (s: string) => normalizarTexto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ').trim();

/** "36 rf" -> 'refil'; número puro -> null (sem unidade). */
export function unidadeDaQuantidade(v: Celula): string | null | undefined {
  if (v == null || v === '' || v instanceof Date || typeof v === 'boolean') return undefined;
  if (typeof v === 'number') return v ? null : undefined;
  const m = String(v).trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-zçã]*)\.?$/);
  if (!m || !Number(m[1].replace(',', '.'))) return undefined;
  return m[2] ? (UNIDADES[m[2]] ?? m[2]) : null;
}

/** Estado sugerido pelo nome (a planilha mistura DF, GO, SP e ES). */
export function ufSugerida(aba: string, posto: string): string {
  const t = `${aba} ${posto}`.toUpperCase();
  if (/VIT[ÓO]RIA|PRAIA DE SU|S[ÃA]O PEDRO/.test(t)) return 'ES';
  if (/S[ÃA]O PAULO|\bSP\b|SANTANA DE PARNA[ÍI]BA|ALPHAVILLE/.test(t)) return 'SP';
  if (/\bGO\b|JATA[ÍI]|CANEDO|CRESM|CREDEQ|HSLMB|TERRAS ALPHA|SOCIAL DISTRIBUIDORA|BOM DIA|MILLS|\bTSE\b/.test(t)) return 'GO';
  return 'DF';
}

const texto = (v: Celula) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function lerAba(nomeAba: string, grade: Celula[][]): AbaPosto | null {
  const aba = normalizarTexto(nomeAba);
  if (aba.toUpperCase() === 'MENU') return null;
  let linItem = -1, colItem = -1, colOrd = -1, linMes = -1;
  const colMes: number[] = [];
  let posto = '', custoTxt = '';
  grade.forEach((linha, r) => linha.forEach((v, c) => {
    if (typeof v !== 'string') return;
    const t = v.trim().toUpperCase();
    if (t === 'ITEM' && linItem < 0) { linItem = r; colItem = c; }
    if (t === 'ORD' && colOrd < 0) colOrd = c;
    if (t.startsWith('POSTO') && !posto) posto = normalizarTexto(v.split(':').slice(1).join(':') || v);
    if (t.includes('CUSTO') && t.includes('CONTRATO')) custoTxt = v;
    if (MESES.includes(t) && (linMes < 0 || r === linMes)) { linMes = r; colMes.push(c); }
  }));
  const avisos: string[] = [];
  const m = custoTxt.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
  const teto = m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
  posto = posto || aba;
  const base: AbaPosto = { aba, posto, uf: ufSugerida(aba, posto), teto, itens: [], avisos };
  if (colItem < 0 || linMes < 0) { avisos.push('Cabeçalho (ITEM e meses) não encontrado: aba ignorada.'); return base; }
  if (teto == null) avisos.push('Sem "CUSTO EM CONTRATO": teto fica para preencher na tela.');

  const vistos = new Set<string>();
  let secao: string | null = null;
  for (let r = Math.max(linItem, linMes) + 1; r < grade.length; r++) {
    const linha = grade[r] ?? [];
    const nome = texto(linha[colItem]).trim();
    const ordem = colOrd >= 0 ? linha[colOrd] : null;
    const rotulo = linha.slice(0, colItem + 3).map(texto).join(' ').toUpperCase();
    if (rotulo.includes('EQUIPAMENTO')) break;
    if (!nome) continue;
    const up = nome.toUpperCase();
    if (up === 'ITEM') { secao = texto(linha[0]).trim() && linha[0] !== ordem ? normalizarTexto(texto(linha[0])) : `linha ${r + 1}`; avisos.push(`Subseção "${secao}" na linha ${r + 1}.`); continue; }
    if (/VALOR|SALDO|TOTAL|PREVIS|VARIA[ÇC][ÃA]O|DATA DE|FATURAMENTO/.test(up) || ROTULOS.has(up)) continue;
    if (colOrd >= 0 && typeof ordem !== 'number' && /[a-zà-ú]{3,}/.test(nome)) { avisos.push(`Linha ${r + 1}: anotação "${nome.slice(0, 60)}".`); continue; }
    const k = chaveNome(nome);
    if (vistos.has(k)) { avisos.push(`Item repetido na aba: ${normalizarTexto(nome)}.`); continue; }
    vistos.add(k);
    const unidades = new Map<string, number>();
    for (const c of colMes) {
      const u = unidadeDaQuantidade(linha[c]);
      if (u) unidades.set(u, (unidades.get(u) ?? 0) + 1);
    }
    const unidade = [...unidades.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    base.itens.push({ nome: normalizarTexto(nome), unidade, linha: r + 1, secao });
  }
  return base;
}

export interface PostoCadastrado { id: string; nome: string; uf: string }
/** Posto já cadastrado com o mesmo nome (ignorando acento, pontuação e um nome contido no outro). */
export function acharPosto(aba: AbaPosto, postos: PostoCadastrado[]): PostoCadastrado | null {
  const alvo = [chaveNome(aba.posto), chaveNome(aba.aba)];
  return postos.find(p => alvo.includes(chaveNome(p.nome)))
    ?? postos.find(p => { const k = chaveNome(p.nome); return k.length >= 4 && alvo.some(a => a.length >= 4 && (a.includes(k) || k.includes(a))); })
    ?? null;
}
