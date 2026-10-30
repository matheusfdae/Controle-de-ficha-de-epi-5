import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Download, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  dataBr, formatarMoeda, hojeBr, listAprovadores, listCobranca, marcarCobrados, resumoCobranca, type LinhaCobranca,
} from '../lib/pedidosService';

/**
 * Cobrança ao cliente: pedidos faturados de postos sob demanda, pelo custo
 * (valor das notas). Compras marca o que já foi para a fatura do cliente.
 */

type Situacao = 'a_cobrar' | 'cobrados' | 'todos';

const inicioMesAnterior = () => {
  const d = new Date(hojeBr() + 'T12:00:00Z');
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
};
const diaBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

export default function CobrancaCliente() {
  const { can, user } = useAuth();
  const [inicio, setInicio] = useState(inicioMesAnterior());
  const [fim, setFim] = useState(hojeBr());
  const [situacao, setSituacao] = useState<Situacao>('a_cobrar');
  const [postoFiltro, setPostoFiltro] = useState('todos');
  const [linhas, setLinhas] = useState<LinhaCobranca[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [referencia, setReferencia] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [souCompras, setSouCompras] = useState(false);
  useEffect(() => {
    listAprovadores().then(a => setSouCompras(a.some(x => x.user_id === user?.id && x.nivel === 'compras'))).catch(() => {});
  }, [user?.id]);
  // Como no banco: _pm_gestor.
  const gestor = can('pedidos_material', 'edit') || souCompras;

  const carregar = useCallback(async () => {
    if (!inicio || !fim || inicio > fim) return;
    setCarregando(true);
    try {
      const [l, p] = await Promise.all([listCobranca(inicio, fim), listPostos()]);
      setLinhas(l); setPostos(p); setMarcados(new Set());
    } catch (e) {
      toast.error('Erro ao carregar: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomePosto = useCallback((id: string) => postos.find(p => p.id === id)?.nome ?? '—', [postos]);
  const doPosto = linhas.filter(l => postoFiltro === 'todos' || l.posto_id === postoFiltro);
  const filtradas = doPosto.filter(l => situacao === 'todos' || (situacao === 'cobrados') === !!l.cobrado_em);
  const resumo = resumoCobranca(doPosto);
  const totalACobrar = resumo.reduce((s, r) => s + r.a_cobrar, 0);
  const totalCobrado = resumo.reduce((s, r) => s + r.cobrado, 0);
  const postosNaLista = [...new Set(linhas.map(l => l.posto_id))].sort((a, b) => nomePosto(a).localeCompare(nomePosto(b)));

  const selecionadas = filtradas.filter(l => marcados.has(l.id));
  const valorSelecionado = selecionadas.reduce((s, l) => s + l.valor, 0);
  // Marca/desmarca só faz sentido com todos os selecionados na mesma situação.
  const selecaoCobrada = selecionadas.length > 0 && selecionadas.every(l => l.cobrado_em);
  const selecaoACobrar = selecionadas.length > 0 && selecionadas.every(l => !l.cobrado_em);
  const alternar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = filtradas.length > 0 && filtradas.every(l => marcados.has(l.id));

  const marcar = async (cobrado: boolean) => {
    if (cobrado && !referencia.trim()) return toast.error('Informe a referência da cobrança (nº da fatura ou nota ao cliente).');
    setSalvando(true);
    try {
      const n = await marcarCobrados(selecionadas.map(l => l.id), cobrado, referencia);
      toast.success(cobrado ? `${n} pedido(s) marcado(s) como cobrado(s).` : `Cobrança desfeita em ${n} pedido(s).`);
      setReferencia('');
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const exportar = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cobrança ao cliente');
    ws.columns = [
      { header: 'Posto', key: 'posto', width: 34 },
      { header: 'UF', key: 'uf', width: 6 },
      { header: 'Pedido', key: 'codigo', width: 18 },
      { header: 'Data do pedido', key: 'data_pedido', width: 14 },
      { header: 'Faturado em', key: 'faturada', width: 13 },
      { header: 'Notas fiscais', key: 'notas', width: 40 },
      { header: 'Valor a cobrar (custo)', key: 'valor', width: 20, style: { numFmt: '"R$" #,##0.00' } },
      { header: 'Situação', key: 'situacao', width: 12 },
      { header: 'Cobrado em', key: 'cobrado', width: 12 },
      { header: 'Referência da cobrança', key: 'ref', width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    const ordenadas = [...filtradas].sort((a, b) => nomePosto(a.posto_id).localeCompare(nomePosto(b.posto_id)) || a.faturada_em.localeCompare(b.faturada_em));
    for (const l of ordenadas) {
      ws.addRow({
        posto: nomePosto(l.posto_id), uf: l.uf, codigo: l.codigo, data_pedido: dataBr(l.data_pedido), faturada: diaBr(l.faturada_em),
        notas: l.notas.map(n => `${n.numero_nf ? `NF ${n.numero_nf}` : 'sem nº'} (${n.fornecedor_nome})`).join('; '),
        valor: l.valor, situacao: l.cobrado_em ? 'Cobrado' : 'A cobrar', cobrado: diaBr(l.cobrado_em), ref: l.cobranca_ref ?? '',
      });
    }
    const total = ws.addRow({ notas: 'Total', valor: ordenadas.reduce((s, l) => s + l.valor, 0) });
    total.font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobranca-cliente-${inicio}-a-${fim}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Cobrança ao Cliente" eyebrow="Pedidos"
          description="Pedidos faturados de postos sob demanda, cobrados do cliente pelo custo (valor das notas). Esses pedidos não contam no teto do posto."
          actions={<Button className="gap-2" onClick={exportar} disabled={filtradas.length === 0}><Download className="h-4 w-4" /> Excel</Button>} />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ini">Faturados de</Label>
            <Input id="ini" type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label htmlFor="fim">Até</Label>
            <Input id="fim" type="date" value={fim} min={inicio} max={hojeBr()} onChange={e => setFim(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Posto</Label>
            <Select value={postoFiltro} onValueChange={setPostoFiltro}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os postos</SelectItem>
                {postosNaLista.map(id => <SelectItem key={id} value={id}>{nomePosto(id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Situação</Label>
            <Select value={situacao} onValueChange={v => { setSituacao(v as Situacao); setMarcados(new Set()); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_cobrar">A cobrar</SelectItem>
                <SelectItem value="cobrados">Já cobrados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">A cobrar no período</p>
            <p className="text-2xl font-bold tabular-nums">{formatarMoeda(totalACobrar)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Já cobrado no período</p>
            <p className="text-2xl font-bold tabular-nums">{formatarMoeda(totalCobrado)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Postos com pedidos</p>
            <p className="text-2xl font-bold tabular-nums">{resumo.length}</p>
          </div>
        </div>

        {resumo.length > 1 && (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posto</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">A cobrar</TableHead>
                    <TableHead className="text-right">Já cobrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumo.map(r => (
                    <TableRow key={r.posto_id} className="cursor-pointer" onClick={() => setPostoFiltro(r.posto_id)}>
                      <TableCell>{nomePosto(r.posto_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.pedidos}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatarMoeda(r.a_cobrar)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatarMoeda(r.cobrado)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {gestor && selecionadas.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm self-center">
              <strong>{selecionadas.length}</strong> selecionado(s) · {formatarMoeda(valorSelecionado)}
            </p>
            {selecaoACobrar && (
              <>
                <div>
                  <Label htmlFor="ref">Referência da cobrança</Label>
                  <Input id="ref" value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={200}
                    placeholder="Nº da fatura ou nota ao cliente" className="w-64" />
                </div>
                <Button className="gap-2" onClick={() => marcar(true)} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Marcar como cobrado
                </Button>
              </>
            )}
            {selecaoCobrada && (
              <Button variant="outline" className="gap-2" onClick={() => marcar(false)} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Desfazer cobrança
              </Button>
            )}
            {!selecaoACobrar && !selecaoCobrada && (
              <p className="text-sm text-muted-foreground self-center">Selecione só pedidos a cobrar ou só pedidos já cobrados.</p>
            )}
          </div>
        )}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {gestor && (
                    <TableHead className="w-10">
                      <Checkbox checked={todosMarcados} aria-label="Selecionar todos"
                        onCheckedChange={v => setMarcados(v ? new Set(filtradas.map(l => l.id)) : new Set())} />
                    </TableHead>
                  )}
                  <TableHead>Pedido</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead>Faturado em</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Valor (custo)</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                )}
                {!carregando && filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    Nenhum pedido de posto sob demanda {situacao === 'a_cobrar' ? 'a cobrar' : situacao === 'cobrados' ? 'cobrado' : 'faturado'} no período.
                  </TableCell></TableRow>
                )}
                {!carregando && filtradas.map(l => (
                  <TableRow key={l.id}>
                    {gestor && (
                      <TableCell>
                        <Checkbox checked={marcados.has(l.id)} onCheckedChange={() => alternar(l.id)} aria-label={`Selecionar ${l.codigo}`} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium whitespace-nowrap">
                      {l.codigo}
                      <span className="block text-xs text-muted-foreground">pedido em {dataBr(l.data_pedido)}</span>
                    </TableCell>
                    <TableCell>{nomePosto(l.posto_id)} <span className="text-xs text-muted-foreground">{l.uf}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{diaBr(l.faturada_em)}</TableCell>
                    <TableCell className="text-sm">
                      {l.notas.length === 0 ? '—' : l.notas.map((n, i) => (
                        <span key={i} className="block">{n.numero_nf ? `NF ${n.numero_nf}` : 'NF sem nº'} <span className="text-xs text-muted-foreground">{n.fornecedor_nome}</span></span>
                      ))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                    <TableCell>
                      {l.cobrado_em ? (
                        <Badge variant="outline" className="whitespace-nowrap">Cobrado em {diaBr(l.cobrado_em)}{l.cobranca_ref && ` · ${l.cobranca_ref}`}</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-0">A cobrar</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
