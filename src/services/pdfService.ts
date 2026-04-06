import jsPDF from 'jspdf';
import { EPIFicha } from '@/types/epi';

export function generatePDF(ficha: EPIFicha): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210;
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;
  let y = 15;

  const addLine = (yPos: number) => {
    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, yPos, pageW - marginR, yPos);
  };

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA DE ENTREGA DE EPI', pageW / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Equipamento de Proteção Individual', pageW / 2, y, { align: 'center' });
  doc.setTextColor(0);
  y += 8;
  addLine(y);
  y += 8;

  // Employee info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO COLABORADOR', marginL, y);
  y += 6;

  const field = (label: string, value: string, x: number, yPos: number, w: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(label, x, yPos);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '—', x, yPos + 5);
  };

  const col1 = marginL;
  const col2 = marginL + contentW * 0.35;
  const col3 = marginL + contentW * 0.65;

  field('Nome', ficha.nomeColaborador, col1, y, contentW * 0.35);
  field('CPF', ficha.cpf, col2, y, contentW * 0.3);
  field('Matrícula', ficha.matricula, col3, y, contentW * 0.35);
  y += 14;

  field('Cargo', ficha.cargo, col1, y, contentW * 0.35);
  field('Setor', ficha.setor, col2, y, contentW * 0.3);
  field('Empresa', ficha.empresa, col3, y, contentW * 0.35);
  y += 14;

  field('Data de Entrega', ficha.dataEntrega, col1, y, contentW * 0.35);
  y += 14;
  addLine(y);
  y += 8;

  // Items table
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ITENS DE EPI ENTREGUES', marginL, y);
  y += 6;

  // Table header
  const colWidths = [8, 55, 25, 18, 30, 44];
  const headers = ['', 'Item', 'C.A.', 'Qtd', 'Data', 'Status'];
  
  doc.setFillColor(240, 242, 245);
  doc.rect(marginL, y - 4, contentW, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  
  let xPos = marginL + 2;
  headers.forEach((h, i) => {
    doc.text(h, xPos, y);
    xPos += colWidths[i];
  });
  y += 7;

  // Table rows
  doc.setFont('helvetica', 'normal');
  ficha.itens.forEach((item) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    xPos = marginL + 2;
    doc.setFontSize(8);
    
    // Checkbox
    doc.setDrawColor(150);
    doc.rect(xPos, y - 3, 3.5, 3.5);
    if (item.recebido) {
      doc.setFont('helvetica', 'bold');
      doc.text('✓', xPos + 0.5, y);
      doc.setFont('helvetica', 'normal');
    }
    xPos += colWidths[0];
    
    doc.text(item.nome.substring(0, 30), xPos, y);
    xPos += colWidths[1];
    doc.text(item.ca, xPos, y);
    xPos += colWidths[2];
    doc.text(String(item.quantidade), xPos, y);
    xPos += colWidths[3];
    doc.text(item.dataEntrega, xPos, y);
    xPos += colWidths[4];
    doc.text(item.recebido ? 'Recebido' : 'Pendente', xPos, y);
    
    y += 7;
    addLine(y - 3);
  });

  y += 8;

  // Signatures
  if (y > 200) {
    doc.addPage();
    y = 20;
  }

  addLine(y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSINATURAS', marginL, y);
  y += 8;

  const sigW = 75;
  const sigH = 30;

  if (ficha.assinaturaColaborador) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Assinatura do Colaborador:', marginL, y);
    doc.setTextColor(0);
    y += 2;
    try {
      doc.addImage(ficha.assinaturaColaborador, 'PNG', marginL, y, sigW, sigH);
    } catch {}
    y += sigH + 2;
    addLine(y);
    doc.setFontSize(8);
    doc.text(ficha.nomeColaborador, marginL, y + 4);
    y += 10;
  }

  if (ficha.assinaturaResponsavel) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Assinatura do Responsável:', marginL, y);
    doc.setTextColor(0);
    y += 2;
    try {
      doc.addImage(ficha.assinaturaResponsavel, 'PNG', marginL, y, sigW, sigH);
    } catch {}
    y += sigH + 2;
    addLine(y);
    doc.setFontSize(8);
    doc.text('Responsável pela Entrega', marginL, y + 4);
    y += 10;
  }

  if (ficha.assinadoEm) {
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`Assinado em: ${new Date(ficha.assinadoEm).toLocaleString('pt-BR')}`, marginL, y);
    doc.setTextColor(0);
    y += 6;
  }

  // Status badge
  doc.setFontSize(8);
  const statusText = ficha.status === 'assinada' ? 'FICHA ASSINADA' : 'FICHA PENDENTE';
  const statusColor = ficha.status === 'assinada' ? [39, 174, 96] : [241, 196, 15];
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, pageW / 2, y, { align: 'center' });

  // Footer
  doc.setTextColor(180);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, 290, { align: 'center' });

  doc.save(`ficha-epi-${ficha.nomeColaborador.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
