// Avisos por e-mail dos pedidos de material (função avisar-pedidos-material):
// cada etapa avisa quem tem o papel dela; pedido com EPI avisa os e-mails
// configurados. Puro: testado no vitest.

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
}
export interface ItemAviso { nome: string; quantidade: number; unidade: string; epi: boolean }

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

/**
 * Um aviso por pessoa (e-mail) com todos os pedidos que esperam por ela.
 * Pedidos sem ninguém com e-mail no papel ficam em `semDestinatario` (não
 * são marcados como avisados).
 */
export function agruparAvisos(pedidos: PedidoAviso[], aprovadores: AprovadorAviso[], usuarios: UsuarioAviso[]) {
  const porEmail = new Map<string, { email: string; nome: string; pedidos: PedidoAviso[] }>();
  const avisados: string[] = [];
  const semDestinatario: PedidoAviso[] = [];
  for (const p of pedidos) {
    const pessoas = aprovadores.filter(a => responsavelPor(a, p))
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
  const itens = p.itens.map((i, n) => `<tr style="background:${n % 2 ? '#f8fafc' : '#ffffff'}">
      <td style="${TD};font-size:13px;color:#0f172a">${esc(i.nome)}${i.epi ? selo('EPI', '#ffedd5', '#9a3412') : ''}</td>
      <td style="${TD};font-size:14px;font-weight:700;color:#0f172a;text-align:right;white-space:nowrap">${qtd(i.quantidade)}</td>
      <td style="${TD};font-size:12px;color:#64748b;white-space:nowrap">${esc(i.unidade)}</td></tr>`).join('');
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
        <tr style="background:#eff6ff"><th align="left" ${TH}>Item</th><th align="right" ${TH}>Qtd.</th><th align="left" ${TH}>Unid.</th></tr>
        ${itens || '<tr><td colspan="3" style="padding:8px 10px;color:#64748b;font-size:12px">Sem itens.</td></tr>'}
      </table>
      <p style="margin:6px 0 0;font-size:11px;color:#64748b">${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'}</p>
    </td></tr>
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
