import jsPDF from 'jspdf';
import { EPIFicha, MotivoEntrega } from '@/types/epi';
import { loadConfig, AppConfig } from '@/services/configService';
import { ModeloFicha, resolveModelo } from '@/services/modelosFichaService';

// ===== Constantes de layout =====

const M = 8;           // margin
const PAGE_W = 297;    // A4 landscape width  (mm)
const PAGE_H = 210;    // A4 landscape height (mm)
const CW = PAGE_W - M * 2; // content width

const MIN_TABLE_ROWS = 8;

type FillStyle = 'header' | 'light' | 'alt';

const FILL_COLORS: Record<FillStyle, [number, number, number]> = {
  header: [180, 180, 180],
  light:  [230, 235, 240],
  alt:    [245, 245, 250],
};

// Larguras das 9 colunas da tabela (soma = CW = 281)
const COL_W = [22, 14, 75, 18, 45, 42, 22, 16, 27] as const;
const COL_H2 = ['ENTREGA', '', '', '', '', 'FUNCIONÁRIO', 'DATA', 'QUANT', 'RECEBIDO POR'];

// ===== Helpers de desenho =====

interface TextOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  align?: 'center' | 'right';
}

function line(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(x1, y1, x2, y2);
}

function rect(doc: jsPDF, x: number, y: number, w: number, h: number, fill?: FillStyle) {
  if (fill) {
    const [r, g, b] = FILL_COLORS[fill];
    doc.setFillColor(r, g, b);
    doc.rect(x, y, w, h, 'F');
  }
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
}

