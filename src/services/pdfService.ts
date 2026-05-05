import jsPDF from 'jspdf';
import { EPIFicha } from '@/types/epi';
import { getConfig } from '@/services/configService';

export function generatePDF(ficha: EPIFicha): void {
  const config = getConfig();
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
  const pageW = 297;
  const pageH = 210;
  const m = 8; // margin
  const cw = pageW - m * 2; // content width
  let y = m;

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(x1, y1, x2, y2);
  };

  const rect = (x: number, yp: number, w: number, h: number, fill?: string) => {
    if (fill) {
      doc.setFillColor(fill === 'header' ? 180 : fill === 'light' ? 230 : 245, fill === 'header' ? 180 : fill === 'light' ? 235 : 245, fill === 'header' ? 180 : fill === 'light' ? 240 : 250);
      doc.rect(x, yp, w, h, 'F');
    }
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, yp, w, h);
  };

  const text = (txt: string, x: number, yp: number, opts?: { bold?: boolean; size?: number; italic?: boolean; align?: 'center' | 'right' }) => {
    doc.setFontSize(opts?.size || 7);
    doc.setFont('helvetica', opts?.bold ? (opts?.italic ? 'bolditalic' : 'bold') : (opts?.italic ? 'italic' : 'normal'));
    doc.setTextColor(0);
    if (opts?.align) {
      doc.text(txt, x, yp, { align: opts.align });
    } else {
      doc.text(txt, x, yp);
    }
  };

  // ===== HEADER =====
  // Logo area
  rect(m, y, 40, 16);
  if (config.logoDataUrl) {
    try { doc.addImage(config.logoDataUrl, 'PNG', m + 2, y + 2, 36, 12); } catch {}
  } else {
    const parts = config.empresaNome.split(' ');
    text(parts[0] || '', m + 20, y + 6, { bold: true, size: 8, align: 'center' });
    text(parts.slice(1).join(' '), m + 20, y + 10, { bold: true, size: 7, align: 'center' });
    text(config.empresaSubtitulo, m + 20, y + 13, { size: 4, align: 'center' });
  }

  // Title
  rect(m + 40, y, cw - 40, 16);
  text('TERMO DE RECEBIMENTO DE UNIFORME/EPI\'s - REV -00', m + 40 + (cw - 40) / 2, y + 9, { bold: true, size: 12, align: 'center' });
  y += 16;

  // ===== ROW: NOME DO FUNCIONÁRIO + MOTIVOS + TURNO =====
  const row1H = 7;
  rect(m, y, cw, row1H);

  // Nome
  text('NOME DO FUNCIONÁRIO:', m + 1, y + 4.5, { bold: true, size: 7 });
  text(ficha.nomeFuncionario, m + 42, y + 4.5, { size: 8 });

  // Motivo checkboxes
  const motivoItems = [
    { key: 'admissao', label: 'ADMISSÃO' },
    { key: 'substituicao', label: 'SUBSTITUIÇÃO' },
    { key: 'perda_extravio', label: 'PERDA/EXTRAVIO' },
    { key: 'demissao', label: 'DEMISSÃO' },
    { key: 'complemento', label: 'COMPLEMENTO' },
  ];

  let mx = m + cw * 0.48;
  motivoItems.forEach(mi => {
    const checked = ficha.motivo === mi.key;
    // checkbox
    doc.setDrawColor(0);
    doc.rect(mx, y + 1.5, 3, 3);
    if (checked) {
      text('X', mx + 0.6, y + 4, { bold: true, size: 7 });
    }
    text(mi.label, mx + 4, y + 4, { size: 6 });
    mx += mi.label.length * 1.5 + 9;
  });

  // Turno
  const turnoX = m + cw - 28;
  line(turnoX - 1, y, turnoX - 1, y + row1H);
  text(ficha.turno === 'diurno' ? '☒' : '☐', turnoX, y + 3.5, { size: 7 });
  text('DIURNO', turnoX + 5, y + 3.5, { bold: true, size: 6 });
  text(ficha.turno === 'noturno' ? '☒' : '☐', turnoX, y + 6.5, { size: 7 });
  text('NOTURNO', turnoX + 5, y + 6.5, { bold: true, size: 6 });

  y += row1H;

  // ===== ROW: FUNÇÃO + FONE =====
  const row2H = 7;
  rect(m, y, cw, row2H);
  text('FUNÇÃO:', m + 1, y + 4.5, { bold: true, size: 7 });
  text(ficha.funcao, m + 20, y + 4.5, { size: 8 });

  const foneX = m + cw * 0.4;
  line(foneX, y, foneX, y + row2H);
  text('FONE:', foneX + 2, y + 4.5, { bold: true, size: 7 });
  text(ficha.telefone, foneX + 15, y + 4.5, { size: 8 });
  y += row2H;

  // ===== TERMO DE RESPONSABILIDADE HEADER =====
  rect(m, y, cw, 6, 'header');
  text('TERMO DE RESPONSABILIDADE', m + cw / 2, y + 4, { bold: true, size: 8, align: 'center' });
  y += 6;

  // ===== TERMO TEXT (left) + BASE LEGAL (right) =====
  const termoH = 52;
  const splitX = m + cw * 0.52;
  rect(m, y, cw, termoH);
  line(splitX, y, splitX, y + termoH);

  // Left: Termo text
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  const termoText = 'Declaro que recebi gratuitamente nesta data os EPI\'S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: "Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI\'s fornecidos pela empresa". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT, inclusive no que couber a título de indenização por rescisão de contrato de trabalho a importância correspondente ao valor do material.';
  const termoLines = doc.splitTextToSize(termoText, splitX - m - 3);
  doc.text(termoLines, m + 2, y + 4);

  // Right: Base Legal
  const bx = splitX + 2;
  text('BASE LEGAL: NR1 Item 1.8 (Cabe ao Empregado)', bx, y + 4, { bold: true, size: 6 });

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'italic');
  const baseLegalLines = [
    'a) Cumprir as disposições legais e regulamentares sobre segurança e saúde do trabalho,',
    'inclusive as ordens de serviço expedidas pelo empregador; (Alterado pela portaria SIT 84/2009).',
    '',
    '1.8.1 - Constitui ato faltoso a recusa injustificada do empregado ao cumprimento',
    'do disposto no item anterior.',
    '',
    'NR6 Item 6.7 (Cabe ao Empregado)',
    '6.7.1 - Cabe ao empregado quanto aos EPI\'s:',
    'a) Usar, utilizando-o apenas para a finalidade a que se destina;',
    'b) Responsabilizar-se pela guarda e conservação;',
    'c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;',
    'd) Cumprir as determinações do empregador sobre o uso adequado;',
  ];
  doc.setFont('helvetica', 'normal');
  baseLegalLines.forEach((l, i) => {
    if (l.startsWith('NR6') || l.startsWith('1.8.1') || l.startsWith('BASE')) {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'italic');
    }
    doc.setFontSize(5.5);
    doc.text(l, bx, y + 8 + i * 3.5);
  });
  doc.setFont('helvetica', 'normal');

  y += termoH;

  // ===== DECLARO section =====
  const declText = 'DECLARO para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços. Acrescento ainda que estou ciente que: quaisquer ajustes feitos neste material que possam impedir prejudicar limitar ou ainda causar algum dano ao meu serviço ou material são de MINHA responsabilidade.';
  doc.setFontSize(6);
  const declLines = doc.splitTextToSize(declText, cw - 4);
  const declH = declLines.length * 3 + 4;
  rect(m, y, cw, declH);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);

  // Bold "DECLARO" and italic parts
  const declParts = declText.split('DECLARO');
  text('DECLARO', m + 2, y + 3.5, { bold: true, size: 6 });
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const restText = declParts[1];
  const fullDeclLines = doc.splitTextToSize('DECLARO' + restText, cw - 4);
  doc.text(fullDeclLines, m + 2, y + 3.5);
  y += declH;

  // ===== SIGNATURE LINES: Nome Completo + Empresa =====
  const sigLineH = 16;
  rect(m, y, cw / 2, sigLineH);
  rect(m + cw / 2, y, cw / 2, sigLineH);

  // Signature images if available
  if (ficha.assinaturaColaborador) {
    try {
      doc.addImage(ficha.assinaturaColaborador, 'PNG', m + 5, y + 1, 55, 9);
    } catch {}
  }

  line(m + 10, y + sigLineH - 5, m + cw / 2 - 10, y + sigLineH - 5);
  text('NOME COMPLETO (FUNCIONÁRIO)', m + cw / 4, y + sigLineH - 1, { size: 6, align: 'center' });
  text(ficha.nomeFuncionario, m + cw / 4, y + sigLineH - 3, { size: 7, align: 'center' });

  if (ficha.assinaturaResponsavel) {
    try {
      doc.addImage(ficha.assinaturaResponsavel, 'PNG', m + cw / 2 + 5, y + 1, 55, 9);
    } catch {}
  }

  line(m + cw / 2 + 10, y + sigLineH - 5, m + cw - 10, y + sigLineH - 5);
  text('EMPRESA', m + cw * 0.75, y + sigLineH - 1, { size: 6, align: 'center' });
  text(ficha.empresa, m + cw * 0.75, y + sigLineH - 3, { size: 7, align: 'center' });
  y += sigLineH;

  // ===== ITEMS TABLE =====
  // Column widths (must sum to cw)
  const cols = [22, 14, 75, 18, 45, 42, 22, 16, 27];
  // DATA ENTREGA | QUANT. | DESCRIÇÃO | TAM./Nº | POSTO DE SERVIÇO | ASSINATURA DO FUNCIONÁRIO | DATA | QUANT | RECEBIDO POR
  const colHeaders1 = ['DATA', 'QUANT.', 'DESCRIÇÃO', 'TAM. / Nº', 'POSTO DE SERVIÇO', 'ASSINATURA DO', '', 'DEVOLUÇÃO', ''];
  const colHeaders2 = ['ENTREGA', '', '', '', '', 'FUNCIONÁRIO', 'DATA', 'QUANT', 'RECEBIDO POR'];

  // Header row
  const headerH = 9;
  rect(m, y, cw, headerH, 'light');

  // Draw header with merged DEVOLUÇÃO
  let cx = m;
  // First 6 columns header
  for (let i = 0; i < 6; i++) {
    rect(cx, y, cols[i], headerH);
    text(colHeaders1[i], cx + cols[i] / 2, y + 3.5, { bold: true, size: 5.5, align: 'center' });
    text(colHeaders2[i], cx + cols[i] / 2, y + 6.5, { bold: true, size: 5.5, align: 'center' });
    cx += cols[i];
  }
  // DEVOLUÇÃO merged header
  const devW = cols[6] + cols[7] + cols[8];
  rect(cx, y, devW, 4.5);
  text('DEVOLUÇÃO', cx + devW / 2, y + 3.5, { bold: true, size: 5.5, align: 'center' });
  // Sub-headers
  let dcx = cx;
  for (let i = 6; i < 9; i++) {
    rect(dcx, y + 4.5, cols[i], headerH - 4.5);
    text(colHeaders2[i], dcx + cols[i] / 2, y + 7.5, { bold: true, size: 5.5, align: 'center' });
    dcx += cols[i];
  }

  y += headerH;

  // Data rows
  const rowH = 6;
  const maxRows = Math.max(ficha.itens.length, 8);
  for (let r = 0; r < maxRows; r++) {
    if (y + rowH > pageH - 15) {
      doc.addPage('a4', 'landscape');
      y = m;
    }

    const item = ficha.itens[r];
    cx = m;

    for (let c = 0; c < 9; c++) {
      rect(cx, y, cols[c], rowH);
      if (item) {
        let val = '';
        switch (c) {
          case 0: val = item.dataEntrega || ''; break;
          case 1: val = String(item.quantidade); break;
          case 2: val = item.descricao.substring(0, 45); break;
          case 3: val = item.tamanho || ''; break;
          case 4: val = item.postoServico || ''; break;
          case 5:
            if (ficha.assinaturaColaborador) {
              try { doc.addImage(ficha.assinaturaColaborador, 'PNG', cx + 2, y + 0.5, cols[5] - 4, rowH - 1); } catch {}
            } else if (item.recebido) {
              val = '✓';
            }
            break;
          case 6: val = item.devolucao?.data || ''; break;
          case 7: val = item.devolucao?.quantidade ? String(item.devolucao.quantidade) : ''; break;
          case 8: val = item.devolucao?.recebidoPor || ''; break;
        }
        if (val) text(val, cx + 1.5, y + 4, { size: 6 });
      }
      cx += cols[c];
    }
    y += rowH;
  }

  // ===== OBSERVAÇÕES =====
  const obsH = 8;
  rect(m, y, cw, obsH);
  text('OBSERVAÇÕES:', m + 1.5, y + 4, { bold: true, size: 7 });
  text(ficha.observacoes || '', m + 30, y + 4, { size: 6 });
  y += obsH;

  // ===== STATUS + DATE =====
  y += 3;
  if (ficha.assinadoEm) {
    text(`Assinado em: ${new Date(ficha.assinadoEm).toLocaleString('pt-BR')}`, m, y, { size: 6 });
  }

  const statusText = ficha.status === 'assinada' ? 'FICHA ASSINADA' : 'FICHA PENDENTE';
  if (ficha.status === 'assinada') {
    doc.setTextColor(39, 174, 96);
  } else {
    doc.setTextColor(200, 150, 0);
  }
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, pageW / 2, y, { align: 'center' });
  doc.setTextColor(0);

  // Footer
  doc.setFontSize(5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, pageH - 4, { align: 'center' });

  doc.save(`ficha-epi-${ficha.nomeFuncionario.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
