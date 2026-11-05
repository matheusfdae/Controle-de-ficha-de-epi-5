import type { jsPDF as JsPDF } from 'jspdf';
import logoUrl from '@/assets/logo-5estrelas-horizontal.png';

// PDF do Termo de Entrega de EPI no modelo da planilha "19. MODELO - Entrega EPI"
// (Rev 00): logo, POSTO / MÊS / LÍDER, tabela Nome | Material | Qtd | Assinatura,
// texto da NR-6 e a lista de CAs dos materiais do termo.

export interface LinhaTermoPdf {
  colaborador_nome: string; material: string; ca: string | null; quantidade: number;
  assinatura_url: string | null; data_assinatura: string | null;
}
export interface TermoPdf { posto: string; mes_referencia: string; lider: string | null; linhas: LinhaTermoPdf[] }

export const TEXTO_NR6 = 'A utilização de Equipamentos de Proteção Individual (EPI) pela equipe de serviços gerais é regida principalmente pela '
  + 'Norma Regulamentadora nº 06 (NR-6) do Ministério do Trabalho e Emprego. O uso e o cuidado é obrigatório por todos os colaboradores.';

/** Materiais distintos com o CA (sem CA cadastrado: "não informado"). */
export function listaCas(linhas: Pick<LinhaTermoPdf, 'material' | 'ca'>[]): string[] {
  const vistos = new Map<string, string | null>();
  for (const l of linhas) if (!vistos.has(l.material) || (!vistos.get(l.material) && l.ca)) vistos.set(l.material, l.ca);
  return [...vistos].map(([m, ca]) => {
    const c = (ca ?? '').trim();
    return !c ? `${m} - CA não informado` : /isent/i.test(c) ? `${m} - isento` : `${m} - CA ${c.replace(/^CA\s*/i, '')}`;
  });
}

let logo: string | null | undefined;
/** Para testes: usa este logo (data URL) em vez de buscar o arquivo. */
export const definirLogoTermo = (dataUrl: string | null) => { logo = dataUrl; };
async function carregarLogo(): Promise<string | null> {
  if (logo !== undefined) return logo;
  try {
    const blob = await (await fetch(logoUrl)).blob();
    logo = await new Promise<string>((ok, falha) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = falha;
      r.readAsDataURL(blob);
    });
  } catch { logo = null; }
  return logo;
}

const M = 12;          // margem
const LARG = 210 - 2 * M;
const COLS = [72, 52, 14, LARG - 72 - 52 - 14]; // nome, material, qtd, assinatura
const ALT_LINHA = 11;
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function cabecalho(doc: JsPDF, t: TermoPdf, img: string | null): number {
  doc.setDrawColor(0); doc.setLineWidth(0.3); doc.setTextColor(0);
  doc.rect(M, M, LARG, 20);
  if (img) doc.addImage(img, 'PNG', M + 2, M + 2, 44, 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('TERMO DE ENTREGA DE EPI - Rev 00', M + 50 + (LARG - 50) / 2, M + 12, { align: 'center' });
  let y = M + 20;
  const campo = (rotulo: string, valor: string, x: number, w: number) => {
    doc.rect(x, y, w, 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(rotulo, x + 2, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(valor || '', w - doc.getTextWidth(rotulo) - 6)[0] ?? '', x + 3 + doc.getTextWidth(rotulo), y + 5.5);
  };
  campo('POSTO:', t.posto, M, COLS[0] + COLS[1]); campo('MÊS:', t.mes_referencia, M + COLS[0] + COLS[1], COLS[2] + COLS[3]);
  y += 8;
  campo('LÍDER:', t.lider ?? '', M, LARG);
  y += 8;
  // Cabeçalho da tabela
  let x = M;
  ['NOME COMPLETO COLABORADOR', 'MATERIAL RECEBIDO', 'QTD', 'ASSINATURA'].forEach((h, i) => {
    doc.setFillColor(230, 230, 230); // o texto (preto) troca a cor de preenchimento
    doc.rect(x, y, COLS[i], 8, 'FD');
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text(h, x + COLS[i] / 2, y + 5.3, { align: 'center' });
    x += COLS[i];
  });
  return y + 8;
}

function linha(doc: JsPDF, y: number, l: LinhaTermoPdf | null) {
  let x = M;
  COLS.forEach(w => { doc.rect(x, y, w, ALT_LINHA); x += w; });
  if (!l) return;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(0);
  // Uma linha de texto fica no meio da célula; duas, uma em cima da outra.
  const escrever = (s: string, x: number, w: number) => {
    const t = doc.splitTextToSize(s, w - 3).slice(0, 2);
    doc.text(t, x, y + (t.length > 1 ? 4.5 : 6.8));
  };
  escrever(l.colaborador_nome, M + 1.5, COLS[0]);
  escrever(l.material, M + COLS[0] + 1.5, COLS[1]);
  doc.text(String(l.quantidade), M + COLS[0] + COLS[1] + COLS[2] / 2, y + 6.8, { align: 'center' });
  const xa = M + COLS[0] + COLS[1] + COLS[2];
  if (l.assinatura_url) {
    try { doc.addImage(l.assinatura_url, xa + 2, y + 0.6, 26, 8.6); } catch { /* imagem inválida: fica só a data */ }
    if (l.data_assinatura) {
      doc.setFontSize(6); doc.setTextColor(90);
      doc.text(dataHora(l.data_assinatura), xa + COLS[3] - 1.5, y + ALT_LINHA - 1.3, { align: 'right' });
      doc.setTextColor(0);
    }
  }
}

function rodape(doc: JsPDF, y: number, linhas: LinhaTermoPdf[]) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const nr = doc.splitTextToSize(TEXTO_NR6, LARG - 4);
  doc.rect(M, y, LARG, nr.length * 4 + 4);
  doc.text(nr, M + 2, y + 5);
  y += nr.length * 4 + 7;
  doc.setFont('helvetica', 'bold'); doc.text('CA (Certificado de Aprovação)', M, y);
  doc.setFont('helvetica', 'normal');
  for (const c of listaCas(linhas)) { y += 4.5; doc.text(c, M, y); }
}

/** Gera o PDF do termo (uma ou mais páginas; completa com linhas em branco como a planilha). */
export async function pdfTermoEntregaEpi(t: TermoPdf, baixar = true): Promise<JsPDF> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const img = await carregarLogo();
  const espacoRodape = 20 + Math.max(listaCas(t.linhas).length, 1) * 4.5 + 6;
  let y = cabecalho(doc, t, img);
  let i = 0;
  while (i < t.linhas.length) {
    if (y + ALT_LINHA > 297 - M - (i === t.linhas.length - 1 ? espacoRodape : 0)) { doc.addPage(); y = cabecalho(doc, t, img); }
    linha(doc, y, t.linhas[i]); y += ALT_LINHA; i++;
  }
  // Linhas em branco até o rodapé (para completar à mão, como na planilha).
  while (y + ALT_LINHA <= 297 - M - espacoRodape) { linha(doc, y, null); y += ALT_LINHA; }
  rodape(doc, y + 4, t.linhas);
  if (baixar) doc.save(`Termo de EPI - ${t.posto} - ${t.mes_referencia.replace('/', '-')}.pdf`);
  return doc;
}
