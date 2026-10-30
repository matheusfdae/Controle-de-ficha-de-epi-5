import { useEffect, useState } from 'react';
import { AlertTriangle, PackageSearch } from 'lucide-react';
import { formatarNumero, nomeMaterial, type Material } from '../lib/pedidosService';
import { analisePedido, type AnaliseItem } from '../lib/estoqueService';

/**
 * "O pedido faz sentido?": estoque do posto, consumo médio por dia (plantões
 * dos últimos 30 dias) e para quantos dias o estoque dura com o pedido.
 */
export default function AnaliseEstoque({ pedidoId, materiais }: { pedidoId: string; materiais: Material[] }) {
  const [itens, setItens] = useState<AnaliseItem[] | null>(null);
  useEffect(() => { analisePedido(pedidoId).then(setItens).catch(() => setItens([])); }, [pedidoId]);
  if (!itens) return null;

  const comDados = itens.filter(i => !i.sem_historico || i.estoque > 0);
  const nome = (id: string) => nomeMaterial(materiais.find(m => m.id === id), materiais);
  if (!comDados.length) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <PackageSearch className="h-3.5 w-3.5" /> Sem controle de estoque deste posto ainda: o supervisor lança em Pedidos de Material → Estoque do Posto.
      </p>
    );
  }
  const alertas = itens.filter(i => i.alerta);
  const limite = itens[0]?.limite_dias ?? 30;
  const dias = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${alertas.length ? 'border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
      <p className="text-sm font-medium flex items-center gap-2">
        <PackageSearch className="h-4 w-4 text-primary" /> Estoque do posto x consumo
        <span className="text-xs font-normal text-muted-foreground">(plantões dos últimos 30 dias)</span>
      </p>
      {alertas.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Com este pedido, {alertas.map(a => nome(a.material_id)).join(', ')} {alertas.length > 1 ? 'durariam' : 'duraria'} mais de {limite} dias pelo consumo do posto. Confira as quantidades.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left font-normal py-1">Item</th><th className="text-right font-normal">No posto</th><th className="text-right font-normal">Consumo/dia</th>
              <th className="text-right font-normal">Dura hoje</th><th className="text-right font-normal">Dura com o pedido</th></tr>
          </thead>
          <tbody>
            {itens.map(i => (
              <tr key={i.material_id} className="border-t">
                <td className="py-1">{nome(i.material_id)}</td>
                <td className="text-right tabular-nums">{formatarNumero(i.estoque)}</td>
                <td className="text-right tabular-nums">{i.sem_historico ? 'sem uso lançado' : formatarNumero(i.consumo_dia)}</td>
                <td className="text-right tabular-nums">{dias(i.dias_estoque)}</td>
                <td className={`text-right tabular-nums font-medium ${i.alerta ? 'text-amber-700 dark:text-amber-400' : ''}`}>
                  {i.alerta && <AlertTriangle className="inline h-3.5 w-3.5 mr-0.5" />}{dias(i.dias_com_pedido)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
