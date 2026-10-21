// deno-lint-ignore-file
// Monta o relatório de estoque por e-mail (HTML + planilha Excel).
// Mesma regra da tela Estoque, por item e por estado: saldo 0 = "Sem estoque",
// saldo <= mínimo do item no estado = "Crítico", senão "OK". O mínimo do
// estado (estoque_minimos) vale sobre o mínimo geral do item (epis.estoque_minimo). Sem dependências: usado pela
// Edge Function enviar-relatorio-estoque e, no localhost, pelo vite.config.ts.
import { dataBrasilia, formatarData } from './convocacaoUniforme.ts';
import { base64, gerarXlsx } from './xlsx.ts';

export interface ItemEstoque {
  id: string; nome: string; codigo: string | null; ca_numero: string | null;
  tipo: string; estoque_minimo: number; ativo: boolean;
}
export interface TamanhoEstoque { epi_id: string; uf: string; tamanho: string; estoque: number; estoque_minimo: number }
export interface MinimoEstoque { epi_id: string; uf: string; minimo: number }
export type Situacao = 'Sem estoque' | 'Crítico' | 'OK';

export interface LinhaItem {
  uf: string; item: ItemEstoque; saldo: number; minimo: number; situacao: Situacao;
  tamanhos: { tamanho: string; estoque: number; minimo: number }[];
}

const ORDEM: Record<Situacao, number> = { 'Sem estoque': 0, 'Crítico': 1, 'OK': 2 };

/**
 * Estados do relatório: os pedidos, ou (lista vazia) os que têm algum estoque
 * cadastrado — para não listar o catálogo inteiro como "sem estoque" num estado
 * que ainda não usa o sistema.
 */
export function estadosDoRelatorio(pedidos: string[], tamanhos: TamanhoEstoque[]): string[] {
  if (pedidos.length) return [...pedidos].sort();
  return [...new Set(tamanhos.map(t => t.uf))].sort();
}

/** Mínimo do item no estado: o definido para o estado ou, sem ele, o mínimo geral do item. */
export function minimoDoItem(item: ItemEstoque, uf: string, minimos: MinimoEstoque[] = []): number {
  return minimos.find(m => m.epi_id === item.id && m.uf === uf)?.minimo ?? item.estoque_minimo ?? 0;
}

/** Saldo e situação de cada item ativo, por estado (igual à tela Estoque). */
export function calcularEstoque(itens: ItemEstoque[], tamanhos: TamanhoEstoque[], ufs: string[], minimos: MinimoEstoque[] = []): LinhaItem[] {
  const linhas: LinhaItem[] = [];
  for (const uf of ufs) {
    for (const item of itens.filter(i => i.ativo)) {
      const tams = tamanhos.filter(t => t.epi_id === item.id && t.uf === uf)
        .sort((a, b) => a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true }));
      const saldo = tams.reduce((s, t) => s + (t.estoque ?? 0), 0);
      const minimo = minimoDoItem(item, uf, minimos);
      const situacao: Situacao = saldo === 0 ? 'Sem estoque' : saldo <= minimo ? 'Crítico' : 'OK';
      linhas.push({ uf, item, saldo, minimo, situacao, tamanhos: tams.map(t => ({ tamanho: t.tamanho, estoque: t.estoque, minimo: t.estoque_minimo ?? 0 })) });
    }
  }
  return linhas.sort((a, b) => a.uf.localeCompare(b.uf) || ORDEM[a.situacao] - ORDEM[b.situacao]
    || a.item.tipo.localeCompare(b.item.tipo) || a.item.nome.localeCompare(b.item.nome, 'pt-BR'));
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const tipoTexto = (t: string) => (t === 'uniforme' ? 'Uniforme' : 'EPI');
const MAX_LINHAS_EMAIL = 150;

