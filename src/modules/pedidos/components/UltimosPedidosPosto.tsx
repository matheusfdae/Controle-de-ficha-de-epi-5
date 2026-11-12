import { useState } from 'react';
import { ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import { dataBr, formatarNumero, type PedidoAnteriorPublico } from '../lib/pedidosService';
import { historicoPorItem } from '../lib/mediaPedidos';

/**
 * Link do líder: os 3 últimos pedidos do posto escolhido, item por item, com a
 * média — para ele ter uma noção do que pode pedir. Só quantidades (sem R$).
 */
const SITUACAO: Record<string, string> = {
  enviada: 'com o supervisor', devolvida: 'devolvido', a_atender: 'com compras', atendida: 'entregue',
};

export default function UltimosPedidosPosto({ pedidos, erro }: { pedidos: PedidoAnteriorPublico[] | null; erro?: string | null }) {
  const [aberto, setAberto] = useState(true);
  const linhas = pedidos ? historicoPorItem(pedidos) : [];

  return (
    <div className="rounded-lg border bg-muted/30">
      <button type="button" onClick={() => setAberto(a => !a)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium">
        <History className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1">Últimos pedidos deste posto{pedidos?.length ? ` (${pedidos.length})` : ''}</span>
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {aberto && (
        <div className="border-t px-3 pb-3 pt-2">
          {erro ? (
            <p className="text-xs text-muted-foreground">Não deu para carregar os pedidos anteriores ({erro}).</p>
          ) : pedidos == null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</p>
          ) : pedidos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Este posto ainda não tem pedidos no sistema.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">Para ter uma noção do que pedir: quanto foi pedido nos últimos pedidos e a média.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 pr-2 text-left font-medium">Item</th>
                      {pedidos.map((p, k) => (
                        <th key={p.id} className="px-1 py-1 text-center font-medium whitespace-nowrap">
                          <span className="block text-foreground">{k === 0 ? 'Último' : `${k + 1}º`}</span>
                          <span className="block">{dataBr(p.data_pedido)}</span>
                          <span className="block text-[10px]">{SITUACAO[p.status] ?? p.status}</span>
                        </th>
                      ))}
                      <th className="py-1 pl-1 text-center font-semibold text-foreground">Média</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {linhas.map(l => (
                      <tr key={l.material_id}>
                        <td className="py-1 pr-2 leading-snug">{l.nome} <span className="text-muted-foreground">({l.unidade})</span></td>
                        {l.valores.map((v, k) => (
                          <td key={k} className="px-1 py-1 text-center tabular-nums">
                            {v.pedida ? formatarNumero(v.pedida) : <span className="text-muted-foreground">—</span>}
                            {v.recebeu != null && v.recebeu !== v.pedida && (
                              <span className="block text-[10px] text-muted-foreground">recebeu {formatarNumero(v.recebeu)}</span>
                            )}
                          </td>
                        ))}
                        <td className="py-1 pl-1 text-center font-semibold tabular-nums">{formatarNumero(l.media)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
