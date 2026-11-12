// deno-lint-ignore-file
// PDF do relatório do dia da Movimentação Diária. Puro: recebe o documento do
// jsPDF já criado (A4 deitado, mm), por isso serve para os dois lados:
//  * navegador (link do fiscal, botão "Baixar PDF"): src/modules/movimentacao/lib/relatorioDiaPdf.ts
//  * função avisar-movimentacao (passagem de plantão por e-mail): npm:jspdf
// Colaborador de posto RESERVA na Senior sai com "— RESERVA" em vermelho.

import { dataBr } from './avisoMovimentacao.ts';

export interface LancamentoPdf {
  id: string; codigo: string; criado_em: string; data: string; status: 'ok' | 'divergente';
  posto: string; motivo: string; falta_nome: string; cobertura_nome: string | null; horario: string; turno: string;
  ok_pelo_plantao?: boolean;
  data_lancamento?: string; empresa?: string; justificativa?: string | null;
  falta_matricula?: string; cobertura_matricula?: string | null;
  falta_reserva?: boolean; cobertura_reserva?: boolean;
  cobertura_por_extra?: boolean; ocorrencias?: number | null;
}

/** Dados da passagem de plantão (só no PDF que vai por e-mail). */
export interface PassagemPdf {
  codigo: string; criado_em: string;
  recebe_nome: string | null; recebe_matricula: string | null;
  observacao: string | null;
}

export interface RelatorioPdf {
  fiscal: { nome: string; matricula: number | string; cargo: string | null };
  data: string; gerado_em: string;
  lancamentos: LancamentoPdf[];
  passagem?: PassagemPdf | null;
}

export const COLUNAS = ['Código', 'Data', 'Status', 'Posto', 'Motivo', 'Na falta', 'Cobertura', 'Horário / turno', 'Extra'] as const;
const LARG_COL = [20, 17, 20, 42, 20, 52, 52, 34, 12]; // soma = 269 (A4 deitado, margem 14)

const pessoa = (nome: string | null | undefined, matricula: string | null | undefined, reserva?: boolean) =>
  !nome ? '' : `${nome}${matricula ? ` (${matricula})` : ''}${reserva ? ' — RESERVA' : ''}`;

const dataHoraBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** Texto de cada coluna de um lançamento. */
export function celulas(l: LancamentoPdf): string[] {
  const status = l.status === 'ok' ? (l.ok_pelo_plantao ? 'OK (plantão)' : 'OK') : 'DIVERGENTE';
  const data = l.data_lancamento && l.data_lancamento !== l.data ? `${dataBr(l.data)}\nlançado ${dataBr(l.data_lancamento)}` : dataBr(l.data);
  const motivo = l.justificativa ? `${l.motivo}\n${l.justificativa}` : l.motivo;
  return [
    l.codigo, data, status,
    `${l.posto}${l.empresa ? `\n${l.empresa}` : ''}`,
    motivo,
    pessoa(l.falta_nome, l.falta_matricula, l.falta_reserva),
    l.cobertura_nome ? pessoa(l.cobertura_nome, l.cobertura_matricula, l.cobertura_reserva) : 'Ninguém cobriu',
    `${l.horario}\n${l.turno}`,
    l.cobertura_por_extra === undefined ? '' : l.cobertura_por_extra ? 'SIM' : 'NÃO',
  ];
}

export function resumo(ls: LancamentoPdf[]) {
  return {
    total: ls.length,
    ok: ls.filter(l => l.status === 'ok').length,
    divergentes: ls.filter(l => l.status === 'divergente').length,
    descobertos: ls.filter(l => !l.cobertura_nome).length,
    coberturasReserva: ls.filter(l => l.cobertura_reserva).length,
  };
}

export const nomeArquivoRelatorio = (r: RelatorioPdf) =>
  `${r.passagem ? 'Passagem de plantão' : 'Movimentação'} ${dataBr(r.data).replace(/\//g, '-')} - matrícula ${r.fiscal.matricula}.pdf`;

const M = 14;
const W = 297, H = 210;
const LARG = W - 2 * M;