function text(doc: jsPDF, txt: string, x: number, y: number, opts: TextOpts = {}) {
  doc.setFontSize(opts.size ?? 7);
  const style = opts.bold && opts.italic ? 'bolditalic'
              : opts.bold               ? 'bold'
              : opts.italic             ? 'italic'
              : 'normal';
  doc.setFont('helvetica', style);
  doc.setTextColor(0);
  opts.align ? doc.text(txt, x, y, { align: opts.align }) : doc.text(txt, x, y);
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function addDataImage(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  doc.addImage(dataUrl, imageFormat(dataUrl), x, y, w, h);
}

const MOTIVO_LETRA: Record<MotivoEntrega, string> = {
  admissao: 'A',
  substituicao: 'S',
  demissao: 'D',
  perda_extravio: 'P',
  complemento: 'C',
};

const MOTIVO_LABEL: Record<MotivoEntrega, string> = {
  admissao: 'Admissão',
  substituicao: 'Substituição',
  perda_extravio: 'Perda/Extravio',
  demissao: 'Demissão',
  complemento: 'Complemento',
};

// ===== Seções do PDF =====

function drawLogoBox(doc: jsPDF, x: number, y: number, w: number, h: number, config: AppConfig, logoOverride?: string | null) {
  rect(doc, x, y, w, h);
  const logo = logoOverride || config.logoDataUrl;
  if (logo) {
    try { addDataImage(doc, logo, x + 2, y + 2, w - 4, h - 4); } catch {}
  } else {
    const parts = config.empresaNome.split(' ');
    text(doc, parts[0] ?? '', x + w / 2, y + 6,  { bold: true, size: 8, align: 'center' });
    text(doc, parts.slice(1).join(' '), x + w / 2, y + 10, { bold: true, size: 7, align: 'center' });
    text(doc, config.empresaSubtitulo, x + w / 2, y + 13, { size: 4, align: 'center' });
  }
}

function renderHeader(doc: jsPDF, y: number, config: AppConfig, modelo: ModeloFicha): number {
  const LOGO_W = 40;
  const rightLogo = modelo.mostrarSegundoLogo;
  const titleW = CW - LOGO_W - (rightLogo ? LOGO_W : 0);

  drawLogoBox(doc, M, y, LOGO_W, 16, config, modelo.logoDataUrl);

  rect(doc, M + LOGO_W, y, titleW, 16);
  text(doc, modelo.tituloDocumento, M + LOGO_W + titleW / 2, y + 9, { bold: true, size: 12, align: 'center' });

  if (rightLogo) {
    drawLogoBox(doc, M + LOGO_W + titleW, y, LOGO_W, 16, config, modelo.logoDataUrl);
  }

  return y + 16;
}

function renderEmployeeRowsCompleto(doc: jsPDF, y: number, ficha: EPIFicha): number {
  const ROW_H = 7;

  // Linha 1: Nome + Motivos + Turno
  rect(doc, M, y, CW, ROW_H);
  text(doc, 'NOME DO FUNCIONÁRIO:', M + 1, y + 4.5, { bold: true, size: 7 });
  text(doc, ficha.nomeFuncionario, M + 42, y + 4.5, { size: 8 });

  const motivoItems = [
    { key: 'admissao',       label: 'ADMISSÃO' },
    { key: 'substituicao',   label: 'SUBSTITUIÇÃO' },
    { key: 'perda_extravio', label: 'PERDA/EXTRAVIO' },
    { key: 'demissao',       label: 'DEMISSÃO' },
    { key: 'complemento',    label: 'COMPLEMENTO' },
  ];
  let mx = M + CW * 0.48;
  for (const mi of motivoItems) {
    doc.setDrawColor(0);
    doc.rect(mx, y + 1.5, 3, 3);
    if (ficha.motivo === mi.key) text(doc, 'X', mx + 0.6, y + 4, { bold: true, size: 7 });
    text(doc, mi.label, mx + 4, y + 4, { size: 6 });
    mx += mi.label.length * 1.5 + 9;
  }

  const turnoX = M + CW - 28;
  line(doc, turnoX - 1, y, turnoX - 1, y + ROW_H);
  text(doc, ficha.turno === 'diurno' ? '☒' : '☐', turnoX,     y + 3.5, { size: 7 });
  text(doc, 'DIURNO',                              turnoX + 5, y + 3.5, { bold: true, size: 6 });
  text(doc, ficha.turno === 'noturno' ? '☒' : '☐', turnoX,    y + 6.5, { size: 7 });
  text(doc, 'NOTURNO',                             turnoX + 5, y + 6.5, { bold: true, size: 6 });
  y += ROW_H;

  // Linha 2: Função + Fone
  rect(doc, M, y, CW, ROW_H);
  text(doc, 'FUNÇÃO:', M + 1, y + 4.5, { bold: true, size: 7 });
  text(doc, ficha.funcao, M + 20, y + 4.5, { size: 8 });
  const foneX = M + CW * 0.4;
  line(doc, foneX, y, foneX, y + ROW_H);
  text(doc, 'FONE:', foneX + 2, y + 4.5, { bold: true, size: 7 });
  text(doc, ficha.telefone, foneX + 15, y + 4.5, { size: 8 });
  y += ROW_H;

  return y;
}

function renderEmployeeRowsCompacto(doc: jsPDF, y: number, ficha: EPIFicha): number {
  const ROW_H = 7;

  // 4 zonas de coluna alinhadas entre as duas linhas (nome/cargo, siglas/celular,
  // admissão-motivo/demissão, turno/diurno-noturno) — reproduz o termo em papel.
  const zoneA = M;                    // NOME COMPLETO / CARGO
  const zoneB = zoneA + CW * 0.34;    // siglas A-S-D-P-C / CELULAR
  const zoneC = zoneB + CW * 0.14;    // ADMISSÃO / MOTIVO + DEMISSÃO
  const zoneD = zoneC + CW * 0.28;    // TURNO / DIURNO + NOTURNO
  const zoneEnd = zoneD + CW * 0.24;  // == M + CW

  // Linha 1
  rect(doc, zoneA, y, zoneB - zoneA, ROW_H);
  text(doc, 'NOME COMPLETO:', zoneA + 1, y + 4.5, { bold: true, size: 7 });
  text(doc, ficha.nomeFuncionario, zoneA + 34, y + 4.5, { size: 8 });

  rect(doc, zoneB, y, zoneC - zoneB, ROW_H);
  let mx = zoneB + 2;
  for (const letra of ['A', 'S', 'D', 'P', 'C']) {
    doc.setDrawColor(0);
    doc.rect(mx, y + 1.5, 3, 3);
    if (MOTIVO_LETRA[ficha.motivo] === letra) text(doc, 'X', mx + 0.6, y + 4, { bold: true, size: 7 });
    text(doc, letra, mx + 4, y + 4, { bold: true, size: 6 });
    mx += 7;
  }

  rect(doc, zoneC, y, zoneD - zoneC, ROW_H);
  text(doc, 'ADMISSÃO:', zoneC + 2, y + 4.5, { bold: true, size: 6 });
  line(doc, zoneC + 18, y + ROW_H - 1.5, zoneD - 2, y + ROW_H - 1.5);

  rect(doc, zoneD, y, zoneEnd - zoneD, ROW_H);
  text(doc, 'TURNO', zoneD + (zoneEnd - zoneD) / 2, y + 4.5, { bold: true, size: 7, align: 'center' });
  y += ROW_H;

  // Linha 2
  rect(doc, zoneA, y, zoneB - zoneA, ROW_H);
  text(doc, 'CARGO:', zoneA + 1, y + 4.5, { bold: true, size: 7 });
  text(doc, ficha.funcao, zoneA + 16, y + 4.5, { size: 8 });

  rect(doc, zoneB, y, zoneC - zoneB, ROW_H);
  text(doc, 'CELULAR:', zoneB + 2, y + 4.5, { bold: true, size: 6 });
  text(doc, ficha.telefone, zoneB + 2, y + 6.8, { size: 7 });

  const zoneCMid = zoneC + (zoneD - zoneC) / 2;
  rect(doc, zoneC, y, zoneCMid - zoneC, ROW_H);
  text(doc, 'MOTIVO:', zoneC + 2, y + 4.5, { bold: true, size: 6 });
  text(doc, MOTIVO_LABEL[ficha.motivo], zoneC + 2, y + 6.8, { size: 6 });

  rect(doc, zoneCMid, y, zoneD - zoneCMid, ROW_H);
  text(doc, 'DEMISSÃO:', zoneCMid + 2, y + 4.5, { bold: true, size: 6 });

  const zoneDMid = zoneD + (zoneEnd - zoneD) / 2;
  rect(doc, zoneD, y, zoneDMid - zoneD, ROW_H);
  doc.rect(zoneD + 2, y + 2, 3, 3);
  if (ficha.turno === 'diurno') text(doc, 'X', zoneD + 2.6, y + 4.5, { bold: true, size: 7 });
  text(doc, 'DIURNO:', zoneD + 6.5, y + 4.5, { bold: true, size: 6 });

  rect(doc, zoneDMid, y, zoneEnd - zoneDMid, ROW_H);
  doc.rect(zoneDMid + 2, y + 2, 3, 3);
  if (ficha.turno === 'noturno') text(doc, 'X', zoneDMid + 2.6, y + 4.5, { bold: true, size: 7 });
  text(doc, 'Noturno:', zoneDMid + 6.5, y + 4.5, { bold: true, size: 6 });
  y += ROW_H;

  return y;
}

function renderEmployeeRows(doc: jsPDF, y: number, ficha: EPIFicha, modelo: ModeloFicha): number {
  return modelo.layoutCabecalho === 'compacto'
    ? renderEmployeeRowsCompacto(doc, y, ficha)
    : renderEmployeeRowsCompleto(doc, y, ficha);
}

function renderLegendaMotivos(doc: jsPDF, y: number): number {
  const H = 6;
  rect(doc, M, y, CW, H, 'light');
  const legenda = 'A = ADMISSÃO     S = SUBSTITUIÇÃO     D = DEMISSÃO     P = PERDA/EXTRAVIO     C = COMPLEMENTO';
  text(doc, legenda, M + CW / 2, y + 4, { bold: true, size: 6.5, align: 'center' });
  return y + H;
}

function renderTermsSection(doc: jsPDF, y: number, modelo: ModeloFicha): number {
  rect(doc, M, y, CW, 6, 'header');
  text(doc, 'TERMO DE RESPONSABILIDADE', M + CW / 2, y + 4, { bold: true, size: 8, align: 'center' });
  y += 6;

  const TERMS_H = 52;
  const splitX = M + CW * 0.52;
  rect(doc, M, y, CW, TERMS_H);
  line(doc, splitX, y, splitX, y + TERMS_H);

  // Coluna esquerda: texto do termo
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(modelo.textoTermoResponsabilidade, splitX - M - 3), M + 2, y + 4);

  // Coluna direita: Base Legal
  const bx = splitX + 2;
  text(doc, 'BASE LEGAL: NR1 Item 1.8 (Cabe ao Empregado)', bx, y + 4, { bold: true, size: 6 });

  const baseLegal: { t: string; bold?: boolean; italic?: boolean }[] = [
    { t: 'a) Cumprir as disposições legais e regulamentares sobre segurança e saúde do trabalho,', italic: true },
    { t: 'inclusive as ordens de serviço expedidas pelo empregador; (Alterado pela portaria SIT 84/2009).', italic: true },
    { t: '' },
    { t: '1.8.1 - Constitui ato faltoso a recusa injustificada do empregado ao cumprimento', bold: true },
    { t: 'do disposto no item anterior.', italic: true },
    { t: '' },
    { t: "NR6 Item 6.7 (Cabe ao Empregado)", bold: true },
    { t: "6.7.1 - Cabe ao empregado quanto aos EPI's:", bold: true },
    { t: 'a) Usar, utilizando-o apenas para a finalidade a que se destina;', italic: true },
    { t: 'b) Responsabilizar-se pela guarda e conservação;', italic: true },
    { t: 'c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;', italic: true },
    { t: 'd) Cumprir as determinações do empregador sobre o uso adequado;', italic: true },
  ];

  baseLegal.forEach((item, i) => {
    if (!item.t) return;
    doc.setFont('helvetica', item.bold ? 'bold' : 'italic');
    doc.setFontSize(5.5);
    doc.text(item.t, bx, y + 8 + i * 3.5);
  });
  doc.setFont('helvetica', 'normal');

  return y + TERMS_H;
}