export function montarEmailEstoque(linhas: LinhaItem[], ufs: string[]) {
  const hoje = dataBrasilia(new Date());
  const alerta = linhas.filter(l => l.situacao !== 'OK');
  const resumo = ufs.map(uf => {
    const doUf = linhas.filter(l => l.uf === uf);
    const sem = doUf.filter(l => l.situacao === 'Sem estoque').length;
    const crit = doUf.filter(l => l.situacao === 'Crítico').length;
    const pecas = doUf.reduce((s, l) => s + l.saldo, 0);
    return `<tr><td><b>${esc(uf)}</b></td><td>${doUf.length}</td><td>${pecas}</td>
      <td style="color:#b91c1c;font-weight:600">${sem}</td><td style="color:#b45309;font-weight:600">${crit}</td></tr>`;
  }).join('');
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const linhasAlerta = alerta.slice(0, MAX_LINHAS_EMAIL).map(l => `<tr>
      <td>${esc(l.uf)}</td><td>${tipoTexto(l.item.tipo)}</td><td>${esc(l.item.nome)}</td>
      <td style="text-align:right">${l.saldo}</td><td style="text-align:right">${l.minimo}</td>
      <td style="color:${l.situacao === 'Sem estoque' ? '#b91c1c' : '#b45309'};font-weight:600">${l.situacao}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Relatório de estoque</h2>
    <p style="margin:0 0 12px">${formatarData(hoje)} · Estados: ${esc(ufs.join(', ') || '—')} ·
      <strong>${alerta.length}</strong> item(ns) precisando de atenção (sem estoque ou abaixo do mínimo).</p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px;margin-bottom:16px">
      <thead><tr><th ${th}>Estado</th><th ${th}>Itens</th><th ${th}>Peças em estoque</th><th ${th}>Sem estoque</th><th ${th}>Crítico</th></tr></thead>
      <tbody>${resumo}</tbody></table>
    ${alerta.length === 0 ? '<p>Nenhum item sem estoque ou abaixo do mínimo.</p>' : `
    <p style="margin:0 0 6px"><b>Itens que precisam de atenção</b></p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>UF</th><th ${th}>Tipo</th><th ${th}>Item</th><th ${th}>Saldo</th><th ${th}>Mínimo</th><th ${th}>Situação</th></tr></thead>
      <tbody>${linhasAlerta}</tbody></table>
    ${alerta.length > MAX_LINHAS_EMAIL ? `<p>… e mais ${alerta.length - MAX_LINHAS_EMAIL} item(ns) — veja a planilha.</p>` : ''}`}
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas.
      A planilha em anexo traz o estoque completo, por tamanho. Crítico = saldo igual ou abaixo do mínimo do item no estado.</p>
  </div>`;

  // Planilha: uma linha por tamanho (ou uma linha "—" para o item sem estoque cadastrado).
  const planilha: (string | number)[][] = [];
  for (const l of linhas) {
    const base = [l.uf, tipoTexto(l.item.tipo), l.item.nome, l.item.codigo ?? '', l.item.ca_numero ?? ''];
    const fim = [l.saldo, l.minimo, l.situacao];
    if (!l.tamanhos.length) planilha.push([...base, '—', 0, 0, ...fim]);
    for (const t of l.tamanhos) planilha.push([...base, t.tamanho, t.estoque, t.minimo, ...fim]);
  }
  const xlsx = gerarXlsx('Estoque',
    ['UF', 'Tipo', 'Item', 'Código', 'C.A.', 'Tamanho', 'Saldo do tamanho', 'Mínimo do tamanho',
      'Saldo do item no estado', 'Mínimo do item no estado', 'Situação do item'],
    planilha, [6, 10, 40, 12, 10, 10, 10, 10, 12, 10, 14]);
  return {
    assunto: `Relatório de estoque — ${formatarData(hoje)}${alerta.length ? ` — ${alerta.length} item(ns) em alerta` : ''}`,
    html,
    anexo: {
      nome: `estoque-${hoje}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: base64(xlsx),
    },
    alerta: alerta.length,
    itens: linhas.length,
  };
}

/** Pedido de reposição: itens cujo saldo no estado chegou ao mínimo (fila alertas_estoque). */
export function montarEmailReposicao(linhas: LinhaItem[]) {
  const hoje = dataBrasilia(new Date());
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const corpo = linhas.map(l => {
    const tams = l.tamanhos.length ? l.tamanhos.map(t => `${esc(t.tamanho)}: ${t.estoque}`).join(' · ') : '—';
    const falta = Math.max(l.minimo - l.saldo, 0);
    return `<tr>
      <td>${esc(l.uf)}</td><td>${tipoTexto(l.item.tipo)}</td><td>${esc(l.item.nome)}</td>
      <td>${esc(l.item.codigo ?? '')}</td><td>${esc(l.item.ca_numero ?? '')}</td>
      <td style="text-align:right;font-weight:600;color:${l.saldo === 0 ? '#b91c1c' : '#b45309'}">${l.saldo}</td>
      <td style="text-align:right">${l.minimo}</td><td style="text-align:right">${falta}</td><td>${tams}</td></tr>`;
  }).join('');
  const ufs = [...new Set(linhas.map(l => l.uf))].sort();
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#b91c1c;margin:0 0 6px">Pedido de reposição de estoque</h2>
    <p style="margin:0 0 12px">${formatarData(hoje)} · ${linhas.length} item(ns) chegaram ao estoque mínimo
      (${esc(ufs.join(', '))}). Por favor, providenciar a reposição.</p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>UF</th><th ${th}>Tipo</th><th ${th}>Item</th><th ${th}>Código</th><th ${th}>C.A.</th>
        <th ${th}>Saldo</th><th ${th}>Mínimo</th><th ${th}>Falta p/ o mínimo</th><th ${th}>Saldo por tamanho</th></tr></thead>
      <tbody>${corpo}</tbody></table>
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado automaticamente pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas,
      quando o saldo do item no estado chega ao estoque mínimo definido na tela Estoque.</p>
  </div>`;
  const nomes = linhas.slice(0, 2).map(l => l.item.nome).join(', ');
  return {
    assunto: `Pedido de reposição — ${linhas.length === 1 ? `${linhas[0].item.nome} (${linhas[0].uf})` : `${linhas.length} itens: ${nomes}${linhas.length > 2 ? '…' : ''}`}`,
    html,
  };
}
