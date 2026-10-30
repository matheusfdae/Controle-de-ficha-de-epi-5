import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { AlertTriangle, Ban, Check, ClipboardList, Copy, HardHat, Loader2, Receipt, Repeat, Search, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  ETAPAS, FILAS, RESPONSAVEIS, STATUS_PEDIDO, aprovarExcesso, cancelarPedido, conferirPedido, dataBr, formatarMoeda,
  formatarNumero, hojeBr, inicioDoMes, listAprovadores, listGastos, listMateriais, listPedidos, listRecorrencias, listTetos, listUsuarios, nomeMaterial,
  orcarPedido, precosVigentes, rotuloPapel, tetoNoMes, valorDoPedido, variacaoTabela,
  type Aprovador, type Material, type Papel, type PedidoCompleto, type Recorrencia, type StatusPedido, type TetoPosto,
} from '../lib/pedidosService';
import RegistrarCompra from '../components/RegistrarCompra';
import { ListaRepeticoes, RepetirPedido } from '../components/Repeticoes';

/**
 * Pedidos de material: filas por etapa (conferência, orçamento, aprovação do
 * excesso, faturamento) e a consulta de todos. No detalhe, cada papel vê só a
 * ação da etapa dele; o banco confere tudo de novo.
 */

const COR_STATUS: Record<StatusPedido, string> = {
  enviada: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  devolvida: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  em_orcamento: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  aguardando_aprovacao: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  a_faturar: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  faturada: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  reprovada: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  cancelada: 'bg-muted text-muted-foreground',
};

