/**
 * Leitura da planilha "Controle de gasto mensal DF e GO - Por posto": uma aba por
 * posto no modelo "PEDIDO DE MATERIAL - Rev.00" — itens x meses (JAN–DEZ), datas de
 * faturamento, valor previsto, valor realizado (muitas vezes a soma das notas, ex.
 * =26829.76+8755.64), variação/saldo, acumulado, equipamentos e observações.
 * Recebe cada aba como grade de valores (e a grade das fórmulas, para guardar as
 * parcelas do realizado) e devolve o modelo inteiro da aba para a tela "Controle de
 * gasto mensal" mostrar igual à planilha.
 * Regras (testadas na planilha real de 36 abas):
 *  - aba MENU é ignorada; colunas achadas pelos cabeçalhos (ORD, ITEM, JAN…DEZ),
 *    porque algumas abas começam na coluna A e outras na B;
 *  - um 2º cabeçalho "ITEM" (ex.: OMNI) ou um rótulo sem número na coluna ORD
 *    (ex.: "HC CLEAN") abre uma seção nova de itens;
 *  - item numerado sem nome é linha em branco da planilha (fica de fora);
 *  - linhas entre os itens e o VALOR PREVISTO são as datas de faturamento (um mês
 *    pode ter várias datas); "00/00/00" e "-" são vazios;
 *  - depois do saldo: bloco EQUIPAMENTOS (só o 1º, há abas com ele repetido) e
 *    textos à esquerda dos meses viram observações.
 */
import { chaveNome, normalizarTexto, ufSugerida, valorCelula, type Celula } from './planilhaPostos';

export { valorCelula, type Celula };

export const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export interface ItemGasto { ordem: number | null; nome: string; meses: string[] }
export interface SecaoGasto { titulo: string | null; itens: ItemGasto[] }
export interface MesGasto {
  /** Datas (AAAA-MM-DD) ou textos ("Sob Demanda", "06/08/2026 (emissão...)"). */
  faturamento: string[];
  previsto: number | null;
  realizado: number | null;
  /** Notas que somam o realizado (quando a célula era =a+b+c). */
  parcelas: number[] | null;
}
export interface EquipamentoGasto { qtd: number | null; descricao: string; unitario: number | null; subtotal: number | null }
export interface PlanilhaGasto {
  aba: string; posto: string; uf: string;
  custoTexto: string; custoValor: number | null;
  secoes: SecaoGasto[];
  meses: MesGasto[];
  rotuloSaldo: 'VARIAÇÃO' | 'SALDO';
  equipamentos: EquipamentoGasto[];
  observacoes: string[];
  avisos: string[];
}

const texto = (v: Celula) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const up = (v: Celula) => normalizarTexto(texto(v)).toUpperCase();
const VAZIOS = /^(0{2}\/0{2}\/0{2,4}|-+|0{2}\/0{2}\/0\d)$/;

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Quantidade do mês como aparece na planilha ("02 gl", "12un", 22). */
function quantidade(v: Celula): string {
  if (v == null || v === '' || typeof v === 'boolean') return '';
  if (v instanceof Date) return ddmm(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
  return normalizarTexto(v);
}

const numero = (v: Celula): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === 'string') {
    const m = v.replace(/R\$/i, '').trim().match(/^-?[\d.]+(,\d+)?$/);
    if (m) return Number(v.replace(/R\$/i, '').trim().replace(/\./g, '').replace(',', '.'));
  }
  return null;
};

/** "=26829.76+8755.64-699.3" -> [26829.76, 8755.64, -699.3]; com referência a célula -> null. */
export function parcelasDaFormula(f: string | null | undefined): number[] | null {
  if (!f) return null;
  const s = f.replace(/^=/, '').replace(/\s+/g, '');
  if (!/^[+-]?\d+(\.\d+)?([+-]\d+(\.\d+)?)+$/.test(s)) return null;
  return (s.match(/[+-]?\d+(\.\d+)?/g) ?? []).map(n => Math.round(Number(n) * 100) / 100);
}

/** "CUSTO EM CONTRATO: R$ 1.184,45" -> texto "R$ 1.184,45", valor 1184.45; "Sob demanda" -> null. */
export function lerCusto(bruto: string): { custoTexto: string; custoValor: number | null } {
  const custoTexto = normalizarTexto(bruto.split(':').slice(1).join(':') || '');
  const m = custoTexto.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:,\d{1,2})?)/);
  return { custoTexto, custoValor: m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null };
}

// Rótulos das linhas de valores (texto que só começa assim; "Valor teto..." é observação).
const ROTULOS_FIN = /^(VALOR\s+(PREVISTO|REALIZADO|APLICADO)|SALDO|VARIA[ÇC][ÃA]O|PREVIS[ÃA]O|ACUMULADO|DATA DE FATURAMENTO)/;

