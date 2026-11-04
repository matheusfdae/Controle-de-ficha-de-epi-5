import type { jsPDF as JsPDF } from 'jspdf';
import logoUrl from '@/modules/crachas/assets/logo-5estrelas.jpg';
import { STATUS_PEDIDO, dataBr, formatarNumero, nomeMaterial, reais, type Material, type PedidoCompleto, type StatusPedido } from './pedidosService';
import type { LinhaTeto } from './gerencial';

/**
 * Relatórios em PDF dos pedidos de material (A4 deitado): teto x gasto por
 * posto, pedidos de um posto no mês e todos os pedidos do mês.
 * Cabeçalho com o logo, cartões de resumo, tabelas com barra de uso e selo de
 * situação, cabeçalho da tabela repetido a cada página e rodapé com página.
 * Só caracteres da fonte padrão (sem "—" nem setas).
 */

type Cor = [number, number, number];
const MARINHO: Cor = [30, 38, 74];      // fundo do logo
const AZUL: Cor = [29, 78, 216];
const AZUL_CLARO: Cor = [239, 246, 255];
const TEXTO: Cor = [15, 23, 42];
const CINZA: Cor = [100, 116, 139];
const BORDA: Cor = [226, 232, 240];
const ZEBRA: Cor = [248, 250, 252];
const VERMELHO: Cor = [185, 28, 28];
const VERMELHO_FUNDO: Cor = [254, 226, 226];
const VERDE: Cor = [22, 101, 52];
const VERDE_FUNDO: Cor = [220, 252, 231];
const AMBAR: Cor = [180, 83, 9];
const AMBAR_FUNDO: Cor = [254, 243, 199];
const NEUTRO_FUNDO: Cor = [241, 245, 249];

const M = 12;          // margem
const TOPO = 40;       // onde o conteúdo começa na 1ª página
const TOPO_CONT = 16;  // nas páginas seguintes

type Selo = 'alerta' | 'ok' | 'aviso' | 'neutro';
const SELO: Record<Selo, [Cor, Cor]> = {
  alerta: [VERMELHO_FUNDO, VERMELHO], ok: [VERDE_FUNDO, VERDE], aviso: [AMBAR_FUNDO, AMBAR], neutro: [NEUTRO_FUNDO, CINZA],
};

interface Coluna { titulo: string; largura: number; direita?: boolean; centro?: boolean }
type Celula =
  | string
  | { texto: string; cor?: Cor; negrito?: boolean; pequeno?: boolean }
  | { selo: string; tipo: Selo }
  | { barra: number | null; alerta?: boolean };

// ---------- Logo (carregado uma vez; sem logo o relatório sai igual, só sem a imagem) ----------
let logo: string | null | undefined;
/** Para testes: usa este logo (data URL) em vez de buscar o arquivo. */
export const definirLogo = (dataUrl: string | null) => { logo = dataUrl; };
async function carregarLogo() {
  if (logo !== undefined) return logo;
  try {
    const blob = await (await fetch(logoUrl)).blob();
    logo = await new Promise<string>((ok, falha) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = () => falha(r.error);
      r.readAsDataURL(blob);
    });
  } catch { logo = null; }
  return logo;
}

async function novoPdf() {
  const { default: jsPDF } = await import('jspdf');
  return { doc: new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), logo: await carregarLogo() };
}
const largura = (doc: JsPDF) => doc.internal.pageSize.getWidth();
const altura = (doc: JsPDF) => doc.internal.pageSize.getHeight();
const fonte = (doc: JsPDF, tam: number, negrito = false, cor: Cor = TEXTO) => {
  doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(cor[0], cor[1], cor[2]);
};
const preencher = (doc: JsPDF, c: Cor) => doc.setFillColor(c[0], c[1], c[2]);
const traco = (doc: JsPDF, c: Cor) => doc.setDrawColor(c[0], c[1], c[2]);

/** Faixa marinho do topo com logo, título, período e filtro. */
function cabecalho(doc: JsPDF, img: string | null, titulo: string, periodo: string, filtro: string) {
  const w = largura(doc);
  preencher(doc, MARINHO); doc.rect(0, 0, w, 28, 'F');
  preencher(doc, AZUL); doc.rect(0, 28, w, 1.2, 'F');
  let x = M;
  if (img) { doc.addImage(img, 'JPEG', M, 2, 24, 24); x = M + 28; }
  fonte(doc, 8, false, [191, 200, 230]);
  doc.text('PEDIDOS DE MATERIAL', x, 9.5);
  fonte(doc, 16, true, [255, 255, 255]);
  doc.text(titulo, x, 17);
  fonte(doc, 9, false, [214, 220, 240]);
  doc.text(filtro, x, 23);
  fonte(doc, 8, false, [191, 200, 230]);
  doc.text('PERÍODO', w - M, 9.5, { align: 'right' });
  fonte(doc, 14, true, [255, 255, 255]);
  doc.text(periodo, w - M, 17, { align: 'right' });
  return TOPO;
}

