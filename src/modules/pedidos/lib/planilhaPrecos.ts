import { chaveNome, normalizarTexto, type Celula } from './planilhaPostos';

/**
 * Leitura da planilha de preços dos itens: em qualquer aba, a linha de
 * cabeçalho tem uma coluna de item (ITEM / DESCRIÇÃO / PRODUTO / MATERIAL) e
 * uma de preço (PREÇO / VALOR / UNITÁRIO). Cada linha abaixo vira {nome, preço}.
 * Puro: testado no vitest.
 */

export interface PrecoLido { nome: string; preco: number; aba: string; linha: number }

const COL_ITEM = /^(ITEM|ITENS|DESCRICAO|DESCRICAO DO ITEM|PRODUTO|MATERIAL|NOME)\b/;
const COL_PRECO = /(PRECO|VALOR|UNITARIO|CUSTO)/;
const COL_TOTAL = /TOTAL/;

/** "R$ 1.234,56" / 1234.56 -> 1234.56; vazio ou texto -> null. */
export function lerPreco(v: Celula): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100) / 100;
}

/** Acha o cabeçalho e lê os preços de uma aba. */
export function lerAbaPrecos(aba: string, grade: Celula[][]): { itens: PrecoLido[]; avisos: string[] } {
  for (let r = 0; r < Math.min(grade.length, 30); r++) {
    const cab = (grade[r] ?? []).map(c => (typeof c === 'string' ? chaveNome(c) : ''));
    const ci = cab.findIndex(c => COL_ITEM.test(c));
    // Preço unitário tem preferência sobre uma coluna de total.
    const precos = cab.map((c, i) => (COL_PRECO.test(c) ? i : -1)).filter(i => i >= 0);
    const cp = precos.find(i => !COL_TOTAL.test(cab[i])) ?? precos[0];
    if (ci < 0 || cp == null) continue;
    const itens: PrecoLido[] = [];
    const avisos: string[] = [];
    for (let l = r + 1; l < grade.length; l++) {
      const nomeBruto = grade[l]?.[ci];
      const nome = typeof nomeBruto === 'string' ? normalizarTexto(nomeBruto) : typeof nomeBruto === 'number' ? String(nomeBruto) : '';
      if (!nome) continue;
      const preco = lerPreco(grade[l]?.[cp]);
      if (preco == null) { if (grade[l]?.[cp] != null && grade[l]?.[cp] !== '') avisos.push(`${aba} linha ${l + 1}: preço ilegível em "${nome}"`); continue; }
      itens.push({ nome, preco, aba, linha: l + 1 });
    }
    return { itens, avisos };
  }
  return { itens: [], avisos: [] };
}

/**
 * Junta as abas e liga cada nome a um item do catálogo (pelo nome sem acento
 * e sem pontuação). Nome repetido: vale o último.
 */
export function casarPrecos(lidos: PrecoLido[], catalogo: { nome: string }[]) {
  const porChave = new Map(catalogo.map(c => [chaveNome(c.nome), c.nome]));
  const achados = new Map<string, { nome: string; preco: number; lido: PrecoLido }>();
  const naoAchados: PrecoLido[] = [];
  for (const l of lidos) {
    const nome = porChave.get(chaveNome(l.nome));
    if (!nome) { naoAchados.push(l); continue; }
    achados.set(nome, { nome, preco: l.preco, lido: l });
  }
  return { achados: [...achados.values()], naoAchados };
}
