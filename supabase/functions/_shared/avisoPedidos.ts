// Avisos por e-mail dos pedidos de material (função avisar-pedidos-material):
// cada etapa avisa quem tem o papel dela; pedido com EPI avisa os e-mails
// configurados; posto que passou do teto no mês avisa Comercial e Gerência.
// Puro: testado no vitest.

export interface PedidoAviso {
  id: string;
  codigo: string;
  posto_id: string;
  posto: string;
  uf: string;
  status: string;
  data_pedido: string;
  solicitante_nome: string;
  tem_epi: boolean;
  recorrente: boolean;
  itens: ItemAviso[];
  /** Soma de quantidade x preço (sem os itens sem preço). */
  valor_total?: number;
  /** Teto do posto e gasto dele no mês do pedido (aviso de teto). */
  teto?: { teto: number; gasto: number; mes: string };
}
/** `preco` = preço unitário do dia do pedido (null = sem preço). */
export interface ItemAviso { nome: string; quantidade: number; unidade: string; epi: boolean; preco?: number | null }

export interface AprovadorAviso { user_id: string; nivel: string; uf: string; postos: string[] }
export interface UsuarioAviso { id: string; nome: string; email: string | null }

/** Quem age em cada status (igual a _pm_responsaveis no banco). */
export const RESPONSAVEIS: Record<string, string[]> = { enviada: ['supervisor'], a_atender: ['compras'] };
const O_QUE_FAZER: Record<string, string> = { enviada: 'Conferir o material', a_atender: 'Atender' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A pessoa age na etapa atual do pedido? (mesma regra de _pm_tem_papel) */
export const responsavelPor = (a: AprovadorAviso, p: PedidoAviso) =>
  (RESPONSAVEIS[p.status] ?? []).includes(a.nivel) && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id));

/** Quem recebe o aviso de teto: Comercial e Gerência do estado (e do posto, se a pessoa tem postos marcados). */
export const PAPEIS_TETO = ['comercial', 'gerencia'];
export const avisaTeto = (a: AprovadorAviso, p: PedidoAviso) =>
  PAPEIS_TETO.includes(a.nivel) && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id));

/** Passou do teto: gasto do posto no mês maior que o teto. */
export const passouTeto = (teto: number | null | undefined, gasto: number) => teto != null && teto >= 0 && gasto > teto;

/**
 * Um aviso por pessoa (e-mail) com todos os pedidos que esperam por ela.
 * Pedidos sem ninguém com e-mail no papel ficam em `semDestinatario` (não
 * são marcados como avisados).
 */
export function agruparAvisos(pedidos: PedidoAviso[], aprovadores: AprovadorAviso[], usuarios: UsuarioAviso[],
  quem: (a: AprovadorAviso, p: PedidoAviso) => boolean = responsavelPor) {
  const porEmail = new Map<string, { email: string; nome: string; pedidos: PedidoAviso[] }>();
  const avisados: string[] = [];
  const semDestinatario: PedidoAviso[] = [];
  for (const p of pedidos) {
    const pessoas = aprovadores.filter(a => quem(a, p))
      .map(a => usuarios.find(u => u.id === a.user_id))
      .filter((u): u is UsuarioAviso => !!u?.email && EMAIL.test(u.email.trim()));
    if (pessoas.length === 0) { semDestinatario.push(p); continue; }
    avisados.push(p.id);
    for (const u of pessoas) {
      const email = u.email!.trim().toLowerCase();
      if (!porEmail.has(email)) porEmail.set(email, { email, nome: u.nome, pedidos: [] });
      const grupo = porEmail.get(email)!;
      if (!grupo.pedidos.some(x => x.id === p.id)) grupo.pedidos.push(p);
    }
  }
  return { avisos: [...porEmail.values()], avisados, semDestinatario };
}

