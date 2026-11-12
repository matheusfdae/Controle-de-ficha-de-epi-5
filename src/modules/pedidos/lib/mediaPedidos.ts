/**
 * Média dos últimos 3 pedidos do posto (antes do pedido aberto, sem os cancelados):
 * por item, a quantidade média por pedido (pedido sem o item conta 0) e o valor
 * médio do pedido. Serve para o supervisor/compras ver se o pedido foge do normal.
 */

export interface PedidoAnterior {
  id: string; codigo: string; data_pedido: string; status: string; valor_total: number;
  itens: { material_id: string; quantidade: number; quantidade_atendida: number | null; quantidade_pedida: number }[];
}
export interface MediaItem { media: number; valores: { codigo: string; data: string; quantidade: number }[] }
export interface MediaUltimos { pedidos: number; valorMedio: number | null; porItem: Map<string, MediaItem> }

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Quantidade que conta de cada pedido: a entregue se já foi atendido; senão a conferida. */
const quantidadeQueConta = (p: PedidoAnterior, i: PedidoAnterior['itens'][number]) =>
  p.status === 'atendida' && i.quantidade_atendida != null ? i.quantidade_atendida : i.quantidade;

export function mediaUltimos(pedidos: PedidoAnterior[]): MediaUltimos {
  const n = pedidos.length;
  const porItem = new Map<string, MediaItem>();
  const ids = new Set(pedidos.flatMap(p => p.itens.map(i => i.material_id)));
  for (const id of ids) {
    const valores = pedidos.map(p => {
      const q = p.itens.filter(i => i.material_id === id).reduce((s, i) => s + quantidadeQueConta(p, i), 0);
      return { codigo: p.codigo, data: p.data_pedido, quantidade: r2(q) };
    });
    porItem.set(id, { media: r2(valores.reduce((s, v) => s + v.quantidade, 0) / n), valores });
  }
  return { pedidos: n, valorMedio: n ? r2(pedidos.reduce((s, p) => s + (p.valor_total ?? 0), 0) / n) : null, porItem };
}

/** Quantidade bem acima do normal: mais de 50% acima da média (ou item que não vinha sendo pedido). */
export function acimaDaMedia(quantidade: number, media: number | undefined): boolean {
  if (media == null) return false;
  return media === 0 ? quantidade > 0 : quantidade > media * 1.5;
}

// ---------- Comparação com o pedido anterior do posto ----------

export interface Comparacao {
  anterior: { codigo: string; data: string };
  /** Por item deste pedido: quanto foi pedido no anterior (0 = não estava) e a diferença. */
  porItem: Map<string, { antes: number; agora: number; dif: number; novo: boolean }>;
  /** Itens que estavam no anterior e não estão neste. */
  sairam: { material_id: string; antes: number }[];
  iguais: number; aumentaram: number; diminuiram: number; novos: number;
  totalAntes: number; totalAgora: number;
}

/** Compara a quantidade PEDIDA deste pedido com a do pedido anterior do mesmo posto. */
export function compararComAnterior(itens: { material_id: string; quantidade_pedida: number }[], anterior: PedidoAnterior | undefined): Comparacao | null {
  if (!anterior) return null;
  const somar = (lista: { material_id: string; quantidade_pedida: number }[]) => {
    const m = new Map<string, number>();
    for (const i of lista) m.set(i.material_id, r2((m.get(i.material_id) ?? 0) + Number(i.quantidade_pedida)));
    return m;
  };
  const antes = somar(anterior.itens);
  const agora = somar(itens);
  const porItem = new Map<string, { antes: number; agora: number; dif: number; novo: boolean }>();
  let iguais = 0, aumentaram = 0, diminuiram = 0, novos = 0;
  for (const [id, q] of agora) {
    const a = antes.get(id);
    const dif = r2(q - (a ?? 0));
    porItem.set(id, { antes: a ?? 0, agora: q, dif, novo: a == null });
    if (a == null) novos++; else if (dif > 0) aumentaram++; else if (dif < 0) diminuiram++; else iguais++;
  }
  const sairam = [...antes].filter(([id]) => !agora.has(id)).map(([material_id, q]) => ({ material_id, antes: q }));
  const total = (m: Map<string, number>) => r2([...m.values()].reduce((x, y) => x + y, 0));
  return {
    anterior: { codigo: anterior.codigo, data: anterior.data_pedido },
    porItem, sairam, iguais, aumentaram, diminuiram, novos, totalAntes: total(antes), totalAgora: total(agora),
  };
}

// ---------- Link do líder: os últimos pedidos do posto, item por item ----------

interface PedidoDoHistorico {
  status: string;
  itens: { material_id: string; nome: string; unidade: string; quantidade: number; quantidade_pedida: number; quantidade_atendida: number | null }[];
}
export interface LinhaHistorico {
  material_id: string; nome: string; unidade: string;
  /** Um por pedido, na ordem recebida (o mais novo primeiro). pedida 0 = não estava no pedido. */
  valores: { pedida: number; recebeu: number | null }[];
  /** Média por pedido do que conta (o entregue, se já foi atendido; senão o pedido). Pedido sem o item conta 0. */
  media: number;
}

export function historicoPorItem(pedidos: PedidoDoHistorico[]): LinhaHistorico[] {
  const n = pedidos.length;
  const nomes = new Map<string, { nome: string; unidade: string }>();
  for (const p of pedidos) for (const i of p.itens) if (!nomes.has(i.material_id)) nomes.set(i.material_id, { nome: i.nome, unidade: i.unidade });
  return [...nomes.entries()].map(([id, { nome, unidade }]) => {
    let soma = 0;
    const valores = pedidos.map(p => {
      const doItem = p.itens.filter(i => i.material_id === id);
      const pedida = r2(doItem.reduce((s, i) => s + Number(i.quantidade_pedida), 0));
      const entregue = p.status === 'atendida' && doItem.length > 0
        ? r2(doItem.reduce((s, i) => s + Number(i.quantidade_atendida ?? i.quantidade), 0)) : null;
      soma += entregue ?? pedida;
      return { pedida, recebeu: entregue };
    });
    return { material_id: id, nome, unidade, valores, media: n ? r2(soma / n) : 0 };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