/** Desenha o relatório no documento (jsPDF, A4 deitado, mm). `logo`: data URL PNG ou null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function desenharRelatorio(doc: any, r: RelatorioPdf, logo: string | null) {
  const cabecalhoTabela = (y: number) => {
    let x = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0);
    COLUNAS.forEach((c, i) => {
      doc.setFillColor(228, 232, 240);
      doc.rect(x, y, LARG_COL[i], 7, 'F');
      doc.text(c, x + 1.5, y + 4.8);
      x += LARG_COL[i];
    });
    return y + 7;
  };

  const topo = () => {
    doc.setDrawColor(180); doc.setLineWidth(0.2); doc.setTextColor(0);
    if (logo) { try { doc.addImage(logo, 'PNG', M, M - 2, 40, 14); } catch { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(r.passagem ? 'PASSAGEM DE PLANTÃO' : 'CONTROLE DE MOVIMENTAÇÃO DIÁRIA', W - M, M + 3, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`${r.passagem ? 'Movimentação diária — lançamentos do dia' : 'Relatório do dia'} ${dataBr(r.data)}`, W - M, M + 9, { align: 'right' });
    doc.line(M, M + 14, W - M, M + 14);
    return M + 14;
  };

  let y = topo() + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold'); doc.text(r.passagem ? 'Entrega:' : 'Fiscal:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${r.fiscal.nome} — matrícula ${r.fiscal.matricula}${r.fiscal.cargo ? ` — ${r.fiscal.cargo}` : ''}`, M + 17, y);
  if (r.passagem) {
    y += 6;
    doc.setFont('helvetica', 'bold'); doc.text('Recebe:', M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(r.passagem.recebe_nome ? pessoa(r.passagem.recebe_nome, r.passagem.recebe_matricula) : 'não informado', M + 17, y);
    doc.text(`Passagem ${r.passagem.codigo} em ${dataHoraBr(r.passagem.criado_em)}`, W - M, y, { align: 'right' });
    if (r.passagem.observacao) {
      y += 6;
      doc.setFont('helvetica', 'bold'); doc.text('Observações:', M, y);
      doc.setFont('helvetica', 'normal');
      const obs = (doc.splitTextToSize(r.passagem.observacao, LARG - 26) as string[]).slice(0, 6);
      doc.text(obs, M + 26, y);
      y += (obs.length - 1) * 4.6;
    }
  }
  y += 6;
  const s = resumo(r.lancamentos);
  doc.text(
    `${s.total} lançamento(s)  ·  ${s.ok} OK  ·  ${s.divergentes} divergente(s)  ·  ${s.descobertos} sem cobertura  ·  ${s.coberturasReserva} coberto(s) por reserva`,
    M, y);
  y += 4;
  doc.setFontSize(8); doc.setTextColor(90);
  doc.text('Inclui os lançamentos com a data do dia e os feitos neste dia com outra data.', M, y + 3);
  doc.setTextColor(0);
  y += 7;

  if (!r.lancamentos.length) {
    doc.setFontSize(11);
    doc.text('Nenhum lançamento neste dia.', M, y + 8);
  } else {
    y = cabecalhoTabela(y);
    doc.setFontSize(8);
    r.lancamentos.forEach((l, idx) => {
      doc.setFont('helvetica', 'normal');
      const textos = celulas(l).map((t, i) => doc.splitTextToSize(t, LARG_COL[i] - 3) as string[]);
      const alt = Math.max(...textos.map(t => t.length)) * 3.6 + 3;
      if (y + alt > H - M - 6) {
        doc.addPage();
        y = cabecalhoTabela(topo() + 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      }
      if (idx % 2 === 1) { doc.setFillColor(246, 247, 250); doc.rect(M, y, LARG, alt, 'F'); }
      let x = M;
      textos.forEach((t, i) => {
        const divergente = i === 2 && l.status === 'divergente';
        const reserva = (i === 5 && l.falta_reserva) || (i === 6 && l.cobertura_reserva);
        if (divergente) doc.setTextColor(180, 83, 9);
        else if (reserva) doc.setTextColor(185, 28, 28);
        doc.setFont('helvetica', i === 0 || divergente ? 'bold' : 'normal');
        doc.text(t, x + 1.5, y + 4.2);
        doc.setTextColor(0);
        x += LARG_COL[i];
      });
      doc.setDrawColor(220); doc.line(M, y + alt, W - M, y + alt);
      y += alt;
    });
  }

  const paginas = doc.getNumberOfPages();
  const origem = r.passagem ? 'na passagem de plantão' : 'pelo link da movimentação diária';
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text(`Gerado em ${dataHoraBr(r.gerado_em)} ${origem}`, M, H - 7);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 7, { align: 'right' });
  }
  doc.setTextColor(0);
  return doc;
}
