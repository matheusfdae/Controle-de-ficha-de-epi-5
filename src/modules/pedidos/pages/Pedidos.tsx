import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Check, ClipboardList, Copy, Loader2, Receipt, Repeat, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import { listFornecedores, type Fornecedor } from '@/services/fornecedoresService';
import {
  STATUS_PEDIDO, dataBr, decidirPedido, formatarMoeda, formatarNumero, hojeBr, inicioDoMes, listAprovadores,
  listGastos, listMateriais, listPedidos, listTetos, numeroPedido, registrarCompra, rotuloNivel, statusComNivel,
  tetoNoMes, valorDoPedido,
  type Aprovador, type Material, type PedidoCompleto, type StatusPedido, type TetoPosto,
} from '../lib/pedidosService';

/**
 * Pedidos de material: o que espera a minha aprovação, o que espera compra e
 * a consulta de todos. No detalhe, o aprovador vê o saldo do teto do posto,
 * pode reduzir quantidades e aprova/reprova; compras registra a nota.
 */

const COR_STATUS: Record<StatusPedido, string> = {
  em_aprovacao: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  aprovado: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  comprado: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  reprovado: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  cancelado: 'bg-muted text-muted-foreground',
};

const somaDias = (dias: number) => {
  const d = new Date(hojeBr() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

export default function Pedidos() {
  const { user, can } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [tetos, setTetos] = useState<TetoPosto[]>([]);
  const [gastosMes, setGastosMes] = useState<{ posto_id: string; valor_estimado: number; valor_real: number | null }[]>([]);
  const [aprovadores, setAprovadores] = useState<Aprovador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('minhas');
  const [periodo, setPeriodo] = useState('90');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const hoje = hojeBr();
      const [p, po, m, t, g, a] = await Promise.all([
        listPedidos(somaDias(Number(periodo))), listPostos(), listMateriais(), listTetos(),
        listGastos(inicioDoMes(hoje), hoje), listAprovadores(),
      ]);
      setPedidos(p); setPostos(po); setMateriais(m); setTetos(t); setGastosMes(g); setAprovadores(a);
    } catch (e) {
      toast.error('Erro ao carregar os pedidos: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomePosto = useCallback((id: string) => postos.find(p => p.id === id)?.nome ?? '—', [postos]);
  const meus = useMemo(() => aprovadores.filter(a => a.user_id === user?.id), [aprovadores, user?.id]);
  const souAdmin = user?.role === 'admin';
  const podeDecidir = useCallback((p: PedidoCompleto) => p.status === 'em_aprovacao' && (souAdmin || meus.some(a =>
    a.nivel === p.nivel_atual && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id)))), [meus, souAdmin]);
  const podeComprar = useCallback((p: PedidoCompleto) => ['aprovado', 'comprado'].includes(p.status) && (can('pedidos_material', 'create') ||
    meus.some(a => a.nivel === 'compras' && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id)))), [meus, can]);

  const listaMinhas = pedidos.filter(podeDecidir);
  const listaCompra = pedidos.filter(p => p.status === 'aprovado' && podeComprar(p));
  const termo = busca.trim().toLowerCase();
  const lista = (aba === 'minhas' ? listaMinhas : aba === 'compra' ? listaCompra : pedidos)
    .filter(p => aba !== 'todos' || statusFiltro === 'todos' || p.status === statusFiltro)
    .filter(p => !termo || numeroPedido(p.numero).toLowerCase().includes(termo) || String(p.numero) === termo
      || nomePosto(p.posto_id).toLowerCase().includes(termo) || p.solicitante_nome.toLowerCase().includes(termo));

  const saldo = useCallback((postoId: string) => {
    const teto = tetoNoMes(tetos, postoId, hojeBr());
    const gasto = gastosMes.filter(g => g.posto_id === postoId).reduce((s, g) => s + valorDoPedido(g), 0);
    return { teto, gasto, saldo: teto == null ? null : teto - gasto };
  }, [tetos, gastosMes]);

  const pedidoAberto = pedidos.find(p => p.id === aberto) ?? null;
  const linkPublico = `${window.location.origin}/pedido-material`;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Pedidos de Material" eyebrow="Pedidos"
          description="Aprovação por alçada (supervisor → gerente → diretor → compras) e acompanhamento dos pedidos dos postos."
          actions={
            <Button variant="outline" className="gap-2" onClick={() => {
              navigator.clipboard.writeText(linkPublico).then(() => toast.success('Link copiado: ' + linkPublico), () => toast.info(linkPublico));
            }}>
              <Copy className="h-4 w-4" /> Copiar link para os líderes
            </Button>
          } />

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList>
              <TabsTrigger value="minhas">Minha aprovação ({listaMinhas.length})</TabsTrigger>
              <TabsTrigger value="compra">Aguardando compra ({listaCompra.length})</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            {aba === 'todos' && (
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_PEDIDO).map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Nº, posto ou solicitante" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                )}
                {!carregando && lista.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    {aba === 'minhas'
                      ? (meus.length === 0 && !souAdmin ? 'Você não está cadastrado como aprovador (Configurações de Pedidos).' : 'Nada esperando a sua aprovação.')
                      : 'Nenhum pedido.'}
                  </TableCell></TableRow>
                )}
                {!carregando && lista.map(p => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setAberto(p.id)}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {numeroPedido(p.numero)} {p.recorrencia_id && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" aria-label="recorrente" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dataBr(p.data_pedido)}</TableCell>
                    <TableCell>{nomePosto(p.posto_id)} <span className="text-xs text-muted-foreground">{p.uf}</span></TableCell>
                    <TableCell>{p.solicitante_nome}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatarMoeda(valorDoPedido(p))}
                      {p.valor_real == null && <span className="block text-[11px] text-muted-foreground">estimado</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`${COR_STATUS[p.status]} border-0`}>{statusComNivel(p.status, p.nivel_atual)}</Badge>
                        {p.acima_do_teto && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Acima do teto</Badge>}
                        {p.sem_preco && <Badge variant="outline">Item sem preço</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {pedidoAberto && (
        <DetalhePedido key={pedidoAberto.id} pedido={pedidoAberto} posto={nomePosto(pedidoAberto.posto_id)}
          materiais={materiais} saldo={saldo(pedidoAberto.posto_id)}
          podeDecidir={podeDecidir(pedidoAberto)} podeComprar={podeComprar(pedidoAberto)}
          onFechar={() => setAberto(null)} onAtualizado={async () => { setAberto(null); await carregar(); }} />
      )}
    </div>
  );
}

