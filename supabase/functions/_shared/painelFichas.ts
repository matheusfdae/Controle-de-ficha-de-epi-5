// deno-lint-ignore-file
// Painel das fichas de um estado em SVG (para virar a imagem PNG anexada ao
// relatório de fichas pendentes): os mesmos números e gráficos do painel da
// tela Consultar Fichas (FichasDashboard) — fichas, assinadas, pendentes, itens
// entregues, fichas por mês (últimos 12) e por motivo. Sem dependências: a
// conversão para PNG fica com quem chama (Edge Function ou vite.config.ts).
import { dataBrasilia, formatarData } from './convocacaoUniforme.ts';

export interface FichaPainel { id: string; status: string; motivo: string | null; created_at: string }
export interface ItemPainel { ficha_id: string; quantidade: number | null; recebido: boolean }

export interface Painel {
  total: number; assinadas: number; pendentes: number; itens: number; pct: number;
  porMes: { label: string; assinadas: number; pendentes: number }[];
  porMotivo: { motivo: string; fichas: number }[];
}

const MOTIVOS: [string, string][] = [
  ['admissao', 'Admissão'], ['substituicao', 'Substituição'], ['perda_extravio', 'Perda/Extravio'],
  ['demissao', 'Demissão'], ['complemento', 'Complemento'],
];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Mesmas contas do FichasDashboard, com o mês pelo dia de criação em Brasília. */
export function calcularPainel(fichas: FichaPainel[], itens: ItemPainel[], agora = new Date(), meses = 12): Painel {
  const total = fichas.length;
  const assinadas = fichas.filter(f => f.status === 'assinada').length;
  const ids = new Set(fichas.map(f => f.id));
  const qtdItens = itens.filter(i => i.recebido && ids.has(i.ficha_id)).reduce((s, i) => s + (i.quantidade || 1), 0);

  const [ano, mes] = dataBrasilia(agora).split('-').map(Number);
  const porMes = Array.from({ length: meses }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (meses - 1 - i), 1));
    return {
      chave: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, assinadas: 0, pendentes: 0,
    };
  });
  const indice = new Map(porMes.map((m, i) => [m.chave, i]));
  for (const f of fichas) {
    const i = indice.get(dataBrasilia(f.created_at).slice(0, 7));
    if (i === undefined) continue;
    if (f.status === 'assinada') porMes[i].assinadas++; else porMes[i].pendentes++;
  }

  const porMotivo = MOTIVOS.map(([m, rotulo]) => ({ motivo: rotulo, fichas: fichas.filter(f => f.motivo === m).length }))
    .filter(m => m.fichas > 0).sort((a, b) => b.fichas - a.fichas);

  return {
    total, assinadas, pendentes: total - assinadas, itens: qtdItens,
    pct: total ? Math.round((assinadas / total) * 100) : 0,
    porMes: porMes.map(({ label, assinadas, pendentes }) => ({ label, assinadas, pendentes })), porMotivo,
  };
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Topo "redondo" do eixo com 4 divisões (24 → 24, 41 → 48, 150 → 160). */
function topoEixo(max: number): number {
  if (max <= 4) return 4;
  const passo = max / 4;
  const pot = 10 ** Math.floor(Math.log10(passo));
  const bom = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(x => x * pot).find(x => x >= passo)!;
  return bom * 4;
}

const COR = {
  fundo: '#f8fafc', cartao: '#ffffff', borda: '#e2e8f0', texto: '#0f172a', suave: '#64748b', grade: '#e2e8f0',
  azul: '#2563eb', verde: '#10b981', laranja: '#f59e0b',
};
export const LARGURA_PAINEL = 1200;
export const ALTURA_PAINEL = 700;