const diasAtras = (dias: number) => {
  const d = new Date(hojeBr() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const n = (v: string) => Number(v.replace(',', '.'));

export default function Pedidos() {
  const { user, can } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [tetos, setTetos] = useState<TetoPosto[]>([]);
  const [gastosMes, setGastosMes] = useState<{ id: string; posto_id: string; valor_estimado: number; valor_orcado: number | null; valor_real: number | null }[]>([]);
  const [aprovadores, setAprovadores] = useState<Aprovador[]>([]);
  const [tabela, setTabela] = useState<Map<string, number>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('minhas');
  const [periodo, setPeriodo] = useState('90');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);
  // Vindo do sino de pedidos (/pedidos?pedido=<id>): abre o pedido direto.
  const [params, setParams] = useSearchParams();
  const pedidoDaUrl = params.get('pedido');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const hoje = hojeBr();
      const [p, po, m, t, g, a, tb] = await Promise.all([
        listPedidos(diasAtras(Number(periodo))), listPostos(), listMateriais(), listTetos(),
        listGastos(inicioDoMes(hoje), hoje), listAprovadores(), precosVigentes(),
      ]);
      setPedidos(p); setPostos(po); setMateriais(m); setTetos(t); setGastosMes(g); setAprovadores(a); setTabela(tb);
      const [rec, us] = await Promise.all([listRecorrencias(), listUsuarios().catch(() => [])]);
      setRecorrencias(rec); setUsuarios(us);
    } catch (e) {
      toast.error('Erro ao carregar os pedidos: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const [recarregouPara, setRecarregouPara] = useState<string | null>(null);
  useEffect(() => {
    if (!pedidoDaUrl || carregando) return;
    if (pedidos.some(p => p.id === pedidoDaUrl)) setAberto(pedidoDaUrl);
    // Pedido que chegou depois de a lista carregar: recarrega uma vez antes de desistir.
    else if (recarregouPara !== pedidoDaUrl) { setRecarregouPara(pedidoDaUrl); carregar(); return; }
    else toast.info('Este pedido não está mais na sua lista.');
    setParams(p => { p.delete('pedido'); return p; }, { replace: true });
  }, [pedidoDaUrl, carregando, pedidos, setParams, recarregouPara, carregar]);

  const nomePosto = useCallback((id: string) => postos.find(p => p.id === id)?.nome ?? '—', [postos]);
  const meus = useMemo(() => aprovadores.filter(a => a.user_id === user?.id), [aprovadores, user?.id]);
  const souAdmin = user?.role === 'admin';
  const temPapel = useCallback((papeis: Papel[], p: { uf: string; posto_id: string }) => souAdmin || meus.some(a =>
    papeis.includes(a.nivel) && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.posto_id))), [meus, souAdmin]);
  const minhaVez = useCallback((p: PedidoCompleto) => {
    const papeis = RESPONSAVEIS[p.status];
    return !!papeis && temPapel(papeis, p);
  }, [temPapel]);

  const termo = busca.trim().toLowerCase();
  const filtrados = (lista: PedidoCompleto[]) => lista.filter(p => !termo || p.codigo.toLowerCase().includes(termo)
    || nomePosto(p.posto_id).toLowerCase().includes(termo) || p.solicitante_nome.toLowerCase().includes(termo));
  const minhas = pedidos.filter(minhaVez);
  const lista = filtrados(aba === 'minhas' ? minhas
    : aba === 'todos' ? pedidos.filter(p => statusFiltro === 'todos' || p.status === statusFiltro)
      : pedidos.filter(p => p.status === aba));

  const saldo = useCallback((p: PedidoCompleto) => {
    const teto = tetoNoMes(tetos, p.posto_id, hojeBr());
    const consumido = gastosMes.filter(g => g.posto_id === p.posto_id && g.id !== p.id).reduce((s, g) => s + valorDoPedido(g), 0);
    return { teto, consumido };
  }, [tetos, gastosMes]);

  const pedidoAberto = pedidos.find(p => p.id === aberto) ?? null;
  const linkPublico = `${window.location.origin}/pedido-material`;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Pedidos de Material" eyebrow="Pedidos"
          description="Conferência do supervisor → orçamento de compras → aprovação do excesso de teto (comercial/gerência) → faturamento."
          actions={
            <Button variant="outline" className="gap-2" onClick={() => {
              navigator.clipboard.writeText(linkPublico).then(() => toast.success('Link copiado: ' + linkPublico), () => toast.info(linkPublico));
            }}>
              <Copy className="h-4 w-4" /> Copiar link para os encarregados
            </Button>
          } />

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="minhas">Minhas tarefas ({minhas.length})</TabsTrigger>
              {FILAS.map(f => (
                <TabsTrigger key={f.status} value={f.status}>{f.rotulo} ({pedidos.filter(p => p.status === f.status).length})</TabsTrigger>
              ))}
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="repeticoes" className="gap-1"><Repeat className="h-3.5 w-3.5" /> Repetições ({recorrencias.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            {aba === 'todos' && (
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
              <Input placeholder="SOL, posto ou solicitante" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
            </div>
          </div>
        </div>

        {aba === 'repeticoes' ? (
          <ListaRepeticoes recorrencias={recorrencias} materiais={materiais} nomePosto={nomePosto}
            nomeUsuario={id => usuarios.find(u => u.id === id)?.nome ?? 'Supervisor'}
            podeEncerrar={r => { const po = postos.find(x => x.id === r.posto_id); return !!po && temPapel(['supervisor', 'compras', 'gerencia'], { uf: po.uf, posto_id: po.id }); }}
            onMudou={carregar} />
        ) : (
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
                      ? (meus.length === 0 && !souAdmin ? 'Você não tem papel nos pedidos (Configurações de Pedidos > Papéis).' : 'Nada esperando por você.')
                      : 'Nenhum pedido.'}
                  </TableCell></TableRow>
                )}
                {!carregando && lista.map(p => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setAberto(p.id)}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {p.codigo} {p.recorrencia_id && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" aria-label="recorrente" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dataBr(p.data_pedido)}</TableCell>
                    <TableCell>{nomePosto(p.posto_id)} <span className="text-xs text-muted-foreground">{p.uf}</span></TableCell>
                    <TableCell>{p.solicitante_nome}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatarMoeda(valorDoPedido(p))}
                      <span className="block text-[11px] text-muted-foreground">
                        {p.valor_real != null ? 'nota' : p.valor_orcado != null ? 'orçado' : 'estimado'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`${COR_STATUS[p.status]} border-0`}>{STATUS_PEDIDO[p.status]}</Badge>
                        {p.excede_teto && !['faturada', 'cancelada', 'reprovada'].includes(p.status) && (
                          <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Excede o teto</Badge>
                        )}
                        {p.tem_epi && <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" /> EPI</Badge>}
                        {p.cobrar_cliente && <Badge variant="outline">Cobrar do cliente</Badge>}
                        {p.sem_preco && p.status !== 'faturada' && <Badge variant="outline">Item fora da tabela</Badge>}
                        {minhaVez(p) && <Badge className="bg-primary text-primary-foreground">Sua vez</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        )}
      </div>

      {pedidoAberto && (
        <DetalhePedido key={pedidoAberto.id} pedido={pedidoAberto} posto={nomePosto(pedidoAberto.posto_id)}
          materiais={materiais} tabela={tabela} saldo={saldo(pedidoAberto)}
          minhaVez={minhaVez(pedidoAberto)}
          podeCancelar={!['faturada', 'cancelada', 'reprovada'].includes(pedidoAberto.status) && temPapel(['compras', 'gerencia'], pedidoAberto)}
          podeFaturar={['a_faturar', 'faturada'].includes(pedidoAberto.status) && (temPapel(['compras'], pedidoAberto) || can('pedidos_material', 'create'))}
          repeticao={recorrencias.find(r => r.origem_pedido_id === pedidoAberto.id || r.id === pedidoAberto.recorrencia_id)}
          podeRepetir={!['cancelada', 'reprovada', 'devolvida'].includes(pedidoAberto.status) && temPapel(['supervisor', 'gerencia'], pedidoAberto)}
          podeEncerrarRepeticao={temPapel(['supervisor', 'compras', 'gerencia'], pedidoAberto)}
          onRepeticao={carregar}
          onFechar={() => setAberto(null)} onAtualizado={async () => { setAberto(null); await carregar(); window.dispatchEvent(new Event('pedidos-atualizados')); }} />
      )}
    </div>
  );
}

function DetalhePedido({ pedido: p, posto, materiais, tabela, saldo, minhaVez, podeCancelar, podeFaturar, repeticao, podeRepetir,
  podeEncerrarRepeticao, onRepeticao, onFechar, onAtualizado }: {
  pedido: PedidoCompleto; posto: string; materiais: Material[]; tabela: Map<string, number>;
  saldo: { teto: number | null; consumido: number };
  minhaVez: boolean; podeCancelar: boolean; podeFaturar: boolean;
  repeticao: Recorrencia | undefined; podeRepetir: boolean; podeEncerrarRepeticao: boolean; onRepeticao: () => Promise<void>;
  onFechar: () => void; onAtualizado: () => Promise<void>;
}) {
  const [quantidades, setQuantidades] = useState<Record<string, string>>(
    Object.fromEntries(p.itens.map(i => [i.id, String(i.quantidade).replace('.', ',')])));
  const [precos, setPrecos] = useState<Record<string, string>>(
    Object.fromEntries(p.itens.map(i => [i.id, i.preco_orcado != null ? String(i.preco_orcado).replace('.', ',')
      : i.preco_ref != null ? String(i.preco_ref).replace('.', ',') : ''])));
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [faturando, setFaturando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const mat = (id: string) => materiais.find(m => m.id === id);

  const conferindo = minhaVez && p.status === 'enviada';
  const orcando = minhaVez && p.status === 'em_orcamento';
  const aprovando = minhaVez && p.status === 'aguardando_aprovacao';

  const qtd = (id: string, original: number) => {
    const v = n(quantidades[id] ?? '');
    return conferindo && quantidades[id] !== '' && Number.isFinite(v) ? v : original;
  };
  const preco = (i: PedidoCompleto['itens'][number]) => {
    if (orcando) { const v = n(precos[i.id] ?? ''); return precos[i.id] !== '' && Number.isFinite(v) ? v : null; }
    return i.preco_orcado ?? i.preco_ref;
  };
  const totalAgora = Math.round(p.itens.reduce((s, i) => s + qtd(i.id, i.quantidade) * (preco(i) ?? 0), 0) * 100) / 100;
  const valorTeto = ['enviada', 'em_orcamento', 'devolvida'].includes(p.status) ? totalAgora : valorDoPedido(p);
  const excede = !p.cobrar_cliente && saldo.teto != null && saldo.consumido + valorTeto > saldo.teto;

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setSalvando(true);
    try { await fn(); toast.success(ok); await onAtualizado(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  const conferir = (conferido: boolean) => {
    if (!conferido) {
      if (!comentario.trim()) return toast.error('Escreva o motivo da devolução.');
      return agir(() => conferirPedido(p.id, false, comentario), 'Pedido devolvido ao encarregado.');
    }
    const ajustes: { item_id: string; quantidade: number }[] = [];
    for (const i of p.itens) {
      const q = qtd(i.id, i.quantidade);
      if (!(q >= 0)) return toast.error(`Quantidade inválida em ${nomeMaterial(mat(i.material_id), materiais)}.`);
      if (q !== i.quantidade) ajustes.push({ item_id: i.id, quantidade: q });
    }
    agir(() => conferirPedido(p.id, true, comentario, ajustes), 'Conferido. Segue para o orçamento de compras.');
  };

  const orcar = () => {
    const lista: { item_id: string; preco: number }[] = [];
    for (const i of p.itens) {
      const v = preco(i);
      if (v == null || !(v >= 0)) return toast.error(`Informe o preço orçado de ${nomeMaterial(mat(i.material_id), materiais)}.`);
      lista.push({ item_id: i.id, preco: v });
    }
    agir(async () => {
      const r = await orcarPedido(p.id, lista, comentario);
      if (r.status === 'aguardando_aprovacao') toast.warning('O pedido excede o teto do posto: foi para a aprovação do comercial/gerência.');
    }, 'Orçamento concluído.');
  };

  const aprovar = (sim: boolean) => {
    if (!comentario.trim()) return toast.error(`Escreva a justificativa da ${sim ? 'aprovação' : 'reprovação'}.`);
    agir(() => aprovarExcesso(p.id, sim, comentario), sim ? 'Excesso aprovado. Segue para faturamento.' : 'Pedido reprovado.');
  };

  const cancelar = () => {
    if (!comentario.trim()) return toast.error('Escreva o motivo do cancelamento no campo abaixo.');
    agir(() => cancelarPedido(p.id, comentario), 'Pedido cancelado.');
  };

  const etapaFeita = (s: StatusPedido) => p.eventos.some(e => e.para_status === s);
  const pulouAprovacao = p.eventos.some(e => e.de_status === 'em_orcamento' && e.para_status === 'a_faturar');

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-5 w-5 text-primary" /> {p.codigo}
            <Badge className={`${COR_STATUS[p.status]} border-0`}>{STATUS_PEDIDO[p.status]}</Badge>
            {p.tem_epi && <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" /> Tem item de EPI</Badge>}
            {p.cobrar_cliente && <Badge variant="outline">Cobrar do cliente</Badge>}
          </DialogTitle>
          <DialogDescription>
            {posto} ({p.uf}) · pedido em {dataBr(p.data_pedido)} por {p.solicitante_nome}
            {p.solicitante_matricula && ` (matr. ${p.solicitante_matricula})`}
            {p.solicitante_telefone && ` · tel. ${p.solicitante_telefone}`}
            {p.recorrencia_id && ' · recorrente'}
          </DialogDescription>
        </DialogHeader>

        {/* Linha do tempo */}
        <ol className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {ETAPAS.filter(s => !(s === 'aguardando_aprovacao' && pulouAprovacao)).map((s, i) => {
            const atual = p.status === s;
            const feita = etapaFeita(s) && !atual;
            return (
              <li key={s} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <span className={`rounded-full px-2 py-0.5 border ${atual ? 'border-primary bg-primary/10 font-semibold' : feita ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {feita && <Check className="inline h-3 w-3 mr-0.5" />}{STATUS_PEDIDO[s]}
                </span>
              </li>
            );
          })}
        </ol>

        {p.cobrar_cliente ? (
          <p className="text-sm text-muted-foreground">
            Posto sob demanda: este pedido é cobrado do cliente pelo custo (valor das notas) e não conta no teto do posto.
            {p.cobrado_em && ` Cobrado em ${new Date(p.cobrado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${p.cobranca_ref ? ` (${p.cobranca_ref})` : ''}.`}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <Info rotulo="Teto do mês" valor={saldo.teto == null ? 'Sem teto' : formatarMoeda(saldo.teto)} />
            <Info rotulo="Consumido no mês (outros)" valor={formatarMoeda(saldo.consumido)} />
            <Info rotulo={orcando ? 'Este pedido (orçado)' : 'Este pedido'} valor={formatarMoeda(valorTeto)} />
            <Info rotulo="Saldo depois deste" valor={saldo.teto == null ? '—' : formatarMoeda(saldo.teto - saldo.consumido - valorTeto)}
              destaque={excede ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} />
          </div>
        )}
        {excede && !['faturada', 'cancelada', 'reprovada'].includes(p.status) && (
          <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" />
            Provável excesso de teto: depois do orçamento, o pedido vai para a aprovação do comercial/gerência.</p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right w-28">{conferindo ? 'Conferido' : 'Qtd.'}</TableHead>
              <TableHead className="text-right">Tabela</TableHead>
              <TableHead className="text-right w-32">{orcando ? 'Orçado (R$)' : 'Orçado'}</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.itens.map(i => {
              const m = mat(i.material_id);
              const ref = tabela.get(i.material_id) ?? i.preco_ref;
              const orc = orcando ? preco(i) : i.preco_orcado;
              const varia = variacaoTabela(orc, ref);
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    {nomeMaterial(m, materiais)} <span className="text-xs text-muted-foreground">{m?.unidade}</span>
                    {m?.is_epi && <HardHat className="inline h-3.5 w-3.5 ml-1 text-amber-600" aria-label="EPI" />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarNumero(i.quantidade_pedida)}</TableCell>
                  <TableCell className="text-right">
                    {conferindo ? (
                      <Input className="h-8 text-right" inputMode="decimal" aria-label="Quantidade conferida"
                        value={quantidades[i.id] ?? ''} onChange={e => setQuantidades(q => ({ ...q, [i.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                    ) : formatarNumero(i.quantidade)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ref == null ? <span className="text-xs text-amber-700">fora da tabela</span> : formatarMoeda(ref)}</TableCell>
                  <TableCell className="text-right">
                    {orcando ? (
                      <Input className="h-8 text-right" inputMode="decimal" aria-label="Preço orçado"
                        value={precos[i.id] ?? ''} onChange={e => setPrecos(x => ({ ...x, [i.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                    ) : <span className="tabular-nums">{formatarMoeda(i.preco_orcado)}</span>}
                    {varia != null && varia !== 0 && (
                      <span className={`block text-[11px] ${varia > 0 ? 'text-destructive' : 'text-emerald-600'}`}>{varia > 0 ? '+' : ''}{formatarNumero(varia)}% x tabela</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(qtd(i.id, i.quantidade) * (preco(i) ?? 0))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {p.observacao && <p className="text-sm"><span className="text-muted-foreground">Observação do encarregado:</span> {p.observacao}</p>}

        <RepetirPedido pedidoId={p.id} repeticao={repeticao} podeRepetir={podeRepetir} podeEncerrar={podeEncerrarRepeticao} onMudou={onRepeticao} />

        <div className="space-y-1">
          <p className="text-sm font-semibold">Histórico</p>
          <ol className="text-sm space-y-1">
            {p.eventos.map(e => (
              <li key={e.id} className="flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>
                  {e.de_status === e.para_status ? (
                    <><strong>{e.comentario}</strong>{e.usuario_nome && ` — ${e.usuario_nome}`}</>
                  ) : (
                    <>
                      <strong>{STATUS_PEDIDO[e.para_status]}</strong>
                      {e.usuario_nome && ` — ${e.usuario_nome}`}{e.papel && ` (${rotuloPapel(e.papel)})`}
                      {e.comentario && <span className="block text-muted-foreground">“{e.comentario}”</span>}
                    </>
                  )}
                  {e.payload?.ajustes?.length ? (
                    <span className="block text-muted-foreground text-xs">
                      Ajustes: {e.payload.ajustes.map(a => `${a.item}: ${formatarNumero(Number(a.de))} → ${formatarNumero(Number(a.para))}`).join('; ')}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {p.compras.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">Notas</p>
            {p.compras.map(c => (
              <div key={c.id} className="rounded-md border p-2">
                <p>{dataBr(c.data_compra)} · {c.fornecedor_nome}{c.numero_nf && ` · NF ${c.numero_nf}`} ·{' '}
                  <strong>{formatarMoeda(c.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0))}</strong></p>
                <p className="text-muted-foreground">{c.itens.map(i => `${formatarNumero(i.quantidade)} ${nomeMaterial(mat(i.material_id), materiais)} a ${formatarMoeda(i.valor_unitario)}`).join('; ')}</p>
              </div>
            ))}
          </div>
        )}

        {(conferindo || orcando || aprovando || podeCancelar) && (
          <div className="space-y-2">
            <Label htmlFor="coment">
              {aprovando ? 'Justificativa (obrigatória)' : conferindo ? 'Comentário (obrigatório para devolver)' : 'Comentário'}
              {podeCancelar && ' — também é o motivo, se for cancelar'}
            </Label>
            <Textarea id="coment" rows={2} maxLength={1000} value={comentario} onChange={e => setComentario(e.target.value)} />
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {podeCancelar && (
            cancelando
              ? <Button variant="destructive" className="gap-2" disabled={salvando} onClick={cancelar}><Ban className="h-4 w-4" /> Confirmar cancelamento</Button>
              : <Button variant="ghost" className="gap-2" onClick={() => setCancelando(true)}><Ban className="h-4 w-4" /> Cancelar pedido</Button>
          )}
          {conferindo && <>
            <Button variant="outline" className="gap-2" disabled={salvando} onClick={() => conferir(false)}><Undo2 className="h-4 w-4" /> Devolver ao encarregado</Button>
            <Button className="gap-2" disabled={salvando} onClick={() => conferir(true)}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Conferido — mandar para orçamento
            </Button>
          </>}
          {orcando && (
            <Button className="gap-2" disabled={salvando} onClick={orcar}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Concluir orçamento
            </Button>
          )}
          {aprovando && <>
            <Button variant="destructive" className="gap-2" disabled={salvando} onClick={() => aprovar(false)}><X className="h-4 w-4" /> Reprovar</Button>
            <Button className="gap-2" disabled={salvando} onClick={() => aprovar(true)}><Check className="h-4 w-4" /> Aprovar excesso</Button>
          </>}
          {podeFaturar && p.status === 'a_faturar' && (
            <Button className="gap-2" onClick={() => setFaturando(true)}><Receipt className="h-4 w-4" /> Faturar (registrar nota)</Button>
          )}
        </DialogFooter>

        {faturando && (
          <RegistrarCompra pedido={p} materiais={materiais} onFechar={() => setFaturando(false)}
            onSalvo={async () => { setFaturando(false); await onAtualizado(); }} />
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
