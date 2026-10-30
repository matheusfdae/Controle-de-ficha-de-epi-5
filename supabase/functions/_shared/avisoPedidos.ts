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
  valor: number;
  excede_teto: boolean;
  sem_preco: boolean;
  tem_epi: boolean;
  recorrente: boolean;
  itens: string;
}

export interface AprovadorAviso { user_id: string; nivel: string; uf: string; postos: string[] }
export interface UsuarioAviso { id: string; nome: string; email: string | null }

/** Quem age em cada status (igual a _pm_responsaveis no banco). */
export const RESPONSAVEIS: Record<string, string[]> = {
  enviada: ['supervisor'], em_orcamento: ['compras'], aguardando_aprovacao: ['comercial', 'gerencia'], a_faturar: ['compras'],
};
const O_QUE_FAZER: Record<string, string> = {
  enviada: 'Conferir o material',
  em_orcamento: 'Orçar',
  aguardando_aprovacao: 'Aprovar o excesso de teto',
  a_faturar: 'Faturar',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
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

const TH = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
const rodape = (motivo: string) => `<p style="color:#64748b;font-size:11px;margin-top:16px">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas. ${motivo}</p>`;
const botao = (link: string | null) => link
  ? `<p style="margin:16px 0"><a href="${esc(link.replace(/\/+$/, ''))}/pedidos" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Abrir os pedidos</a></p>`
  : '<p style="margin:16px 0">Abra o sistema em <b>Pedidos de Material → Pedidos → Minhas tarefas</b>.</p>';

export function montarEmailAviso(nome: string, pedidos: PedidoAviso[], link: string | null) {
  const ordenados = [...pedidos].sort((a, b) => Number(b.excede_teto) - Number(a.excede_teto) || a.codigo.localeCompare(b.codigo));
  const excesso = pedidos.filter(p => p.status === 'aguardando_aprovacao').length;
  const linhas = ordenados.map(p => `<tr>
      <td><b>${esc(p.codigo)}</b>${p.recorrente ? ' <span style="color:#64748b">(recorrente)</span>' : ''}</td>
      <td style="font-weight:600">${esc(O_QUE_FAZER[p.status] ?? p.status)}</td>
      <td>${esc(p.posto)} (${esc(p.uf)})</td><td>${esc(p.solicitante_nome)}</td><td>${dataBr(p.data_pedido)}</td>
      <td>${esc(p.itens)}</td>
      <td style="text-align:right;white-space:nowrap">${moeda(Number(p.valor))}${p.sem_preco ? '<br><span style="color:#b45309;font-size:11px">item fora da tabela</span>' : ''}</td>
      <td>${p.excede_teto ? '<span style="color:#b91c1c;font-weight:600">Excede o teto</span>' : ''}${p.tem_epi ? ' <span style="color:#b45309">EPI</span>' : ''}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Pedidos de material esperando por você</h2>
    <p style="margin:0 0 12px">Olá, ${esc(nome.split(' ')[0] || nome)}. <strong>${pedidos.length}</strong> pedido(s) chegaram à sua etapa${excesso ? `; <span style="color:#b91c1c;font-weight:600">${excesso} com excesso de teto para aprovar</span>` : ''}.</p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${TH}>Pedido</th><th ${TH}>O que fazer</th><th ${TH}>Posto</th><th ${TH}>Encarregado</th><th ${TH}>Data</th>
        <th ${TH}>Itens</th><th ${TH}>Valor</th><th ${TH}></th></tr></thead>
      <tbody>${linhas}</tbody></table>
    ${botao(link)}
    ${rodape('Você recebe este aviso porque tem um papel em Configurações de Pedidos > Papéis.')}
  </div>`;
  return { assunto: `${pedidos.length} pedido(s) de material esperando por você${excesso ? ` (${excesso} com excesso de teto)` : ''}`, html };
}

export function montarEmailEpi(pedidos: PedidoAviso[], link: string | null) {
  const linhas = pedidos.map(p => `<tr><td><b>${esc(p.codigo)}</b></td><td>${esc(p.posto)} (${esc(p.uf)})</td>
      <td>${esc(p.solicitante_nome)}</td><td>${dataBr(p.data_pedido)}</td><td>${esc(p.itens)}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#b45309;margin:0 0 6px">Pedido de material com item de EPI</h2>
    <p style="margin:0 0 12px"><strong>${pedidos.length}</strong> pedido(s) novo(s) incluem item marcado como EPI.</p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${TH}>Pedido</th><th ${TH}>Posto</th><th ${TH}>Encarregado</th><th ${TH}>Data</th><th ${TH}>Itens</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    ${botao(link)}
    ${rodape('Você recebe este aviso porque está na lista de EPI em Configurações de Pedidos > Avisos.')}
  </div>`;
  return { assunto: `EPI pedido no material de limpeza: ${pedidos.map(p => p.codigo).join(', ')}`, html };
}