function renderDeclaroSection(doc: jsPDF, y: number, modelo: ModeloFicha): number {
  doc.setFontSize(6);
  const lines = doc.splitTextToSize(modelo.textoDeclaracao, CW - 4);
  const declH = lines.length * 3 + 4;
  rect(doc, M, y, CW, declH);
  doc.setFont('helvetica', 'normal');
  doc.text(lines, M + 2, y + 3.5);
  return y + declH;
}

function renderSecaoExtra(doc: jsPDF, y: number, texto: string): number {
  const H = 20;
  rect(doc, M, y, CW, H);
  const textW = CW * 0.62;
  line(doc, M + textW, y, M + textW, y + H);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(texto, textW - 4), M + 2, y + 4);

  const sigX = M + textW + 4;
  const sigLineX2 = M + CW - 2;
  for (let i = 0; i < 3; i++) {
    const ly = y + 6 + i * 6;
    text(doc, 'Assinatura:', sigX, ly, { size: 6 });
    line(doc, sigX + 15, ly, sigLineX2, ly);
  }

  return y + H;
}

function renderSignatureRow(doc: jsPDF, y: number, ficha: EPIFicha, config: AppConfig): number {
  const SIG_H = 18;
  const LINE_Y = y + SIG_H - 6; // posição da linha de assinatura
  rect(doc, M,          y, CW / 2, SIG_H);
  rect(doc, M + CW / 2, y, CW / 2, SIG_H);

  // ----- Coluna esquerda: Funcionário (só o nome impresso, sem a rubrica) -----
  text(doc, ficha.nomeFuncionario, M + CW / 4, LINE_Y - 1, { size: 7, align: 'center' });
  // Linha de assinatura
  line(doc, M + 10, LINE_Y, M + CW / 2 - 10, LINE_Y);
  // Label ABAIXO da linha
  text(doc, 'NOME COMPLETO (FUNCIONÁRIO)', M + CW / 4, LINE_Y + 3, { size: 6, align: 'center' });

  // ----- Coluna direita: Empresa (somente carimbo centralizado) -----
  const assinaturaEmpresa = ficha.assinaturaResponsavel || config.assinaturaEmpresa;
  if (assinaturaEmpresa) {
    try { addDataImage(doc, assinaturaEmpresa, M + CW / 2 + 26, y + 1, CW / 2 - 52, LINE_Y - y - 1); } catch {}
  }
  if (config.carimboEmpresa) {
    const stampW = 40;
    const stampH = SIG_H - 6;
    const stampX = M + CW / 2 + (CW / 2 - stampW) / 2;
    try { addDataImage(doc, config.carimboEmpresa, stampX, y + 1, stampW, stampH); } catch {}
  }
  line(doc, M + CW / 2 + 10, LINE_Y, M + CW - 10, LINE_Y);
  text(doc, 'EMPRESA', M + CW * 0.75, LINE_Y + 3, { size: 6, align: 'center' });
  text(doc, ficha.empresa, M + CW * 0.75, LINE_Y + 6, { size: 6, align: 'center' });


  return y + SIG_H;
}