function DetalhePedido({ pedido: p, posto, materiais, saldo, podeDecidir, podeComprar, onFechar, onAtualizado }: {
  pedido: PedidoCompleto; posto: string; materiais: Material[];
  saldo: { teto: number | null; gasto: number; saldo: number | null };
  podeDecidir: boolean; podeComprar: boolean;
  onFechar: () => void; onAtualizado: () => Promise<void>;
}) {
  const [quantidades, setQuantidades] = useState<Record<string, string>>(
    Object.fromEntries(p.itens.map(i => [i.id, String(i.quantidade)])));
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [comprando, setComprando] = useState(false);
  const mat = (id: string) => materiais.find(m => m.id === id);

  const qtd = (id: string, original: number) => {
    const v = Number((quantidades[id] ?? '').replace(',', '.'));
    return Number.isFinite(v) && quantidades[id] !== '' ? v : original;
  };
  const totalAgora = Math.round(p.itens.reduce((s, i) => s + qtd(i.id, i.quantidade) * (i.preco_estimado ?? 0), 0) * 100) / 100;
  // O gasto do mês já inclui este pedido se ele foi aprovado neste mês.
  const contaNoMes = p.data_aprovacao && p.data_aprovacao >= inicioDoMes(hojeBr());
  const saldoDepois = saldo.saldo == null ? null : saldo.saldo - (contaNoMes ? 0 : totalAgora);
  const acima = saldoDepois != null && saldoDepois < 0;

  const decidir = async (aprovar: boolean) => {
    if (!aprovar && !comentario.trim()) return toast.error('Escreva o motivo da reprovação.');
    if (aprovar && acima && !comentario.trim()) return toast.error('Pedido acima do teto: escreva a justificativa.');
    const ajustes: { item_id: string; quantidade: number }[] = [];
    for (const i of p.itens) {
      const q = qtd(i.id, i.quantidade);
      if (q < 0 || q > i.quantidade) return toast.error(`A quantidade de ${mat(i.material_id)?.nome ?? 'um item'} só pode diminuir.`);
      if (q !== i.quantidade) ajustes.push({ item_id: i.id, quantidade: q });
    }
    setSalvando(true);
    try {
      const r = await decidirPedido(p.id, aprovar, comentario, aprovar ? ajustes : undefined);
      toast.success(!aprovar ? 'Pedido reprovado.' : r.status === 'aprovado' ? 'Pedido aprovado. Agora é com compras.' : `Aprovado. Segue para ${rotuloNivel(r.nivel_atual).toLowerCase()}.`);
      await onAtualizado();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-5 w-5 text-primary" /> {numeroPedido(p.numero)}
            <Badge className={`${COR_STATUS[p.status]} border-0`}>{statusComNivel(p.status, p.nivel_atual)}</Badge>
          </DialogTitle>
          <DialogDescription>
            {posto} ({p.uf}) · pedido em {dataBr(p.data_pedido)} por {p.solicitante_nome}
            {p.solicitante_matricula && ` (matr. ${p.solicitante_matricula})`}
            {p.solicitante_telefone && ` · tel. ${p.solicitante_telefone}`}
            {p.recorrencia_id && ' · recorrente'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <Info rotulo="Teto do mês" valor={saldo.teto == null ? 'Sem teto' : formatarMoeda(saldo.teto)} />
          <Info rotulo="Gasto aprovado no mês" valor={formatarMoeda(saldo.gasto)} />
          <Info rotulo={p.status === 'em_aprovacao' ? 'Este pedido' : 'Valor do pedido'} valor={formatarMoeda(p.status === 'em_aprovacao' ? totalAgora : valorDoPedido(p))} />
          <Info rotulo={p.status === 'em_aprovacao' ? 'Saldo se aprovar' : 'Saldo do mês'} valor={saldoDepois == null ? '—' : formatarMoeda(saldoDepois)}
            destaque={acima ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} />
        </div>
        {acima && p.status === 'em_aprovacao' && (
          <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" />
            Acima do teto: a aprovação exige justificativa e o pedido passa pelo diretor.</p>
        )}
        {p.sem_preco && <p className="text-sm text-muted-foreground">Há item sem preço (sem compra anterior nem preço de referência): o valor estimado está incompleto.</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right w-32">{podeDecidir ? 'Aprovar' : 'Quantidade'}</TableHead>
              <TableHead className="text-right">Preço est.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.itens.map(i => (
              <TableRow key={i.id}>
                <TableCell>{mat(i.material_id)?.nome ?? '—'} <span className="text-xs text-muted-foreground">{mat(i.material_id)?.unidade}</span></TableCell>
                <TableCell className="text-right tabular-nums">{formatarNumero(i.quantidade_pedida)}</TableCell>
                <TableCell className="text-right">
                  {podeDecidir ? (
                    <Input className="h-8 text-right" inputMode="decimal" aria-label="Quantidade aprovada"
                      value={quantidades[i.id] ?? ''} onChange={e => setQuantidades(q => ({ ...q, [i.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                  ) : formatarNumero(i.quantidade)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(i.preco_estimado)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(qtd(i.id, i.quantidade) * (i.preco_estimado ?? 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {p.observacao && <p className="text-sm"><span className="text-muted-foreground">Observação do líder:</span> {p.observacao}</p>}

        <div className="space-y-1">
          <p className="text-sm font-semibold">Andamento</p>
          <ol className="text-sm space-y-1">
            {p.niveis.map(n => {
              const a = p.aprovacoes.filter(x => x.nivel === n).at(-1);
              return (
                <li key={n} className="flex gap-2">
                  {a?.decisao === 'aprovado' ? <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    : a?.decisao === 'reprovado' ? <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      : <span className={`h-4 w-4 shrink-0 mt-0.5 rounded-full border-2 ${n === p.nivel_atual ? 'border-amber-500' : 'border-muted'}`} />}
                  <span>
                    <strong>{rotuloNivel(n)}</strong>
                    {a ? ` — ${a.decisao} por ${a.usuario_nome ?? '—'} em ${new Date(a.created_at).toLocaleString('pt-BR')}` : n === p.nivel_atual ? ' — aguardando' : ''}
                    {a?.comentario && <span className="block text-muted-foreground">“{a.comentario}”</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {p.compras.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Compras</p>
            {p.compras.map(c => (
              <div key={c.id} className="rounded-md border p-2">
                <p>{dataBr(c.data_compra)} · {c.fornecedor_nome}{c.numero_nf && ` · NF ${c.numero_nf}`} ·{' '}
                  <strong>{formatarMoeda(c.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0))}</strong></p>
                <p className="text-muted-foreground">{c.itens.map(i => `${formatarNumero(i.quantidade)} ${mat(i.material_id)?.nome ?? ''} a ${formatarMoeda(i.valor_unitario)}`).join('; ')}</p>
              </div>
            ))}
          </div>
        )}

        {podeDecidir && (
          <div className="space-y-2">
            <Label htmlFor="coment">{acima ? 'Justificativa (obrigatória, acima do teto)' : 'Comentário (obrigatório para reprovar)'}</Label>
            <Textarea id="coment" rows={2} maxLength={1000} value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {podeComprar && p.status === 'aprovado' && (
            <Button variant="outline" className="gap-2" onClick={() => setComprando(true)}><Receipt className="h-4 w-4" /> Registrar compra</Button>
          )}
          {podeDecidir && (
            <>
              <Button variant="destructive" className="gap-2" disabled={salvando} onClick={() => decidir(false)}><X className="h-4 w-4" /> Reprovar</Button>
              <Button className="gap-2" disabled={salvando} onClick={() => decidir(true)}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
              </Button>
            </>
          )}
        </DialogFooter>

        {comprando && (
          <RegistrarCompra pedido={p} materiais={materiais} onFechar={() => setComprando(false)}
            onSalvo={async () => { setComprando(false); await onAtualizado(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`font-semibold tabular-nums ${destaque ?? ''}`}>{valor}</p>
    </div>
  );
}

/** Nota da compra do pedido: fornecedor, NF, data e o preço pago em cada item. */
export function RegistrarCompra({ pedido, materiais, onFechar, onSalvo }: {
  pedido: PedidoCompleto | null; materiais: Material[]; onFechar: () => void; onSalvo: () => Promise<void>;
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedor, setFornecedor] = useState('');
  const [nf, setNf] = useState('');
  const [data, setData] = useState(hojeBr());
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState(() => pedido
    ? pedido.itens.map(i => ({
      material_id: i.material_id, quantidade: String(i.quantidade), valor: i.preco_estimado != null ? String(i.preco_estimado) : '',
    }))
    : [{ material_id: '', quantidade: '', valor: '' }]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { listFornecedores().then(setFornecedores).catch(() => setFornecedores([])); }, []);

  const n = (v: string) => Number(v.replace(',', '.'));
  const total = itens.reduce((s, i) => s + (n(i.quantidade) || 0) * (n(i.valor) || 0), 0);

  const salvar = async () => {
    if (!fornecedor.trim()) return toast.error('Informe o fornecedor.');
    if (itens.some(i => !i.material_id || !(n(i.quantidade) > 0) || i.valor === '' || !(n(i.valor) >= 0))) {
      return toast.error('Preencha material, quantidade e valor unitário de todos os itens.');
    }
    const cadastrado = fornecedores.find(f => f.nome.trim().toLowerCase() === fornecedor.trim().toLowerCase());
    setSalvando(true);
    try {
      await registrarCompra({
        pedidoId: pedido?.id ?? null, fornecedorId: cadastrado?.id ?? null, fornecedorNome: fornecedor.trim(),
        numeroNf: nf.trim(), data, observacao,
        itens: itens.map(i => ({ material_id: i.material_id, quantidade: n(i.quantidade), valor_unitario: n(i.valor) })),
      });
      toast.success('Compra registrada.');
      await onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const mudar = (idx: number, campo: 'material_id' | 'quantidade' | 'valor', v: string) =>
    setItens(is => is.map((i, j) => (j === idx ? { ...i, [campo]: v } : i)));

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedido ? `Compra do ${numeroPedido(pedido.numero)}` : 'Registrar compra avulsa'}</DialogTitle>
          <DialogDescription>Os valores unitários desta nota entram no relatório de variação de preço.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label htmlFor="forn">Fornecedor *</Label>
            <Input id="forn" list="lista-fornecedores" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
            <datalist id="lista-fornecedores">{fornecedores.map(f => <option key={f.id} value={f.nome} />)}</datalist>
          </div>
          <div>
            <Label htmlFor="nf">Nº da nota</Label>
            <Input id="nf" value={nf} onChange={e => setNf(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="data-compra">Data da compra *</Label>
            <Input id="data-compra" type="date" value={data} max={hojeBr()} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="w-28 text-right">Qtd.</TableHead>
              <TableHead className="w-32 text-right">Valor unit. (R$)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Select value={i.material_id || undefined} onValueChange={v => mudar(idx, 'material_id', v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Material" /></SelectTrigger>
                    <SelectContent>{materiais.map(m => <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input className="h-8 text-right" inputMode="decimal" value={i.quantidade} onChange={e => mudar(idx, 'quantidade', e.target.value.replace(/[^\d.,]/g, ''))} /></TableCell>
                <TableCell><Input className="h-8 text-right" inputMode="decimal" value={i.valor} onChange={e => mudar(idx, 'valor', e.target.value.replace(/[^\d.,]/g, ''))} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label="Remover item" disabled={itens.length === 1}
                    onClick={() => setItens(is => is.filter((_, j) => j !== idx))}><X className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={() => setItens(is => [...is, { material_id: '', quantidade: '', valor: '' }])}>Adicionar item</Button>
          <p className="text-sm">Total da nota: <strong className="tabular-nums">{formatarMoeda(total)}</strong></p>
        </div>
        <div>
          <Label htmlFor="obs-compra">Observação</Label>
          <Textarea id="obs-compra" rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
