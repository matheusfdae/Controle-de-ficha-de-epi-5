// Aviso por e-mail aos aprovadores dos pedidos de material que chegaram ao
// nível deles (função avisar-pedidos-material). Puro: testado no vitest.

export interface PedidoAviso {
  id: string;
  numero: number;
  posto_id: string;
  posto: string;
  uf: string;
  nivel_atual: string;
  data_pedido: string;
  solicitante_nome: string;
  valor_estimado: number;
  acima_do_teto: boolean;
  sem_preco: boolean;
  recorrente: boolean;
  itens: string;
}

export interface AprovadorAviso { user_id: string; nivel: string; uf: string; postos: string[] }
export interface UsuarioAviso { id: string; nome: string; email: string | null }

const NIVEL: Record<string, string> = { supervisor: 'Supervisor', gerente: 'Gerente', diretor: 'Diretor', compras: 'Compras' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const numeroPedido = (n: number) => `PM-${String(n).padStart(6, '0')}`;
const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Quem aprova o nível atual do pedido (mesma regra de _pm_e_aprovador). */
export const aprovaPedido = (a: AprovadorAviso, p: PedidoAviso) =>
  a.nivel === p.nivel_atual && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id));

/**
 * Um aviso por pessoa (e-mail) com todos os pedidos dela. Pedidos sem nenhum
 * aprovador com e-mail ficam em `semAprovador` (não são marcados como avisados).
 */
export function agruparAvisos(pedidos: PedidoAviso[], aprovadores: AprovadorAviso[], usuarios: UsuarioAviso[]) {
  const porEmail = new Map<string, { email: string; nome: string; pedidos: PedidoAviso[] }>();
  const avisados: string[] = [];
  const semAprovador: PedidoAviso[] = [];
  for (const p of pedidos) {
    const pessoas = aprovadores.filter(a => aprovaPedido(a, p))
      .map(a => usuarios.find(u => u.id === a.user_id))
      .filter((u): u is UsuarioAviso => !!u?.email && EMAIL.test(u.email.trim()));
    if (pessoas.length === 0) { semAprovador.push(p); continue; }
    avisados.push(p.id);
    for (const u of pessoas) {
      const email = u.email!.trim().toLowerCase();
      if (!porEmail.has(email)) porEmail.set(email, { email, nome: u.nome, pedidos: [] });
      const grupo = porEmail.get(email)!;
      if (!grupo.pedidos.some(x => x.id === p.id)) grupo.pedidos.push(p);
    }
  }
  return { avisos: [...porEmail.values()], avisados, semAprovador };
}

export function montarEmailAviso(nome: string, pedidos: PedidoAviso[], link: string | null) {
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const ordenados = [...pedidos].sort((a, b) => Number(b.acima_do_teto) - Number(a.acima_do_teto) || a.numero - b.numero);
  const acima = pedidos.filter(p => p.acima_do_teto).length;
  const total = pedidos.reduce((s, p) => s + Number(p.valor_estimado), 0);
  const linhas = ordenados.map(p => `<tr>
      <td><b>${numeroPedido(p.numero)}</b>${p.recorrente ? ' <span style="color:#64748b">(recorrente)</span>' : ''}</td>
      <td>${esc(NIVEL[p.nivel_atual] ?? p.nivel_atual)}</td>
      <td>${esc(p.posto)} (${esc(p.uf)})</td><td>${esc(p.solicitante_nome)}</td><td>${dataBr(p.data_pedido)}</td>
      <td>${esc(p.itens)}</td>
      <td style="text-align:right;white-space:nowrap">${moeda(Number(p.valor_estimado))}${p.sem_preco ? '<br><span style="color:#b45309;font-size:11px">item sem preço</span>' : ''}</td>
      <td>${p.acima_do_teto ? '<span style="color:#b91c1c;font-weight:600">Acima do teto — exige justificativa</span>' : ''}</td></tr>`).join('');
  const botao = link
    ? `<p style="margin:16px 0"><a href="${esc(link.replace(/\/+$/, ''))}/pedidos" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Abrir os pedidos</a></p>`
    : '<p style="margin:16px 0">Abra o sistema em <b>Pedidos de Material → Pedidos → Minha aprovação</b>.</p>';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Pedidos de material esperando a sua aprovação</h2>
    <p style="margin:0 0 12px">Olá, ${esc(nome.split(' ')[0] || nome)}. <strong>${pedidos.length}</strong> pedido(s) chegaram para você
      (total estimado ${moeda(total)})${acima ? `; <span style="color:#b91c1c;font-weight:600">${acima} acima do teto do posto</span>` : ''}.</p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>Pedido</th><th ${th}>Seu nível</th><th ${th}>Posto</th><th ${th}>Solicitante</th><th ${th}>Data</th>
        <th ${th}>Itens</th><th ${th}>Valor estimado</th><th ${th}></th></tr></thead>
      <tbody>${linhas}</tbody></table>
    ${botao}
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas.
      Você recebe este aviso porque está cadastrado como aprovador em Configurações de Pedidos.</p>
  </div>`;
  return {
    assunto: `${pedidos.length} pedido(s) de material para aprovar${acima ? ` (${acima} acima do teto)` : ''}`,
    html,
  };
}