function renderItemsTable(doc: jsPDF, y: number, ficha: EPIFicha, modelo: ModeloFicha): number {
  const ROW_H    = 6;
  const HEADER_H = 9;
  const col4Label = modelo.colunaExtra === 'ca' ? 'C.A' : 'TAM. / Nº';
  const COL_H1 = ['DATA', 'QUANT.', 'DESCRIÇÃO', col4Label, 'POSTO DE SERVIÇO', 'ASSINATURA DO', '', 'DEVOLUÇÃO', ''];

  // Cabeçalho da tabela
  rect(doc, M, y, CW, HEADER_H, 'light');
  let cx = M;
  for (let i = 0; i < 6; i++) {
    rect(doc, cx, y, COL_W[i], HEADER_H);
    text(doc, COL_H1[i], cx + COL_W[i] / 2, y + 3.5, { bold: true, size: 5.5, align: 'center' });
    text(doc, COL_H2[i], cx + COL_W[i] / 2, y + 6.5, { bold: true, size: 5.5, align: 'center' });
    cx += COL_W[i];
  }

  // Cabeçalho mesclado DEVOLUÇÃO (colunas 6-8)
  const devW = COL_W[6] + COL_W[7] + COL_W[8];
  rect(doc, cx, y, devW, 4.5);
  text(doc, 'DEVOLUÇÃO', cx + devW / 2, y + 3.5, { bold: true, size: 5.5, align: 'center' });
  let dcx = cx;
  for (let i = 6; i < 9; i++) {
    rect(doc, dcx, y + 4.5, COL_W[i], HEADER_H - 4.5);
    text(doc, COL_H2[i], dcx + COL_W[i] / 2, y + 7.5, { bold: true, size: 5.5, align: 'center' });
    dcx += COL_W[i];
  }
  y += HEADER_H;

  // Linhas de dados
  const totalRows = Math.max(ficha.itens.length, MIN_TABLE_ROWS);
  for (let r = 0; r < totalRows; r++) {
    if (y + ROW_H > PAGE_H - 15) {
      doc.addPage('a4', 'landscape');
      y = M;
    }
    cx = M;
    const item = ficha.itens[r];
    for (let c = 0; c < 9; c++) {
      rect(doc, cx, y, COL_W[c], ROW_H);
      if (item) {
        let val = '';
        switch (c) {
          case 0: val = item.dataEntrega ?? ''; break;
          case 1: val = String(item.quantidade); break;
          case 2: val = item.descricao ?? ''; break;
          case 3: val = (modelo.colunaExtra === 'ca' ? item.ca : item.tamanho) ?? ''; break;
          case 4: val = item.postoServico ?? ''; break;
          case 5:
            if (ficha.assinaturaColaborador) {
              try { doc.addImage(ficha.assinaturaColaborador, 'PNG', cx + 2, y + 0.5, COL_W[5] - 4, ROW_H - 1); } catch {}
            } else if (item.recebido) {
              val = '✓';
            }
            break;
          case 6: val = item.devolucao?.data ?? ''; break;
          case 7: val = item.devolucao?.quantidade ? String(item.devolucao.quantidade) : ''; break;
          case 8: val = item.devolucao?.recebidoPor ?? ''; break;
        }
        if (val) {
          if (c === 2) {
            const lines = doc.splitTextToSize(val, COL_W[2] - 3);
            text(doc, lines.slice(0, 2).join('\n'), cx + 1.5, y + 3, { size: 5.5 });
          } else {
            text(doc, val, cx + 1.5, y + 4, { size: 6 });
          }
        }
      }
      cx += COL_W[c];
    }
    y += ROW_H;
  }

  return y;
}