/** Imagem do painel (SVG 1200×700). Fonte: "Inter" (quem converte carrega o arquivo). */
export function svgPainel(p: Painel, uf: string, agora = new Date()): string {
  const W = LARGURA_PAINEL, H = ALTURA_PAINEL;
  const t = (x: number, y: number, txt: unknown, o: { tam?: number; peso?: number; cor?: string; ancora?: string } = {}) =>
    `<text x="${x}" y="${y}" font-family="Inter" font-size="${o.tam ?? 14}" font-weight="${o.peso ?? 400}" fill="${o.cor ?? COR.texto}"${o.ancora ? ` text-anchor="${o.ancora}"` : ''}>${esc(txt)}</text>`;
  const caixa = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${COR.cartao}" stroke="${COR.borda}"/>`;
  const partes: string[] = [`<rect width="${W}" height="${H}" fill="${COR.fundo}"/>`];

  partes.push(t(24, 44, `Fichas de EPI/Uniforme — ${uf}`, { tam: 26, peso: 700 }));
  partes.push(t(W - 24, 44, `Situação em ${formatarData(dataBrasilia(agora))}`, { tam: 14, cor: COR.suave, ancora: 'end' }));

  // Cartões
  const cartoes: [string, string, string, string][] = [
    ['Fichas', String(p.total), '', COR.azul],
    ['Assinadas', String(p.assinadas), `${p.pct}%`, COR.verde],
    ['Pendentes', String(p.pendentes), '', COR.laranja],
    ['Itens entregues', String(p.itens), '', COR.azul],
  ];
  const cw = (W - 48 - 3 * 16) / 4;
  cartoes.forEach(([rotulo, valor, extra, cor], i) => {
    const x = 24 + i * (cw + 16), y = 68;
    partes.push(caixa(x, y, cw, 88));
    partes.push(`<rect x="${x + 16}" y="${y + 24}" width="40" height="40" rx="10" fill="${cor}" fill-opacity="0.15"/>`);
    partes.push(`<circle cx="${x + 36}" cy="${y + 44}" r="8" fill="none" stroke="${cor}" stroke-width="3"/>`);
    partes.push(t(x + 72, y + 36, rotulo, { tam: 13, cor: COR.suave }));
    partes.push(t(x + 72, y + 68, valor, { tam: 28, peso: 700 }));
    if (extra) partes.push(t(x + 72 + valor.length * 17 + 8, y + 68, extra, { tam: 14, peso: 600, cor: COR.suave }));
  });

  // Fichas por mês (barras empilhadas: assinadas embaixo, pendentes em cima)
  const gx = 24, gy = 176, gw = 776, gh = H - gy - 24;
  partes.push(caixa(gx, gy, gw, gh));
  partes.push(t(gx + 20, gy + 34, 'Fichas por mês', { tam: 17, peso: 700 }));
  partes.push(t(gx + gw - 20, gy + 34, 'Últimos 12 meses', { tam: 13, cor: COR.suave, ancora: 'end' }));
  const x0 = gx + 56, x1 = gx + gw - 20, yTopo = gy + 76, yBase = gy + gh - 64;
  const maxMes = Math.max(0, ...p.porMes.map(m => m.assinadas + m.pendentes));
  const topo = topoEixo(maxMes);
  const escY = (v: number) => yBase - (v / topo) * (yBase - yTopo);
  for (let k = 0; k <= 4; k++) {
    const v = (topo / 4) * k, y = escY(v);
    partes.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${COR.grade}" stroke-dasharray="${k ? '4 4' : ''}"/>`);
    partes.push(t(x0 - 10, y + 4, Number.isInteger(v) ? v : v.toFixed(1), { tam: 12, cor: COR.suave, ancora: 'end' }));
  }
  const slot = (x1 - x0) / p.porMes.length, bw = Math.min(44, slot * 0.7);
  p.porMes.forEach((m, i) => {
    const cx = x0 + slot * i + slot / 2;
    const yA = escY(m.assinadas), yP = escY(m.assinadas + m.pendentes);
    if (m.assinadas) partes.push(`<rect x="${cx - bw / 2}" y="${yA}" width="${bw}" height="${yBase - yA}" fill="${COR.verde}"/>`);
    if (m.pendentes) partes.push(`<rect x="${cx - bw / 2}" y="${yP}" width="${bw}" height="${yA - yP}" fill="${COR.laranja}"/>`);
    const tot = m.assinadas + m.pendentes;
    if (tot) partes.push(t(cx, yP - 6, tot, { tam: 12, peso: 700, ancora: 'middle' }));
    partes.push(t(cx, yBase + 20, m.label, { tam: 12, cor: COR.suave, ancora: 'middle' }));
  });
  const ly = gy + gh - 18, lx = gx + gw / 2;
  partes.push(`<rect x="${lx - 110}" y="${ly - 10}" width="12" height="12" fill="${COR.verde}"/>`, t(lx - 92, ly, 'Assinadas', { tam: 13, cor: COR.suave }));
  partes.push(`<rect x="${lx + 10}" y="${ly - 10}" width="12" height="12" fill="${COR.laranja}"/>`, t(lx + 28, ly, 'Pendentes', { tam: 13, cor: COR.suave }));

  // Por motivo (barras horizontais)
  const mx = gx + gw + 16, mw = W - 24 - mx;
  partes.push(caixa(mx, gy, mw, gh));
  partes.push(t(mx + 20, gy + 34, 'Por motivo', { tam: 17, peso: 700 }));
  if (!p.porMotivo.length) partes.push(t(mx + mw / 2, gy + gh / 2, 'Nenhuma ficha', { tam: 14, cor: COR.suave, ancora: 'middle' }));
  const bx0 = mx + 128, bx1 = mx + mw - 48;
  const maxMot = Math.max(1, ...p.porMotivo.map(m => m.fichas));
  const alturaLinha = Math.min(72, (gh - 90) / Math.max(p.porMotivo.length, 1));
  p.porMotivo.forEach((m, i) => {
    const cy = gy + 70 + alturaLinha * i + alturaLinha / 2;
    const w = Math.max(2, (m.fichas / maxMot) * (bx1 - bx0));
    partes.push(t(bx0 - 10, cy + 4, m.motivo, { tam: 13, cor: COR.suave, ancora: 'end' }));
    partes.push(`<rect x="${bx0}" y="${cy - 12}" width="${w}" height="24" rx="4" fill="${COR.azul}"/>`);
    partes.push(t(bx0 + w + 8, cy + 5, m.fichas, { tam: 13, peso: 700 }));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${partes.join('')}</svg>`;
}