export function lerAbaGasto(nomeAba: string, grade: Celula[][], formulas: (string | null)[][] = []): PlanilhaGasto | null {
  const aba = normalizarTexto(nomeAba);
  if (aba.toUpperCase() === 'MENU') return null;
  let linItem = -1, colItem = -1, colOrd = -1, linMes = -1;
  const colMes: number[] = [];
  let posto = '', custoBruto = '';
  grade.forEach((linha, r) => (linha ?? []).forEach((v, c) => {
    if (typeof v !== 'string') return;
    const t = v.trim().toUpperCase();
    if (t === 'ITEM' && linItem < 0) { linItem = r; colItem = c; }
    if (t === 'ORD' && colOrd < 0) colOrd = c;
    if (t.startsWith('POSTO') && !posto) posto = normalizarTexto(v.split(':').slice(1).join(':') || v);
    if (t.includes('CUSTO') && t.includes('CONTRATO') && !custoBruto) custoBruto = v;
    if (MESES_ABREV.includes(t) && (linMes < 0 || r === linMes)) { linMes = r; colMes[MESES_ABREV.indexOf(t)] = c; }
  }));
  posto = posto || aba;
  const avisos: string[] = [];
  const base: PlanilhaGasto = {
    aba, posto, uf: ufSugerida(aba, posto), ...lerCusto(custoBruto), secoes: [],
    meses: MESES_ABREV.map(() => ({ faturamento: [], previsto: null, realizado: null, parcelas: null })),
    rotuloSaldo: 'VARIAÇÃO', equipamentos: [], observacoes: [], avisos,
  };
  if (colItem < 0 || linMes < 0 || colMes.filter(c => c != null).length < 12) {
    avisos.push('Cabeçalho (ITEM e os 12 meses) não encontrado: aba ignorada.');
    return base;
  }
  const primeiraColMes = Math.min(...colMes);
  const rotuloDaLinha = (linha: Celula[]) => (linha ?? []).slice(0, primeiraColMes).map(up).join(' ');

  // Linhas de valores.
  let linPrev = -1, linReal = -1, linSaldo = -1;
  for (let r = linMes + 1; r < grade.length; r++) {
    const rot = rotuloDaLinha(grade[r]);
    if (linPrev < 0 && rot.includes('PREVISTO')) linPrev = r;
    else if (linPrev >= 0 && linReal < 0 && rot.includes('REALIZADO')) linReal = r;
    else if (linReal >= 0 && linSaldo < 0 && /SALDO|VARIA/.test(rot)) {
      linSaldo = r;
      base.rotuloSaldo = rot.includes('SALDO') ? 'SALDO' : 'VARIAÇÃO';
    }
  }
  if (linPrev < 0 || linReal < 0) avisos.push('Linhas de VALOR PREVISTO / REALIZADO não encontradas.');
  const fimItens = linPrev >= 0 ? linPrev : grade.length;

  // Itens e datas de faturamento.
  let secao: SecaoGasto = { titulo: null, itens: [] };
  base.secoes.push(secao);
  const novaSecao = (titulo: string) => { secao = { titulo, itens: [] }; base.secoes.push(secao); };
  let emFaturamento = false;
  for (let r = Math.max(linItem, linMes) + 1; r < fimItens; r++) {
    const linha = grade[r] ?? [];
    const ordemCel = colOrd >= 0 ? linha[colOrd] : null;
    const rot = rotuloDaLinha(linha);
    const celMeses = colMes.map(c => linha[c]);
    if (rot.includes('FATURAMENTO')) emFaturamento = true;
    // Célula mesclada repete o rótulo na coluna ITEM: não é nome de item.
    const nomeCel = normalizarTexto(texto(linha[colItem]));
    const nome = ROTULOS_FIN.test(nomeCel.toUpperCase()) ? '' : nomeCel;
    const mesesVazios = celMeses.every(v => v == null || v === '');
    if (nome.toUpperCase() === 'ITEM') {
      const titulo = linha.slice(0, colItem).map(texto).map(normalizarTexto).find(t => t && !/^\d+$/.test(t));
      novaSecao(titulo ?? '');
      continue;
    }
    if (!emFaturamento && nome) {
      if (colOrd >= 0 && typeof ordemCel !== 'number' && /[a-zà-ú]{3,}/.test(nome)) { base.observacoes.push(nome); continue; }
      // Rótulo em maiúsculas sem número e sem quantidades (ex.: "HC CLEAN", mesclado ORD+ITEM): seção nova.
      if (colOrd >= 0 && typeof ordemCel !== 'number' && mesesVazios && nome === nome.toUpperCase()) { novaSecao(nome); continue; }
      secao.itens.push({ ordem: typeof ordemCel === 'number' ? ordemCel : null, nome, meses: celMeses.map(quantidade) });
      continue;
    }
    // Rótulo sem número na coluna ORD (ex.: "HC CLEAN"): seção nova.
    const rotuloOrd = colOrd >= 0 && typeof ordemCel === 'string' ? normalizarTexto(ordemCel) : '';
    if (!emFaturamento && rotuloOrd && !nome && !ROTULOS_FIN.test(rotuloOrd.toUpperCase())) {
      if (/[a-zà-ú]{3,}/.test(rotuloOrd)) base.observacoes.push(rotuloOrd); else novaSecao(rotuloOrd);
      continue;
    }
    // Linha só com datas/textos nos meses: faturamento (com ou sem rótulo).
    const temData = celMeses.some(v => v instanceof Date || (typeof v === 'string' && v.trim() && !/^\d+\s*[a-z]*$/i.test(v.trim())));
    if (!nome && (emFaturamento || temData)) {
      emFaturamento = true;
      celMeses.forEach((v, i) => {
        if (v instanceof Date) base.meses[i].faturamento.push(iso(v));
        else if (typeof v === 'string' && v.trim() && !VAZIOS.test(v.trim())) {
          // Texto mesclado na vertical ("Sob Demanda") se repete em cada linha: entra uma vez.
          const t = normalizarTexto(v);
          if (!base.meses[i].faturamento.includes(t)) base.meses[i].faturamento.push(t);
        }
      });
    }
  }
  base.secoes = base.secoes.filter((s, i) => i === 0 || s.itens.length);

  // Previsto e realizado (com as parcelas da fórmula).
  colMes.forEach((c, i) => {
    if (linPrev >= 0) base.meses[i].previsto = numero(grade[linPrev]?.[c]);
    if (linReal >= 0) {
      base.meses[i].realizado = numero(grade[linReal]?.[c]);
      const p = parcelasDaFormula(formulas[linReal]?.[c]);
      base.meses[i].parcelas = p && p.length > 1 ? p : null;
    }
  });

  // Depois do saldo: equipamentos e observações.
  const inicioRodape = Math.max(linSaldo, linReal, linPrev) + 1;
  let r = inicioRodape;
  for (; r < grade.length; r++) {
    const linha = grade[r] ?? [];
    if (linha.slice(0, primeiraColMes).some(v => up(v) === 'EQUIPAMENTOS')) {
      if (base.equipamentos.length) break; // bloco repetido mais abaixo
      // cabeçalho QTD / DESCRIÇÃO / UN. (R$) / SUBTOTAL na linha seguinte
      const cab = grade[r + 1] ?? [];
      const col = (re: RegExp) => cab.findIndex(v => re.test(up(v)));
      const cq = col(/^QTD/), cd = col(/DESCRI/), cu = col(/^UN/), cs = col(/SUBTOTAL/);
      if (cq < 0 || cd < 0) continue;
      let k = r + 2;
      for (; k < grade.length; k++) {
        const l = grade[k] ?? [];
        const descricao = normalizarTexto(texto(l[cd]));
        if (!descricao) break;
        base.equipamentos.push({ qtd: numero(l[cq]), descricao, unitario: cu >= 0 ? numero(l[cu]) : null, subtotal: cs >= 0 ? numero(l[cs]) : null });
      }
      r = k;
      continue;
    }
    for (const v of linha.slice(0, primeiraColMes)) {
      const t = normalizarTexto(texto(v));
      if (typeof v === 'string' && t && !ROTULOS_FIN.test(t.toUpperCase()) && !/^(QTD|DESCRI)/i.test(t)) base.observacoes.push(t);
    }
  }
  // Observações repetidas (bloco duplicado) saem uma vez só.
  const vistos = new Set<string>();
  base.observacoes = base.observacoes.filter(o => { const k = chaveNome(o); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (!base.secoes.some(s => s.itens.length)) avisos.push('Nenhum item encontrado.');
  return base;
}

// ---------- Contas da tela (iguais às da planilha) ----------

export const saldoDoMes = (m: MesGasto) => (m.previsto ?? 0) - (m.realizado ?? 0);
export function acumulado(meses: MesGasto[]) {
  const previsto = meses.reduce((s, m) => s + (m.previsto ?? 0), 0);
  const aplicado = meses.reduce((s, m) => s + (m.realizado ?? 0), 0);
  return { previsto: Math.round(previsto * 100) / 100, aplicado: Math.round(aplicado * 100) / 100, saldo: Math.round((previsto - aplicado) * 100) / 100 };
}