/** Rodapé de todas as páginas: linha, nome do sistema, data de emissão e página. */
function rodapes(doc: JsPDF) {
  const n = doc.getNumberOfPages();
  const w = largura(doc);
  const h = altura(doc);
  const emitido = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    traco(doc, BORDA); doc.setLineWidth(0.3); doc.line(M, h - 10, w - M, h - 10);
    fonte(doc, 7.5, false, CINZA);
    doc.text(`Grupo 5 Estrelas · Controle de EPI e Uniforme · emitido em ${emitido}`, M, h - 5.5);
    doc.text(`Página ${i} de ${n}`, w - M, h - 5.5, { align: 'right' });
  }
}

/** Cartões de resumo lado a lado. */
function cartoes(doc: JsPDF, y: number, itens: { rotulo: string; valor: string; detalhe?: string; tipo?: Selo }[]) {
  const gap = 4;
  const w = (largura(doc) - 2 * M - gap * (itens.length - 1)) / itens.length;
  itens.forEach((c, i) => {
    const x = M + i * (w + gap);
    const [fundo, cor] = c.tipo && c.tipo !== 'neutro' ? SELO[c.tipo] : [ZEBRA, TEXTO];
    preencher(doc, fundo); traco(doc, BORDA); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, 19, 2, 2, 'FD');
    if (c.tipo === 'alerta') { preencher(doc, VERMELHO); doc.rect(x, y + 2, 1.2, 15, 'F'); }
    fonte(doc, 7, true, CINZA);
    doc.text(c.rotulo.toUpperCase(), x + 4, y + 5.5);
    fonte(doc, 13, true, cor);
    doc.text(c.valor, x + 4, y + 12.5);
    if (c.detalhe) { fonte(doc, 7.5, false, CINZA); doc.text(c.detalhe, x + 4, y + 16.8); }
  });
  return y + 25;
}

function tituloSecao(doc: JsPDF, y: number, texto: string, direita?: string) {
  preencher(doc, AZUL); doc.rect(M, y - 3.6, 1.2, 4.8, 'F');
  fonte(doc, 11, true, MARINHO);
  doc.text(texto, M + 3, y);
  if (direita) { fonte(doc, 9, false, CINZA); doc.text(direita, largura(doc) - M, y, { align: 'right' }); }
  return y + 4;
}

function selo(doc: JsPDF, x: number, yMeio: number, texto: string, tipo: Selo, alinhar: 'esq' | 'dir' | 'centro' = 'esq', larguraCol = 0) {
  fonte(doc, 7.5, true);
  const w = doc.getTextWidth(texto) + 5;
  const x0 = alinhar === 'dir' ? x + larguraCol - w : alinhar === 'centro' ? x + (larguraCol - w) / 2 : x;
  const [fundo, cor] = SELO[tipo];
  preencher(doc, fundo); doc.roundedRect(x0, yMeio - 2.4, w, 4.8, 2.4, 2.4, 'F');
  fonte(doc, 7.5, true, cor);
  doc.text(texto, x0 + 2.5, yMeio + 1);
}

function barra(doc: JsPDF, x: number, yMeio: number, w: number, pct: number | null, alerta?: boolean) {
  if (pct == null) { fonte(doc, 9, false, CINZA); doc.text('-', x + w / 2, yMeio + 1.2, { align: 'center' }); return; }
  const bw = w - 15;
  preencher(doc, NEUTRO_FUNDO); doc.roundedRect(x, yMeio - 1.4, bw, 2.8, 1.4, 1.4, 'F');
  const vermelho = alerta || pct > 100;
  const cor: Cor = vermelho ? VERMELHO : pct >= 80 ? [217, 119, 6] : AZUL;
  const cheio = Math.max(1, Math.min(bw, (bw * pct) / 100));
  preencher(doc, cor); doc.roundedRect(x, yMeio - 1.4, cheio, 2.8, 1.4, 1.4, 'F');
  fonte(doc, 8, true, vermelho ? VERMELHO : TEXTO);
  doc.text(`${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`, x + w, yMeio + 1.1, { align: 'right' });
}

/**
 * Tabela com quebra de página e cabeçalho repetido. `total` desenha uma linha
 * final em destaque. Devolve o y final.
 */
