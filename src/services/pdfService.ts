import jsPDF from 'jspdf';
import { EPIFicha } from '@/types/epi';

const motivoLabels: Record<string, string> = {
  admissao: 'Admissão', substituicao: 'Substituição',
  perda_extravio: 'Perda/Extravio', demissao: 'Demissão', complemento: 'Complemento',
};

export function generatePDF(ficha: EPIFicha): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210;
  const marginL = 10;
  const marginR = 10;
  const contentW = pageW - marginL - marginR;
  let y = 10;

  const addLine = (yPos: number) => {
    doc.setDrawColor(0);
    doc.line(marginL, yPos, pageW - marginR, yPos);
  };

  const drawRect = (x: number, yPos: number, w: number, h: number) => {
    doc.setDrawColor(0);
    doc.rect(x, yPos, w, h);
  };

  // Title
  doc.setFillColor(0, 51, 102);
  doc.rect(marginL, y, contentW, 10, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255);
  doc.text('TERMO DE RECEBIMENTO DE UNIFORME/EPI\'s - REV -00', pageW / 2, y + 7, { align: 'center' });
  doc.setTextColor(0);
  y += 12;

  // Employee info row 1
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  drawRect(marginL, y, contentW, 8);
  doc.text('NOME DO FUNCIONÁRIO:', marginL + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(ficha.nomeFuncionario, marginL + 45, y + 5);

  // Motivo checkboxes
  const motivos = ['admissao', 'substituicao', 'perda_extravio', 'demissao', 'complemento'];
  const motivoNames = ['ADMISSÃO', 'SUBSTITUIÇÃO', 'PERDA/EXTRAVIO', 'DEMISSÃO', 'COMPLEMENTO'];
  let mx = marginL + contentW * 0.55;
  motivos.forEach((m, i) => {
    doc.rect(mx, y + 1.5, 3, 3);
    if (ficha.motivo === m) {
      doc.setFont('helvetica', 'bold');
      doc.text('X', mx + 0.7, y + 4);
      doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(6);
    doc.text(motivoNames[i], mx + 4, y + 4);
    mx += 22;
    if (i === 2) { mx = marginL + contentW * 0.55; }
  });

  // Turno
  doc.setFontSize(7);
  doc.text(ficha.turno === 'diurno' ? '☑ DIURNO' : '☐ DIURNO', pageW - marginR - 30, y + 3);
  doc.text(ficha.turno === 'noturno' ? '☑ NOTURNO' : '☐ NOTURNO', pageW - marginR - 30, y + 6.5);

  y += 8;

  // Row 2: Função, Fone
  drawRect(marginL, y, contentW, 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FUNÇÃO:', marginL + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(ficha.funcao, marginL + 20, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.text('FONE:', marginL + 60, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(ficha.telefone, marginL + 75, y + 5);
  y += 8;

  // Termo de Responsabilidade
  doc.setFillColor(220, 220, 220);
  doc.rect(marginL, y, contentW, 6, 'F');
  drawRect(marginL, y, contentW, 6);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMO DE RESPONSABILIDADE', marginL + 2, y + 4);
  y += 6;

  // Legal text
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const termoText = 'Declaro que recebi gratuitamente nesta data os EPI\'S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: "Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI\'s fornecidos pela empresa". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT.';
  const splitTermo = doc.splitTextToSize(termoText, contentW * 0.55 - 4);
  drawRect(marginL, y, contentW, Math.max(splitTermo.length * 3 + 4, 30));
  doc.text(splitTermo, marginL + 2, y + 3);

  // Base legal (right side)
  const baseX = marginL + contentW * 0.55;
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.text('BASE LEGAL: NR1 Item 1.8 (Cabe ao Empregado)', baseX, y + 3);
  doc.setFont('helvetica', 'normal');
  const baseTexts = [
    'a) Cumprir as disposições legais e regulamentares sobre segurança e saúde do trabalho;',
    '1.8.1 - Constitui ato faltoso a recusa injustificada do empregado.',
    'NR6 Item 6.7 (Cabe ao Empregado)',
    '6.7.1 - Cabe ao empregado quanto aos EPI\'s:',
    'a) Usar, utilizando-o apenas para a finalidade a que se destina;',
    'b) Responsabilizar-se pela guarda e conservação;',
    'c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;',
    'd) Cumprir as determinações do empregador sobre o uso adequado;',
  ];
  baseTexts.forEach((t, i) => {
    doc.text(t, baseX, y + 6 + i * 3);
  });

  y += Math.max(splitTermo.length * 3 + 4, 30);

  // Declaration 2
  doc.setFontSize(5.5);
  const decl2 = 'DECLARO para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços.';
  const splitDecl2 = doc.splitTextToSize(decl2, contentW - 4);
  drawRect(marginL, y, contentW, splitDecl2.length * 3 + 4);
  doc.text(splitDecl2, marginL + 2, y + 3);
  y += splitDecl2.length * 3 + 4;

  // Signature lines (employee name / company)
  drawRect(marginL, y, contentW / 2, 10);
  drawRect(marginL + contentW / 2, y, contentW / 2, 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(ficha.nomeFuncionario, marginL + 2, y + 4);
  doc.setFontSize(6);
  doc.text('NOME COMPLETO (FUNCIONÁRIO)', marginL + 2, y + 8);
  doc.setFontSize(7);
  doc.text(ficha.empresa, marginL + contentW / 2 + 2, y + 4);
  doc.setFontSize(6);
  doc.text('EMPRESA', marginL + contentW / 2 + 2, y + 8);
  y += 10;

  // Items table header
  const cols = [20, 10, 55, 15, 30, 30, 15, 15];
  const colHeaders = ['DATA ENTREGA', 'QUANT.', 'DESCRIÇÃO', 'TAM./Nº', 'POSTO DE SERVIÇO', 'ASSINATURA', 'DEV.DATA', 'DEV.QTD'];

  doc.setFillColor(200, 210, 220);
  doc.rect(marginL, y, contentW, 7, 'F');
  drawRect(marginL, y, contentW, 7);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  let cx = marginL;
  colHeaders.forEach((h, i) => {
    const w = cols[i];
    doc.text(h, cx + 1, y + 4);
    if (i < colHeaders.length - 1) doc.line(cx + w, y, cx + w, y + 7);
    cx += w;
  });
  y += 7;

  // Items rows
  doc.setFont('helvetica', 'normal');
  const rowH = 6;
  const maxRows = Math.max(ficha.itens.length, 8);
  for (let r = 0; r < maxRows; r++) {
    if (y > 265) {
      doc.addPage();
      y = 15;
    }
    drawRect(marginL, y, contentW, rowH);
    const item = ficha.itens[r];
    cx = marginL;
    doc.setFontSize(6);
    if (item) {
      doc.text(item.dataEntrega || '', cx + 1, y + 4);
      cx += cols[0]; doc.line(cx, y, cx, y + rowH);
      doc.text(String(item.quantidade), cx + 1, y + 4);
      cx += cols[1]; doc.line(cx, y, cx, y + rowH);
      doc.text(item.descricao.substring(0, 35), cx + 1, y + 4);
      cx += cols[2]; doc.line(cx, y, cx, y + rowH);
      doc.text(item.tamanho || '', cx + 1, y + 4);
      cx += cols[3]; doc.line(cx, y, cx, y + rowH);
      doc.text(item.postoServico || '', cx + 1, y + 4);
      cx += cols[4]; doc.line(cx, y, cx, y + rowH);
      // Signature cell - mark if received
      doc.text(item.recebido ? '✓ Recebido' : '', cx + 1, y + 4);
      cx += cols[5]; doc.line(cx, y, cx, y + rowH);
      doc.text(item.devolucao?.data || '', cx + 1, y + 4);
      cx += cols[6]; doc.line(cx, y, cx, y + rowH);
      doc.text(item.devolucao?.quantidade ? String(item.devolucao.quantidade) : '', cx + 1, y + 4);
    } else {
      cols.forEach((w, i) => {
        cx += w;
        if (i < cols.length - 1) doc.line(cx, y, cx, y + rowH);
      });
    }
    y += rowH;
  }

  // Observations
  if (ficha.observacoes) {
    y += 3;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVAÇÕES:', marginL, y + 3);
    doc.setFont('helvetica', 'normal');
    const obsLines = doc.splitTextToSize(ficha.observacoes, contentW - 4);
    doc.text(obsLines, marginL + 25, y + 3);
    y += obsLines.length * 3 + 5;
  }

  y += 5;

  // Signatures
  if (y > 220) {
    doc.addPage();
    y = 15;
  }

  const sigW = 75;
  const sigH = 25;

  if (ficha.assinaturaColaborador) {
    doc.setFontSize(7);
    doc.text('Assinatura do Funcionário:', marginL, y);
    y += 2;
    try {
      doc.addImage(ficha.assinaturaColaborador, 'PNG', marginL, y, sigW, sigH);
    } catch {}
    y += sigH + 2;
    addLine(y);
    doc.text(ficha.nomeFuncionario, marginL, y + 3);
    y += 8;
  }

  if (ficha.assinaturaResponsavel) {
    doc.setFontSize(7);
    doc.text('Assinatura do Responsável:', marginL, y);
    y += 2;
    try {
      doc.addImage(ficha.assinaturaResponsavel, 'PNG', marginL, y, sigW, sigH);
    } catch {}
    y += sigH + 2;
    addLine(y);
    doc.text('Responsável pela Entrega', marginL, y + 3);
    y += 8;
  }

  if (ficha.assinadoEm) {
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.text(`Assinado em: ${new Date(ficha.assinadoEm).toLocaleString('pt-BR')}`, marginL, y);
    doc.setTextColor(0);
    y += 5;
  }

  // Status
  doc.setFontSize(8);
  const statusText = ficha.status === 'assinada' ? 'FICHA ASSINADA' : 'FICHA PENDENTE';
  const statusColor = ficha.status === 'assinada' ? [39, 174, 96] : [241, 196, 15];
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, pageW / 2, y, { align: 'center' });

  // Footer
  doc.setTextColor(180);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, 290, { align: 'center' });

  doc.save(`ficha-epi-${ficha.nomeFuncionario.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
