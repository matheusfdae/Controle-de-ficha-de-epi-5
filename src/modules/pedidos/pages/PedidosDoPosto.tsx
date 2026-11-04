import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, HardHat, Loader2, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { listPostos, type Posto } from '@/services/postosService';
import {
  ABERTOS, STATUS_PEDIDO, dataBr, formatarNumero, hojeBr, listMateriais, listPedidos, nomeMaterial, type Material, type PedidoCompleto,
} from '../lib/pedidosService';
import { entregaParcial, rotuloMes } from '../lib/gerencial';
import { pdfPedidosDoPosto } from '../lib/relatoriosPdf';

/** Todos os pedidos de um posto no mês (vindo do Painel Gerencial), com o que foi pedido e entregue de cada item. */
export default function PedidosDoPosto() {
  const { postoId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mes = params.get('mes') ?? hojeBr().slice(0, 7);
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, po, m] = await Promise.all([listPedidos(`${mes}-01`), listPostos(), listMateriais()]);
      setPedidos(p); setPostos(po); setMateriais(m);
    } catch (e) { toast.error('Erro ao carregar: ' + (e as Error).message); }
    finally { setCarregando(false); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const posto = postos.find(p => p.id === postoId);
  const doMes = useMemo(() => pedidos.filter(p => p.posto_id === postoId && p.data_pedido.slice(0, 7) === mes)
    .sort((a, b) => b.data_pedido.localeCompare(a.data_pedido) || b.numero - a.numero), [pedidos, postoId, mes]);
  const validos = doMes.filter(p => p.status !== 'cancelada');
  const nome = (id: string) => nomeMaterial(materiais.find(m => m.id === id), materiais);

  // Soma por item: pedido pelo encarregado, conferido pelo supervisor e entregue por compras.
  const itens = useMemo(() => {
    const t = new Map<string, { pedido: number; conferido: number; entregue: number }>();
    for (const p of validos) for (const i of p.itens) {
      const v = t.get(i.material_id) ?? { pedido: 0, conferido: 0, entregue: 0 };
      v.pedido += i.quantidade_pedida;
      if (!['enviada', 'devolvida'].includes(p.status)) v.conferido += i.quantidade;
      v.entregue += i.quantidade_atendida ?? 0;
      t.set(i.material_id, v);
    }
    return [...t.entries()].map(([id, v]) => ({ id, ...v, m: materiais.find(x => x.id === id) })).sort((a, b) => b.pedido - a.pedido);
  }, [validos, materiais]);

  const [gerandoPdf, setGerandoPdf] = useState(false);
  const exportarPdf = async () => {
    if (!posto) return;
    setGerandoPdf(true);
    try { await pdfPedidosDoPosto(posto, doMes, materiais, mes); }
    catch (e) { toast.error('Não foi possível gerar o PDF: ' + (e as Error).message); }
    finally { setGerandoPdf(false); }
  };

  const resumo = [
    ['Pedidos no mês', `${validos.length}`],
    ['Em andamento', `${validos.filter(p => ABERTOS.includes(p.status)).length}`],
    ['Atendidos', `${validos.filter(p => p.status === 'atendida').length}`],
    ['Entregas parciais', `${validos.filter(entregaParcial).length}`],
  ];

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title={posto ? posto.nome : 'Pedidos do posto'} eyebrow={`Pedidos do posto · ${rotuloMes(mes)}`}
          description="Todos os pedidos do posto feitos no mês. Clique num pedido para abrir o detalhe." />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mes-posto">Mês</Label>
            <Input id="mes-posto" type="month" className="w-44" value={mes} max={hojeBr().slice(0, 7)}
              onChange={e => e.target.value && setParams(p => { p.set('mes', e.target.value); return p; }, { replace: true })} />
          </div>
          <Button variant="outline" className="gap-2 ml-auto" disabled={carregando || gerandoPdf || !posto} onClick={exportarPdf}>
            {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Exportar PDF
          </Button>
        </div>

        {carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {resumo.map(([r, v]) => (
              <Card key={r}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{r}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doMes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum pedido deste posto em {rotuloMes(mes)}.</TableCell></TableRow>}
                  {doMes.map(p => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/pedidos?pedido=${p.id}`)}>
                      <TableCell className="font-medium whitespace-nowrap">{p.codigo} {p.recorrencia_id && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" />}</TableCell>
                      <TableCell className="whitespace-nowrap">{dataBr(p.data_pedido)}</TableCell>
                      <TableCell>{p.solicitante_nome}</TableCell>
                      <TableCell className="text-sm max-w-sm">
                        {p.itens.map(i => `${formatarNumero(i.quantidade_atendida ?? i.quantidade)} ${nome(i.material_id)}`).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline">{STATUS_PEDIDO[p.status]}</Badge>
                          {entregaParcial(p) && <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">Entrega parcial</Badge>}
                          {p.tem_epi && <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" /> EPI</Badge>}
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
                <CardTitle className="text-base">Itens do mês</CardTitle>
                <CardDescription>Pedido pelo encarregado, conferido pelo supervisor e entregue por compras (fora os cancelados).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Item</TableHead><TableHead className="text-right">Pedido</TableHead>
                      <TableHead className="text-right">Conferido</TableHead><TableHead className="text-right">Entregue</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>{itens.map(i => (
                    <TableRow key={i.id}>
                      <TableCell>{nomeMaterial(i.m, materiais)} <span className="text-xs text-muted-foreground">{i.m?.unidade}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(i.pedido)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(i.conferido)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(i.entregue)}</TableCell>
                    </TableRow>
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