function tabela(doc: JsPDF, y: number, colunas: Coluna[], linhas: Celula[][],
  opts: { destaque?: (i: number) => boolean; total?: Celula[]; cabecalhoClaro?: boolean } = {}) {
  const h = altura(doc);
  const total = colunas.reduce((s, c) => s + c.largura, 0);
  const desenharCabecalho = () => {
    preencher(doc, opts.cabecalhoClaro ? AZUL_CLARO : MARINHO);
    doc.roundedRect(M, y, total, 8, 1.5, 1.5, 'F');
    doc.rect(M, y + 4, total, 4, 'F');
    fonte(doc, 7.5, true, opts.cabecalhoClaro ? AZUL : [255, 255, 255]);
    let x = M;
    for (const c of colunas) {
      const t = c.titulo.toUpperCase();
      if (c.direita) doc.text(t, x + c.largura - 2.5, y + 5.3, { align: 'right' });
      else if (c.centro) doc.text(t, x + c.largura / 2, y + 5.3, { align: 'center' });
      else doc.text(t, x + 2.5, y + 5.3);
      x += c.largura;
    }
    y += 8;
  };
  const linha = (cels: Celula[], i: number, ehTotal = false) => {
    // Na linha de total, o texto da 1ª coluna usa também as colunas vazias ao lado.
    let span = colunas[0].largura;
    if (ehTotal) for (let k = 1; k < cels.length && cels[k] === ''; k++) span += colunas[k].largura;
    const partes = cels.map((cel, j) => {
      if (typeof cel !== 'string' && !('texto' in cel)) return [''];
      const pequeno = typeof cel !== 'string' && cel.pequeno;
      fonte(doc, pequeno ? 8 : 9, ehTotal || (typeof cel !== 'string' && !!cel.negrito));
      return doc.splitTextToSize(typeof cel === 'string' ? cel : cel.texto, (j === 0 ? span : colunas[j].largura) - 5) as string[];
    });
    const alt = Math.max(7.5, Math.max(...partes.map(p => p.length)) * 3.9 + 3.6);
    if (y + alt > h - 14) { doc.addPage(); y = TOPO_CONT; desenharCabecalho(); }
    if (ehTotal) { preencher(doc, AZUL_CLARO); doc.rect(M, y, total, alt, 'F'); }
    else if (opts.destaque?.(i)) { preencher(doc, [254, 242, 242]); doc.rect(M, y, total, alt, 'F'); }
    else if (i % 2) { preencher(doc, ZEBRA); doc.rect(M, y, total, alt, 'F'); }
    let x = M;
    cels.forEach((cel, j) => {
      const c = colunas[j];
      const meio = y + alt / 2;
      if (typeof cel !== 'string' && 'selo' in cel) selo(doc, x + 2.5, meio, cel.selo, cel.tipo, c.direita ? 'dir' : c.centro ? 'centro' : 'esq', c.largura - 5);
      else if (typeof cel !== 'string' && 'barra' in cel) barra(doc, x + 2.5, meio, c.largura - 5, cel.barra, cel.alerta);
      else {
        const est: { cor?: Cor; negrito?: boolean; pequeno?: boolean } = typeof cel === 'string' ? {} : cel;
        fonte(doc, est.pequeno ? 8 : 9, !!est.negrito || ehTotal, est.cor ?? (est.pequeno ? CINZA : TEXTO));
        // Texto centralizado na altura da linha.
        const yt = y + 4.9 + (alt - partes[j].length * 3.9 - 3.6) / 2;
        if (c.direita) doc.text(partes[j], x + c.largura - 2.5, yt, { align: 'right' });
        else if (c.centro) doc.text(partes[j], x + c.largura / 2, yt, { align: 'center' });
        else doc.text(partes[j], x + 2.5, yt);
      }
      x += c.largura;
    });
    traco(doc, BORDA); doc.setLineWidth(0.2);
    doc.line(M, y + alt, M + total, y + alt);
    y += alt;
  };
  desenharCabecalho();
  linhas.forEach((l, i) => linha(l, i));
  if (opts.total) { traco(doc, AZUL); doc.setLineWidth(0.4); doc.line(M, y, M + total, y); linha(opts.total, 0, true); }
  return y;
}