// ---------- E-mails (HTML só com tabelas e estilo na linha: funciona no Outlook) ----------
const AZUL = '#1d4ed8';
const ETAPA: Record<string, { rotulo: string; acao: string; fundo: string; cor: string }> = {
  enviada: { rotulo: 'Conferir o material', acao: 'Conferir este pedido', fundo: '#fef3c7', cor: '#92400e' },
  a_atender: { rotulo: 'Atender', acao: 'Atender este pedido', fundo: '#dcfce7', cor: '#166534' },
};
const qtd = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export const reais = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesBr = (iso: string) => {
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${nomes[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
};
const base = (link: string | null) => (link ? esc(link.replace(/\/+$/, '')) : null);
const selo = (texto: string, fundo: string, cor: string) =>
  `<span style="display:inline-block;background:${fundo};color:${cor};font-size:11px;font-weight:700;padding:3px 8px;border-radius:10px;margin-left:6px">${esc(texto)}</span>`;
const botao = (href: string, texto: string, cheio = true) =>
  `<a href="${href}" style="display:inline-block;background:${cheio ? AZUL : '#ffffff'};color:${cheio ? '#ffffff' : AZUL};border:1px solid ${AZUL};padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px">${esc(texto)}</a>`;
const TH = `style="padding:7px 10px;font-size:11px;color:${AZUL};text-transform:uppercase;letter-spacing:.5px"`;
const TD = 'padding:7px 10px;border-top:1px solid #e2e8f0';

/** Cartão de um pedido: código e etapa, quem pediu e a tabela de itens com as quantidades. */
function cartao(p: PedidoAviso, link: string | null, comAcao: boolean) {
  const etapa = ETAPA[p.status];
  const comValor = p.itens.some(i => i.preco != null);
  const semPreco = p.itens.filter(i => i.preco == null).length;
  const itens = p.itens.map((i, n) => `<tr style="background:${n % 2 ? '#f8fafc' : '#ffffff'}">
      <td style="${TD};font-size:13px;color:#0f172a">${esc(i.nome)}${i.epi ? selo('EPI', '#ffedd5', '#9a3412') : ''}</td>
      <td style="${TD};font-size:14px;font-weight:700;color:#0f172a;text-align:right;white-space:nowrap">${qtd(i.quantidade)}</td>
      <td style="${TD};font-size:12px;color:#64748b;white-space:nowrap">${esc(i.unidade)}</td>${comValor ? `
      <td style="${TD};font-size:12px;color:#475569;text-align:right;white-space:nowrap">${i.preco != null ? reais(i.preco) : '—'}</td>
      <td style="${TD};font-size:13px;color:#0f172a;text-align:right;white-space:nowrap">${i.preco != null ? reais(i.preco * i.quantidade) : '<span style="color:#b45309">sem preço</span>'}</td>` : ''}</tr>`).join('');
  const total = comValor
    ? `<tr style="background:#eff6ff"><td colspan="4" style="${TD};font-size:12px;font-weight:700;color:${AZUL};text-align:right;text-transform:uppercase">Total do pedido</td>
        <td style="${TD};font-size:15px;font-weight:800;color:#0f172a;text-align:right;white-space:nowrap">${reais(p.valor_total ?? 0)}</td></tr>`
    : '';
  const teto = p.teto ? (() => {
    const pct = p.teto.teto > 0 ? Math.round((p.teto.gasto / p.teto.teto) * 100) : null;
    return `<tr><td style="padding:0 16px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;border-collapse:separate">
        <tr><td style="padding:10px 12px;font-size:13px;color:#991b1b">
          <b>Teto do posto ultrapassado em ${mesBr(p.teto.mes)}</b><br>
          Gasto no mês: <b>${reais(p.teto.gasto)}</b> de <b>${reais(p.teto.teto)}</b>${pct != null ? ` (${pct}%)` : ''} · passou <b>${reais(p.teto.gasto - p.teto.teto)}</b>
        </td></tr></table></td></tr>`;
  })() : '';
  const b = base(link);
  const acao = comAcao && b && etapa
    ? `<tr><td style="padding:12px 16px 16px">${botao(`${b}/pedidos?pedido=${encodeURIComponent(p.id)}`, etapa.acao)}</td></tr>`
    : '<tr><td style="padding:0 0 12px"></td></tr>';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #cbd5e1;border-radius:8px;margin:0 0 16px;background:#ffffff;border-collapse:separate">
    <tr><td style="padding:14px 16px 4px">
      <span style="font-size:16px;font-weight:700;color:#0f172a">${esc(p.codigo)}</span>${etapa && comAcao ? selo(etapa.rotulo, etapa.fundo, etapa.cor) : ''}${p.recorrente ? selo('Recorrente', '#e0e7ff', '#3730a3') : ''}${p.tem_epi ? selo('Tem EPI', '#ffedd5', '#9a3412') : ''}
    </td></tr>
    <tr><td style="padding:0 16px 10px;font-size:12px;color:#475569">
      <b style="color:#0f172a">${esc(p.posto)}</b> (${esc(p.uf)}) · pedido em ${dataBr(p.data_pedido)} por ${esc(p.solicitante_nome)}
    </td></tr>
    <tr><td style="padding:0 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-collapse:collapse">
        <tr style="background:#eff6ff"><th align="left" ${TH}>Item</th><th align="right" ${TH}>Qtd.</th><th align="left" ${TH}>Unid.</th>${comValor ? `<th align="right" ${TH}>Preço</th><th align="right" ${TH}>Valor</th>` : ''}</tr>
        ${itens || '<tr><td colspan="5" style="padding:8px 10px;color:#64748b;font-size:12px">Sem itens.</td></tr>'}
        ${total}
      </table>
      <p style="margin:6px 0 0;font-size:11px;color:#64748b">${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'}${comValor && semPreco ? ` · ${semPreco} sem preço (fora do total)` : ''}</p>
    </td></tr>
    ${teto ? `<tr><td style="height:10px"></td></tr>${teto}` : ''}
    ${acao}
  </table>`;
}

/** Moldura do e-mail: faixa colorida no topo, conteúdo e rodapé. */
function moldura(titulo: string, intro: string, corpo: string, link: string | null, motivo: string, cor = AZUL) {
  const b = base(link);
  const final = b
    ? `<p style="margin:4px 0 0">${botao(`${b}/pedidos`, 'Abrir todos os pedidos', false)}</p>`
    : '<p style="margin:4px 0 0;font-size:13px">Abra o sistema em <b>Pedidos de Material → Pedidos → Minhas tarefas</b>.</p>';
  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;border-collapse:separate">
    <tr><td style="background:${cor};padding:18px 24px;border-radius:10px 10px 0 0">
      <div style="font-size:11px;color:#ffffff;opacity:.85;letter-spacing:1px;text-transform:uppercase">Pedidos de material · Grupo 5 Estrelas</div>
      <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px">${esc(titulo)}</div>
    </td></tr>
    <tr><td style="padding:20px 24px 8px;font-size:14px">${intro}</td></tr>
    <tr><td style="padding:8px 24px 0">${corpo}</td></tr>
    <tr><td style="padding:0 24px 20px">${final}</td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas. ${esc(motivo)}</td></tr>
  </table></div>`;
}

export function montarEmailAviso(nome: string, pedidos: PedidoAviso[], link: string | null) {
  const ordenados = [...pedidos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const n = ordenados.length;
  const intro = `Olá, ${esc(nome.split(' ')[0] || nome)}. ${n === 1 ? '<strong>1</strong> pedido chegou' : `<strong>${n}</strong> pedidos chegaram`} à sua etapa.`;
  const html = moldura(n === 1 ? 'Pedido de material esperando por você' : 'Pedidos de material esperando por você', intro,
    ordenados.map(p => cartao(p, link, true)).join(''), link,
    'Você recebe este aviso porque tem um papel em Configurações de Pedidos > Papéis.');
  const assunto = n === 1 ? `Pedido ${ordenados[0].codigo} esperando por você — ${ordenados[0].posto}` : `${n} pedidos de material esperando por você`;
  return { assunto, html };
}

export function montarEmailEpi(pedidos: PedidoAviso[], link: string | null) {
  const n = pedidos.length;
  const intro = `${n === 1 ? '<strong>1</strong> pedido novo inclui' : `<strong>${n}</strong> pedidos novos incluem`} item marcado como EPI.`;
  const html = moldura('Pedido com item de EPI', intro, pedidos.map(p => cartao(p, link, false)).join(''), link,
    'Você recebe este aviso porque está na lista de EPI em Configurações de Pedidos > Avisos.', '#b45309');
  return { assunto: `EPI pedido no material de limpeza: ${pedidos.map(p => p.codigo).join(', ')}`, html };
}

/** Posto passou do teto no mês: Comercial e Gerência recebem os pedidos que fizeram passar. */
export function montarEmailTeto(nome: string, pedidos: PedidoAviso[], link: string | null) {
  const ordenados = [...pedidos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const postos = [...new Set(ordenados.map(p => p.posto))];
  const intro = `Olá, ${esc(nome.split(' ')[0] || nome)}. ${postos.length === 1
    ? `O posto <strong>${esc(postos[0])}</strong> passou do teto de gasto do mês.`
    : `<strong>${postos.length}</strong> postos passaram do teto de gasto do mês.`} O pedido segue normalmente; este é só o aviso.`;
  const html = moldura('Teto de gasto ultrapassado', intro, ordenados.map(p => cartao(p, link, false)).join(''), link,
    'Você recebe este aviso porque é Comercial ou Gerência em Configurações de Pedidos > Papéis.', '#b91c1c');
  const assunto = postos.length === 1 ? `Teto ultrapassado: ${postos[0]} (${ordenados.map(p => p.codigo).join(', ')})` : `Teto ultrapassado em ${postos.length} postos`;
  return { assunto, html };
}