function renderFooter(doc: jsPDF, y: number, ficha: EPIFicha): void {
  const OBS_H = 8;
  rect(doc, M, y, CW, OBS_H);
  text(doc, 'OBSERVAÇÕES:', M + 1.5, y + 4, { bold: true, size: 7 });
  text(doc, ficha.observacoes ?? '', M + 30, y + 4, { size: 6 });
  y += OBS_H + 3;

  if (ficha.assinadoEm) {
    text(doc, `Assinado em: ${new Date(ficha.assinadoEm).toLocaleString('pt-BR')}`, M, y, { size: 6 });
  }

  const statusText = ficha.status === 'assinada' ? 'FICHA ASSINADA' : 'FICHA PENDENTE';
  const [sr, sg, sb] = ficha.status === 'assinada' ? [39, 174, 96] : [200, 150, 0];
  doc.setTextColor(sr, sg, sb);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, PAGE_W / 2, y, { align: 'center' });
  doc.setTextColor(0);

  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, PAGE_W / 2, PAGE_H - 4, { align: 'center' });
}

// ===== Entry point =====

export async function generatePDF(ficha: EPIFicha): Promise<void> {
  const [config, modelo] = await Promise.all([loadConfig(), resolveModelo(ficha.modeloId)]);
  const doc = new jsPDF('l', 'mm', 'a4');

  let y = M;
  y = renderHeader(doc, y, config, modelo);
  y = renderEmployeeRows(doc, y, ficha, modelo);
  y = renderTermsSection(doc, y, modelo);
  y = renderDeclaroSection(doc, y, modelo);
  y = renderSignatureRow(doc, y, ficha, config);
  y = renderItemsTable(doc, y, ficha, modelo);
  if (modelo.layoutCabecalho === 'compacto') y = renderLegendaMotivos(doc, y);
  if (modelo.textoSecaoExtra) y = renderSecaoExtra(doc, y, modelo.textoSecaoExtra);
  renderFooter(doc, y, ficha);

  doc.save(`ficha-epi-${ficha.nomeFuncionario.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