const entregar = (doc: JsPDF, base: string, baixar: boolean) => { if (baixar) doc.save(nomeArquivo(base)); return doc; };
const nomeArquivo = (base: string) => `${base}.pdf`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
const filtroTexto = (uf: string) => (uf === 'todos' ? 'Todos os estados' : `Estado: ${uf}`);
const pctTxt = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const SELO_STATUS: Record<StatusPedido, Selo> = { enviada: 'aviso', devolvida: 'aviso', a_atender: 'neutro', atendida: 'ok', cancelada: 'neutro' };
/** Rótulo curto para caber no selo da tabela. */
const STATUS_CURTO: Record<StatusPedido, string> = { enviada: 'A CONFERIR', devolvida: 'DEVOLVIDO', a_atender: 'A ATENDER', atendida: 'ATENDIDO', cancelada: 'CANCELADO' };
const mesExtenso = (mes: string) => {
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${nomes[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
};
const seloSituacao = (teto: number | null, passou: boolean, pct: number | null): Celula =>
  teto == null ? { selo: 'SEM TETO', tipo: 'neutro' }
    : passou ? { selo: 'PASSOU', tipo: 'alerta' }
      : (pct ?? 0) >= 80 ? { selo: 'ATENÇÃO', tipo: 'aviso' } : { selo: 'DENTRO', tipo: 'ok' };

// ---------- Teto x gasto por posto ----------

export async function pdfTetoPorPosto(linhas: LinhaTeto[], mes: string, uf: string, baixar = true) {
  const { doc, logo: img } = await novoPdf();
  let y = cabecalho(doc, img, 'Teto de gasto por posto', mesExtenso(mes), `${filtroTexto(uf)} · soma do valor dos pedidos feitos no mês, sem os cancelados`);
  const comTeto = linhas.filter(l => l.teto != null);
  const gasto = linhas.reduce((s, l) => s + l.gasto, 0);
  const tetoSoma = comTeto.reduce((s, l) => s + (l.teto ?? 0), 0);
  const gastoComTeto = comTeto.reduce((s, l) => s + l.gasto, 0);
  const acima = linhas.filter(l => l.passou);
  const nPedidos = linhas.reduce((s, l) => s + l.pedidos, 0);
  y = cartoes(doc, y, [
    { rotulo: 'Gasto no mês', valor: reais(gasto), detalhe: `${nPedidos} pedido(s)` },
    { rotulo: 'Teto somado', valor: reais(tetoSoma), detalhe: tetoSoma > 0 ? `${pctTxt((gastoComTeto / tetoSoma) * 100)} usado nos postos com teto` : 'nenhum posto com teto' },
    { rotulo: 'Postos com teto', valor: String(comTeto.length), detalhe: `${linhas.length - comTeto.length} sem teto, com gasto` },
    { rotulo: 'Acima do teto', valor: String(acima.length), tipo: acima.length ? 'alerta' : 'ok',
      detalhe: acima.length ? `passaram ${reais(acima.reduce((s, l) => s + l.gasto - (l.teto ?? 0), 0))} no total` : 'todos dentro do teto' },
  ]);
  y = tituloSecao(doc, y + 2, 'Postos', 'Primeiro os que passaram; depois do mais perto do teto ao mais longe');
  tabela(doc, y + 1, [
    { titulo: 'Posto', largura: 74 }, { titulo: 'UF', largura: 12, centro: true }, { titulo: 'Teto mensal', largura: 30, direita: true },
    { titulo: 'Gasto no mês', largura: 30, direita: true }, { titulo: 'Uso do teto', largura: 50 },
    { titulo: 'Sobra / passou', largura: 37, direita: true }, { titulo: 'Pedidos', largura: 17, centro: true }, { titulo: 'Situação', largura: 23, centro: true },
  ], linhas.map(l => [
    { texto: l.nome, negrito: true }, l.uf, l.teto == null ? { texto: 'sem teto', cor: CINZA } : reais(l.teto),
    { texto: reais(l.gasto), negrito: true, cor: l.passou ? VERMELHO : TEXTO },
    { barra: l.pct, alerta: l.passou },
    l.teto == null ? { texto: '-', cor: CINZA }
      : { texto: l.passou ? `passou ${reais(l.gasto - l.teto)}` : `sobra ${reais(l.teto - l.gasto)}`, cor: l.passou ? VERMELHO : VERDE, negrito: l.passou },
    String(l.pedidos),
    seloSituacao(l.teto, l.passou, l.pct),
  ] as Celula[]), {
    destaque: i => linhas[i].passou,
    total: ['Total', '', reais(tetoSoma), reais(gasto), { barra: tetoSoma > 0 ? Math.round((gastoComTeto / tetoSoma) * 100) : null }, '', String(nPedidos), ''],
  });
  rodapes(doc);
  return entregar(doc, `teto-por-posto-${mes}${uf === 'todos' ? '' : `-${uf}`}`, baixar);
}

// ---------- Pedidos de um posto ----------

export async function pdfPedidosDoPosto(posto: { nome: string; uf: string; teto_material: number | null }, pedidos: PedidoCompleto[],
  materiais: Material[], mes: string, baixar = true) {
  const { doc, logo: img } = await novoPdf();
  let y = cabecalho(doc, img, `${posto.nome} (${posto.uf})`, mesExtenso(mes), 'Pedidos do posto no mês · quantidade conferida x preço do dia do pedido');
  const validos = pedidos.filter(p => p.status !== 'cancelada');
  const gasto = validos.reduce((s, p) => s + p.valor_total, 0);
  const teto = posto.teto_material;
  const passou = teto != null && gasto > teto;
  y = cartoes(doc, y, [
    { rotulo: 'Pedidos no mês', valor: String(pedidos.length), detalhe: `${pedidos.length - validos.length} cancelado(s)` },
    { rotulo: 'Gasto no mês', valor: reais(gasto), tipo: passou ? 'alerta' : undefined, detalhe: 'sem os cancelados' },
    { rotulo: 'Teto mensal', valor: teto == null ? 'sem teto' : reais(teto), detalhe: teto != null && teto > 0 ? `${pctTxt((gasto / teto) * 100)} usado` : undefined },
    teto == null ? { rotulo: 'Situação', valor: '-' }
      : { rotulo: passou ? 'Passou do teto' : 'Sobra no mês', valor: reais(Math.abs(teto - gasto)), tipo: passou ? 'alerta' : 'ok' },
  ]);
  if (teto != null && teto > 0) {
    fonte(doc, 8, true, CINZA);
    doc.text('USO DO TETO NO MÊS', M, y - 1);
    barra(doc, M + 36, y - 2, largura(doc) - 2 * M - 36, Math.round((gasto / teto) * 100), passou);
    y += 5;
  }
  if (!pedidos.length) { fonte(doc, 10, false, CINZA); doc.text('Nenhum pedido neste mês.', M, y + 6); }

  const w = largura(doc);
  for (const p of [...pedidos].sort((a, b) => a.data_pedido.localeCompare(b.data_pedido) || a.codigo.localeCompare(b.codigo))) {
    // O pedido vai inteiro para a página seguinte quando não cabe no resto desta (e cabe numa página).
    const precisa = 3 + 13 + 8 + p.itens.length * 7.5 + 7.5;
    const util = altura(doc) - 14;
    if (y + precisa > util && TOPO_CONT + precisa <= util) { doc.addPage(); y = TOPO_CONT; }
    else if (y + 34 > util) { doc.addPage(); y = TOPO_CONT; }
    y += 3;
    preencher(doc, NEUTRO_FUNDO); doc.roundedRect(M, y, w - 2 * M, 11, 1.5, 1.5, 'F');
    preencher(doc, p.status === 'cancelada' ? CINZA : AZUL); doc.rect(M, y + 1.5, 1.2, 8, 'F');
    fonte(doc, 11, true, MARINHO);
    doc.text(p.codigo, M + 4, y + 7);
    const xInfo = M + 4 + doc.getTextWidth(p.codigo) + 4;
    fonte(doc, 9, false, CINZA);
    const info = `${dataBr(p.data_pedido)} · ${p.solicitante_nome}${p.solicitante_matricula ? ` (matr. ${p.solicitante_matricula})` : ''}`;
    doc.text(info, xInfo, y + 7);
    selo(doc, xInfo + doc.getTextWidth(info) + 4, y + 5.6, STATUS_PEDIDO[p.status].toUpperCase(), SELO_STATUS[p.status]);
    fonte(doc, 11, true, p.status === 'cancelada' ? CINZA : TEXTO);
    doc.text(p.status === 'cancelada' ? `${reais(p.valor_total)} (fora do gasto)` : reais(p.valor_total), w - M - 3, y + 7, { align: 'right' });
    y += 13;
    const semPreco = p.itens.filter(i => i.preco_unit == null).length;
    y = tabela(doc, y, [
      { titulo: 'Item', largura: 125 }, { titulo: 'Pedido', largura: 22, direita: true }, { titulo: 'Conferido', largura: 24, direita: true },
      { titulo: 'Entregue', largura: 24, direita: true }, { titulo: 'Preço', largura: 36, direita: true }, { titulo: 'Valor', largura: 42, direita: true },
    ], p.itens.map(i => {
      const m = materiais.find(x => x.id === i.material_id);
      return [
        `${nomeMaterial(m, materiais)}${m?.unidade ? `  (${m.unidade})` : ''}`, formatarNumero(i.quantidade_pedida),
        { texto: formatarNumero(i.quantidade), negrito: true },
        i.quantidade_atendida == null ? { texto: '-', cor: CINZA } : { texto: formatarNumero(i.quantidade_atendida), cor: i.quantidade_atendida !== i.quantidade ? AMBAR : TEXTO },
        i.preco_unit == null ? { selo: 'SEM PREÇO', tipo: 'aviso' } : reais(i.preco_unit),
        i.preco_unit == null ? { texto: '-', cor: CINZA } : reais(i.quantidade * i.preco_unit),
      ] as Celula[];
    }), {
      cabecalhoClaro: true,
      total: [`Total do pedido${semPreco ? ` (${semPreco} item(ns) sem preço, fora da soma)` : ''}`, '', '', '', '', reais(p.valor_total)],
    });
    y += 3;
  }
  rodapes(doc);
  return entregar(doc, `pedidos-${posto.nome}-${mes}`, baixar);
}

// ---------- Todos os pedidos do mês ----------

export async function pdfPedidosDoMes(pedidos: PedidoCompleto[], postos: { id: string; nome: string; teto_material: number | null }[],
  materiais: Material[], mes: string, uf: string, baixar = true) {
  const { doc, logo: img } = await novoPdf();
  const nome = (id: string) => postos.find(p => p.id === id)?.nome ?? '-';
  let y = cabecalho(doc, img, 'Pedidos do mês', mesExtenso(mes), `${filtroTexto(uf)} · todos os pedidos feitos no mês`);
  const ordenados = [...pedidos].sort((a, b) => a.data_pedido.localeCompare(b.data_pedido) || a.codigo.localeCompare(b.codigo));
  const validos = ordenados.filter(p => p.status !== 'cancelada');
  const valor = validos.reduce((s, p) => s + p.valor_total, 0);
  const porPosto = [...new Set(validos.map(p => p.posto_id))].map(id => {
    const doPosto = validos.filter(p => p.posto_id === id);
    const g = doPosto.reduce((s, p) => s + p.valor_total, 0);
    const t = postos.find(x => x.id === id)?.teto_material ?? null;
    return { nome: nome(id), pedidos: doPosto.length, gasto: g, teto: t, pct: t != null && t > 0 ? Math.round((g / t) * 100) : null, passou: t != null && g > t };
  }).sort((a, b) => Number(b.passou) - Number(a.passou) || b.gasto - a.gasto);
  const atendidos = validos.filter(p => p.status === 'atendida').length;
  y = cartoes(doc, y, [
    { rotulo: 'Pedidos', valor: String(ordenados.length), detalhe: `${ordenados.length - validos.length} cancelado(s)` },
    { rotulo: 'Valor total', valor: reais(valor), detalhe: 'sem os cancelados' },
    { rotulo: 'Atendidos', valor: String(atendidos), detalhe: `${validos.length - atendidos} em andamento` },
    { rotulo: 'Postos acima do teto', valor: String(porPosto.filter(l => l.passou).length), tipo: porPosto.some(l => l.passou) ? 'alerta' : 'ok',
      detalhe: `${porPosto.length} posto(s) com pedido` },
  ]);
  y = tituloSecao(doc, y + 2, 'Pedidos', `${ordenados.length} pedido(s), em ordem de data`);
  y = tabela(doc, y + 1, [
    { titulo: 'Pedido', largura: 35 }, { titulo: 'Data', largura: 22 }, { titulo: 'Posto', largura: 48 }, { titulo: 'Solicitante', largura: 44 },
    { titulo: 'Itens', largura: 68 }, { titulo: 'Situação', largura: 28, centro: true }, { titulo: 'Valor', largura: 28, direita: true },
  ], ordenados.map(p => {
    const nomes = p.itens.map(i => `${formatarNumero(i.quantidade)} ${nomeMaterial(materiais.find(m => m.id === i.material_id), materiais)}`);
    const resumoItens = nomes[0] ? nomes[0] + (nomes.length > 1 ? ` e mais ${nomes.length - 1}` : '') : '';
    return [
      { texto: p.codigo, negrito: true }, dataBr(p.data_pedido), nome(p.posto_id), p.solicitante_nome,
      { texto: `${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'}: ${resumoItens}`, pequeno: true },
      { selo: STATUS_CURTO[p.status], tipo: SELO_STATUS[p.status] },
      { texto: reais(p.valor_total), negrito: p.status !== 'cancelada', cor: p.status === 'cancelada' ? CINZA : TEXTO },
    ] as Celula[];
  }), { total: [`Total (${validos.length} pedidos, sem cancelados)`, '', '', '', '', '', reais(valor)] });

  if (y + 40 > altura(doc) - 14) { doc.addPage(); y = TOPO_CONT + 4; } else y += 10;
  y = tituloSecao(doc, y, 'Total por posto', 'Gasto do mês contra o teto');
  tabela(doc, y + 1, [
    { titulo: 'Posto', largura: 90 }, { titulo: 'Pedidos', largura: 20, centro: true }, { titulo: 'Gasto', largura: 36, direita: true },
    { titulo: 'Teto', largura: 36, direita: true }, { titulo: 'Uso do teto', largura: 60 }, { titulo: 'Situação', largura: 31, centro: true },
  ], porPosto.map(l => [
    { texto: l.nome, negrito: true }, String(l.pedidos), { texto: reais(l.gasto), negrito: true, cor: l.passou ? VERMELHO : TEXTO },
    l.teto == null ? { texto: 'sem teto', cor: CINZA } : reais(l.teto), { barra: l.pct, alerta: l.passou },
    seloSituacao(l.teto, l.passou, l.pct),
  ] as Celula[]), { destaque: i => porPosto[i].passou });
  rodapes(doc);
  return entregar(doc, `pedidos-do-mes-${mes}${uf === 'todos' ? '' : `-${uf}`}`, baixar);
}

// ---------- Consumo do estoque do posto (diário, quinzenal, mensal) ----------

/** Barras simples do total usado em cada dia. */
function graficoDias(doc: JsPDF, y: number, dias: string[], valores: number[]) {
  const w = largura(doc) - 2 * M;
  const h = 32;
  const maior = Math.max(1, ...valores);
  const passo = w / dias.length;
  const bw = Math.min(8, passo * 0.62);
  traco(doc, BORDA); doc.setLineWidth(0.2);
  doc.line(M, y + h, M + w, y + h);
  dias.forEach((d, i) => {
    const v = valores[i];
    const x = M + i * passo + (passo - bw) / 2;
    if (v > 0) {
      const bh = (v / maior) * (h - 6);
      preencher(doc, AZUL); doc.roundedRect(x, y + h - bh, bw, bh, 0.8, 0.8, 'F');
      fonte(doc, 6.5, true, TEXTO);
      doc.text(formatarNumero(v), x + bw / 2, y + h - bh - 1, { align: 'center' });
    }
    fonte(doc, 6.5, false, CINZA);
    doc.text(d.slice(8, 10), x + bw / 2, y + h + 3.5, { align: 'center' });
  });
  return y + h + 7;
}

export interface DadosConsumo {
  posto: { nome: string; uf: string };
  tipo: 'dia' | 'quinzena' | 'mes';
  rotulo: string;
  dias: string[];
  doDia: { material_id: string; inicio: number; recebido: number; usado: number; final: number }[];
  periodo: {
    diasLancados: string[]; totalPorDia: number[];
    linhas: { material_id: string; porDia: number[]; total: number; mediaDia: number; diasComUso: number; pico: number; picoDia: string | null; recebido: number }[];
  };
  nome: (id: string) => string;
  unidade: (id: string) => string;
}

const media1 = (total: number, n: number) => formatarNumero(Math.round((total / Math.max(1, n)) * 10) / 10);

export async function pdfConsumo(d: DadosConsumo, baixar = true) {
  const { doc, logo: img } = await novoPdf();
  const titulo = d.tipo === 'dia' ? 'Consumo do dia' : d.tipo === 'quinzena' ? 'Consumo da quinzena' : 'Consumo do mês';
  let y = cabecalho(doc, img, titulo, d.rotulo, `${d.posto.nome} (${d.posto.uf}) · pelos lançamentos do estoque do posto`);
  const item = (id: string): Celula => ({ texto: d.nome(id), negrito: true });

  if (d.tipo === 'dia') {
    const usados = d.doDia.filter(l => l.usado > 0);
    const soma = (f: (l: DadosConsumo['doDia'][number]) => number) => formatarNumero(d.doDia.reduce((s, l) => s + f(l), 0));
    y = cartoes(doc, y, [
      { rotulo: 'Produtos usados', valor: String(usados.length), detalhe: `de ${d.doDia.length} lançados` },
      { rotulo: 'Total usado', valor: soma(l => l.usado), detalhe: 'todas as unidades somadas' },
      { rotulo: 'Recebido no dia', valor: soma(l => l.recebido), detalhe: 'todas as unidades somadas' },
      { rotulo: 'Zerados no fim', valor: String(d.doDia.filter(l => l.final === 0).length), tipo: d.doDia.some(l => l.final === 0) ? 'aviso' : 'ok', detalhe: 'itens que acabaram' },
    ]);
    y = tituloSecao(doc, y + 2, 'Movimento do dia', 'Iniciou + recebeu - usou = ficou');
    tabela(doc, y + 1, [
      { titulo: 'Item', largura: 125 }, { titulo: 'Unid.', largura: 20 }, { titulo: 'Iniciou com', largura: 32, direita: true },
      { titulo: 'Recebeu', largura: 32, direita: true }, { titulo: 'Usou', largura: 32, direita: true }, { titulo: 'Ficou', largura: 32, direita: true },
    ], d.doDia.map(l => [item(l.material_id), d.unidade(l.material_id), formatarNumero(l.inicio),
      l.recebido ? formatarNumero(l.recebido) : { texto: '-', cor: CINZA },
      { texto: formatarNumero(l.usado), negrito: l.usado > 0, cor: l.usado > 0 ? AZUL : CINZA },
      l.final === 0 ? { selo: 'ZERADO', tipo: 'aviso' } : formatarNumero(l.final)] as Celula[]), {
      total: ['Total (todas as unidades)', '', soma(l => l.inicio), soma(l => l.recebido), soma(l => l.usado), soma(l => l.final)],
    });
    rodapes(doc);
    return entregar(doc, `consumo-dia-${d.posto.nome}-${d.dias[0]}`, baixar);
  }

  const total = d.periodo.linhas.reduce((s, l) => s + l.total, 0);
  const maisUsado = d.periodo.linhas[0];
  const nLanc = d.periodo.diasLancados.length;
  y = cartoes(doc, y, [
    { rotulo: 'Dias com lançamento', valor: `${nLanc} de ${d.dias.length}`, detalhe: nLanc < d.dias.length ? `${d.dias.length - nLanc} dia(s) sem lançamento` : 'todos os dias lançados' },
    { rotulo: 'Produtos usados', valor: String(d.periodo.linhas.filter(l => l.total > 0).length) },
    { rotulo: 'Total usado', valor: formatarNumero(total), detalhe: `média ${media1(total, nLanc)} por dia (todas as unidades)` },
    { rotulo: 'Mais usado', valor: maisUsado ? `${formatarNumero(maisUsado.total)} ${d.unidade(maisUsado.material_id)}` : '-',
      detalhe: maisUsado ? (doc.splitTextToSize(d.nome(maisUsado.material_id), 55) as string[])[0] : undefined },
  ]);
  y = tituloSecao(doc, y + 2, 'Uso por dia', 'Soma do que foi usado no dia (todas as unidades)');
  y = graficoDias(doc, y + 3, d.dias, d.periodo.totalPorDia) + 2;
  if (y + 30 > altura(doc) - 14) { doc.addPage(); y = TOPO_CONT + 4; }

  if (d.tipo === 'quinzena') {
    y = tituloSecao(doc, y + 2, 'Usado por produto em cada dia');
    const col = (largura(doc) - 2 * M - 64 - 40) / d.dias.length;
    tabela(doc, y + 1, [
      { titulo: 'Item', largura: 64 },
      ...d.dias.map(x => ({ titulo: x.slice(8, 10), largura: col, centro: true })),
      { titulo: 'Total', largura: 20, direita: true }, { titulo: 'Média', largura: 20, direita: true },
    ], d.periodo.linhas.map(l => [
      { texto: d.nome(l.material_id), negrito: true, pequeno: true, cor: TEXTO },
      ...l.porDia.map(v => (v ? formatarNumero(v) : { texto: '·', cor: BORDA })),
      { texto: formatarNumero(l.total), negrito: true }, formatarNumero(l.mediaDia),
    ] as Celula[]), {
      total: ['Total do dia', ...d.periodo.totalPorDia.map(v => (v ? formatarNumero(v) : '-')), formatarNumero(total), media1(total, nLanc)],
    });
  } else {
    y = tituloSecao(doc, y + 2, 'Usado por produto no mês', 'Média = total ÷ dias com lançamento');
    tabela(doc, y + 1, [
      { titulo: 'Item', largura: 105 }, { titulo: 'Unid.', largura: 18 }, { titulo: 'Usado no mês', largura: 30, direita: true },
      { titulo: 'Média por dia', largura: 30, direita: true }, { titulo: 'Dias com uso', largura: 26, centro: true },
      { titulo: 'Maior uso', largura: 36, direita: true }, { titulo: 'Recebido', largura: 28, direita: true },
    ], d.periodo.linhas.map(l => [
      item(l.material_id), d.unidade(l.material_id), { texto: formatarNumero(l.total), negrito: true, cor: AZUL }, formatarNumero(l.mediaDia),
      String(l.diasComUso), l.picoDia ? `${formatarNumero(l.pico)} em ${l.picoDia.slice(8, 10)}/${l.picoDia.slice(5, 7)}` : '-',
      l.recebido ? formatarNumero(l.recebido) : { texto: '-', cor: CINZA },
    ] as Celula[]), {
      total: ['Total (todas as unidades)', '', formatarNumero(total), media1(total, nLanc), '', '', formatarNumero(d.periodo.linhas.reduce((s, l) => s + l.recebido, 0))],
    });
  }
  rodapes(doc);
  return entregar(doc, `consumo-${d.tipo}-${d.posto.nome}-${d.dias[0]}`, baixar);
}
