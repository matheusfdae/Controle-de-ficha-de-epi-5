import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { listPostos, type Posto } from '@/services/postosService';
import {
  STATUS_PEDIDO, dataBr, formatarMoeda, formatarNumero, hojeBr, listMateriais, listPedidos, listTetos, nomeMaterial, tetoNoMes, valorDoPedido,
  type Material, type PedidoCompleto, type TetoPosto,
} from '../lib/pedidosService';
import { rotuloMes, situacao, ROTULO_SITUACAO, COR_SITUACAO } from '../lib/gerencial';

/** Todos os pedidos de um posto no mês (vindo do Painel Gerencial), com os totais e os itens. */
export default function PedidosDoPosto() {
  const { postoId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mes = params.get('mes') ?? hojeBr().slice(0, 7);
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [tetos, setTetos] = useState<TetoPosto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, po, t, m] = await Promise.all([listPedidos(`${mes}-01`), listPostos(), listTetos(), listMateriais()]);
      setPedidos(p); setPostos(po); setTetos(t); setMateriais(m);
    } catch (e) { toast.error('Erro ao carregar: ' + (e as Error).message); }
    finally { setCarregando(false); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const posto = postos.find(p => p.id === postoId);
  const noMes = (d: string | null) => !!d && d.slice(0, 7) === mes;
  // Pedidos feitos no mês ou aprovados no mês (o que conta no teto).
  const doMes = useMemo(() => pedidos.filter(p => p.posto_id === postoId && (noMes(p.data_pedido) || noMes(p.data_aprovacao)))
    .sort((a, b) => b.data_pedido.localeCompare(a.data_pedido) || b.numero - a.numero), [pedidos, postoId, mes]); // eslint-disable-line react-hooks/exhaustive-deps
  const contam = doMes.filter(p => ['a_faturar', 'faturada'].includes(p.status) && !p.cobrar_cliente && noMes(p.data_aprovacao));
  const gasto = Math.round(contam.reduce((s, p) => s + valorDoPedido(p), 0) * 100) / 100;
  const teto = tetoNoMes(tetos, postoId, `${mes}-28`);
  const sit = situacao(gasto, teto);
  const emAndamento = doMes.filter(p => ['enviada', 'devolvida', 'em_orcamento', 'aguardando_aprovacao', 'a_faturar'].includes(p.status));

  const itens = useMemo(() => {
    const t = new Map<string, number>();
    for (const p of doMes.filter(x => !['cancelada', 'reprovada'].includes(x.status))) for (const i of p.itens) t.set(i.material_id, (t.get(i.material_id) ?? 0) + i.quantidade);
    return [...t.entries()].map(([id, q]) => ({ id, q, m: materiais.find(x => x.id === id) })).sort((a, b) => b.q - a.q);
  }, [doMes, materiais]);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title={posto ? posto.nome : 'Pedidos do posto'} eyebrow={`Pedidos do posto · ${rotuloMes(mes)}`}
          description="Todos os pedidos do posto feitos ou aprovados no mês. Clique num pedido para abrir o detalhe." />

        <div>
          <Label htmlFor="mes-posto">Mês</Label>
          <Input id="mes-posto" type="month" className="w-44" value={mes} max={hojeBr().slice(0, 7)}
            onChange={e => e.target.value && setParams(p => { p.set('mes', e.target.value); return p; }, { replace: true })} />
        </div>

        {carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              ['Teto do mês', teto == null ? 'Sem teto' : formatarMoeda(teto)],
              ['Gasto (aprovado no mês)', formatarMoeda(gasto)],
              ['Saldo', teto == null ? '—' : formatarMoeda(teto - gasto)],
              ['Pedidos no mês', `${doMes.length} · ${emAndamento.length} em andamento`],
            ].map(([r, v]) => (
              <Card key={r}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{r}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </CardContent></Card>
            ))}
          </div>
          {teto != null && (
            <div className="space-y-1">
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (gasto / teto) * 100)}%`, background: COR_SITUACAO[sit] }} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {sit === 'acima' && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                {((gasto / teto) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do teto usado · {ROTULO_SITUACAO[sit]}
              </p>
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doMes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum pedido deste posto em {rotuloMes(mes)}.</TableCell></TableRow>}
                  {doMes.map(p => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/pedidos?pedido=${p.id}`)}>
                      <TableCell className="font-medium whitespace-nowrap">{p.codigo} {p.recorrencia_id && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" />}</TableCell>
                      <TableCell className="whitespace-nowrap">{dataBr(p.data_pedido)}</TableCell>
                      <TableCell>{p.solicitante_nome}</TableCell>
                      <TableCell className="text-sm max-w-xs">
                        {p.itens.map(i => `${formatarNumero(i.quantidade)} ${nomeMaterial(materiais.find(m => m.id === i.material_id), materiais)}`).join(', ') || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatarMoeda(valorDoPedido(p))}
                        <span className="block text-[11px] text-muted-foreground">{p.valor_real != null ? 'nota' : p.valor_orcado != null ? 'orçado' : 'estimado'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{STATUS_PEDIDO[p.status]}</Badge>
                          {p.cobrar_cliente && <Badge variant="outline">Cobrar do cliente</Badge>}
                          {p.excede_teto && !['faturada', 'cancelada', 'reprovada'].includes(p.status) && <Badge variant="destructive">Excede o teto</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {itens.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Itens pedidos no mês</CardTitle>
                <CardDescription>Soma das quantidades (fora pedidos cancelados ou reprovados).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Quantidade</TableHead></TableRow></TableHeader>
                  <TableBody>{itens.map(i => (
                    <TableRow key={i.id}><TableCell>{nomeMaterial(i.m, materiais)} <span className="text-xs text-muted-foreground">{i.m?.unidade}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(i.q)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>}
      </div>
    </div>
  );
}
