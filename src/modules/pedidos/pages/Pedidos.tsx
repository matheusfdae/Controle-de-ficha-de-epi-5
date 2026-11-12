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
import { Ban, Check, ClipboardList, Copy, HardHat, Loader2, PackageCheck, Repeat, Search, Trash2, TrendingDown, TrendingUp, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  ETAPAS, FILAS, RESPONSAVEIS, STATUS_PEDIDO, atenderPedido, cancelarPedido, conferirPedido, dataBr, formatarNumero, gastoDoMesNoBanco, hojeBr,
  listAprovadores, listMateriais, listPedidos, listRecorrencias, listUsuarios, nomeMaterial, precosAnteriores, reais, rotuloPapel, variacaoPreco,
  type PrecoAnterior,
  type Aprovador, type Material, type Papel, type PedidoCompleto, type Recorrencia, type StatusPedido, ultimosPedidosDoPosto,
} from '../lib/pedidosService';
import { ListaRepeticoes, RepetirPedido } from '../components/Repeticoes';
import SeloTermoEpi from '../components/SeloTermoEpi';
import AnaliseEstoque from '../components/AnaliseEstoque';
import { acimaDaMedia, compararComAnterior, mediaUltimos, type Comparacao, type MediaUltimos } from '../lib/mediaPedidos';

/**
 * Pedidos de material (só quantidade): filas por etapa (conferência do
 * supervisor, atendimento de compras) e a consulta de todos. No detalhe, cada
 * papel vê só a ação da etapa dele; o banco confere tudo de novo.
 */

const COR_STATUS: Record<StatusPedido, string> = {
  enviada: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  devolvida: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  a_atender: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  atendida: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  cancelada: 'bg-muted text-muted-foreground',
};

const diasAtras = (dias: number) => {
  const d = new Date(hojeBr() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const n = (v: string) => Number(v.replace(',', '.'));

export default function Pedidos() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [aprovadores, setAprovadores] = useState<Aprovador[]>([]);
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
      const [p, po, m, a] = await Promise.all([listPedidos(diasAtras(Number(periodo))), listPostos(), listMateriais(), listAprovadores()]);
      setPedidos(p); setPostos(po); setMateriais(m); setAprovadores(a);
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

  const pedidoAberto = pedidos.find(p => p.id === aberto) ?? null;
  const linkPublico = `${window.location.origin}/pedido-material`;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Pedidos de Material" eyebrow="Pedidos"
          description="O encarregado pede → o supervisor confere (com o estoque e o consumo do posto) → compras atende."
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
                  <TableHead>Itens</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                )}
                {!carregando && lista.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
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
                    <TableCell className="text-sm max-w-xs">
                      <span className="line-clamp-2">
                        {p.itens.map(i => `${formatarNumero(i.quantidade_atendida ?? i.quantidade)} ${nomeMaterial(materiais.find(m => m.id === i.material_id), materiais)}`).join(', ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap text-sm">
                      {p.valor_total > 0 ? reais(p.valor_total) : <span className="text-muted-foreground">—</span>}
                      {p.sem_preco && p.valor_total > 0 && <span className="block text-[11px] text-amber-600">item sem preço</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge className={`${COR_STATUS[p.status]} border-0`}>{STATUS_PEDIDO[p.status]}</Badge>
                        {p.tem_epi && <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" /> EPI</Badge>}
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
          teto={postos.find(x => x.id === pedidoAberto.posto_id)?.teto_material ?? null}
          materiais={materiais} minhaVez={minhaVez(pedidoAberto)}
          podeCancelar={['enviada', 'devolvida', 'a_atender'].includes(pedidoAberto.status) && temPapel(['compras', 'gerencia'], pedidoAberto)}
          repeticao={recorrencias.find(r => r.origem_pedido_id === pedidoAberto.id || r.id === pedidoAberto.recorrencia_id)}
          podeRepetir={!['cancelada', 'devolvida'].includes(pedidoAberto.status) && temPapel(['supervisor', 'gerencia'], pedidoAberto)}
          podeEncerrarRepeticao={temPapel(['supervisor', 'compras', 'gerencia'], pedidoAberto)}
          onRepeticao={carregar}
          onFechar={() => setAberto(null)} onAtualizado={async () => { setAberto(null); await carregar(); window.dispatchEvent(new Event('pedidos-atualizados')); }} />
      )}
    </div>
  );
}

function DetalhePedido({ pedido: p, posto, teto, materiais, minhaVez, podeCancelar, repeticao, podeRepetir,
  podeEncerrarRepeticao, onRepeticao, onFechar, onAtualizado }: {
  pedido: PedidoCompleto; posto: string; teto: number | null; materiais: Material[];
  minhaVez: boolean; podeCancelar: boolean;
  repeticao: Recorrencia | undefined; podeRepetir: boolean; podeEncerrarRepeticao: boolean; onRepeticao: () => Promise<void>;
  onFechar: () => void; onAtualizado: () => Promise<void>;
}) {
  const conferindo = minhaVez && p.status === 'enviada';
  const atendendo = minhaVez && p.status === 'a_atender';
  // Na conferência, a coluna editável é a quantidade conferida; no atendimento, a entregue.
  const [quantidades, setQuantidades] = useState<Record<string, string>>(
    Object.fromEntries(p.itens.map(i => [i.id, String(i.quantidade).replace('.', ',')])));
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const mat = (id: string) => materiais.find(m => m.id === id);
  const nome = (id: string) => nomeMaterial(mat(id), materiais);

  const digitada = (id: string, original: number) => {
    const v = n(quantidades[id] ?? '');
    return quantidades[id] !== '' && Number.isFinite(v) ? v : original;
  };
  const mudados = p.itens.filter(i => digitada(i.id, i.quantidade) !== i.quantidade);
  // Valor: na conferência acompanha o que está sendo digitado; fora dela, o conferido.
  const qtdValor = (i: PedidoCompleto['itens'][number]) => (conferindo ? digitada(i.id, i.quantidade) : i.quantidade);
  const comPreco = p.itens.some(i => i.preco_unit != null);
  const totalAgora = p.itens.reduce((s, i) => s + qtdValor(i) * (i.preco_unit ?? 0), 0);
  const [gastoMes, setGastoMes] = useState<number | null>(null);
  useEffect(() => {
    if (teto == null) return;
    gastoDoMesNoBanco(p.posto_id, p.data_pedido).then(setGastoMes).catch(() => setGastoMes(null));
  }, [teto, p.posto_id, p.data_pedido]);
  // Preço do mesmo item no último pedido antes deste, para comparar com o preço deste pedido.
  const [anteriores, setAnteriores] = useState<PrecoAnterior[]>([]);
  useEffect(() => { if (comPreco) precosAnteriores(p.id).then(setAnteriores).catch(() => setAnteriores([])); }, [comPreco, p.id]);
  const anterior = (materialId: string) => anteriores.find(a => a.material_id === materialId);
  // Média dos últimos 3 pedidos do posto (antes deste), para ver se o pedido foge do normal.
  const [media3, setMedia3] = useState<MediaUltimos | null>(null);
  // E a comparação item a item com o pedido anterior do posto (o mais recente dos 3).
  const [comp, setComp] = useState<Comparacao | null>(null);
  useEffect(() => {
    ultimosPedidosDoPosto(p.posto_id, p.created_at)
      .then(l => { setMedia3(mediaUltimos(l)); setComp(compararComAnterior(p.itens, l[0])); })
      .catch(() => { setMedia3(null); setComp(null); });
  }, [p.posto_id, p.created_at, p.itens]);
  const variacoes = p.itens.map(i => variacaoPreco(anterior(i.material_id)?.preco_anterior ?? null, i.preco_unit)).filter((v): v is number => v != null);
  const subiram = variacoes.filter(v => v > 0);
  const cairam = variacoes.filter(v => v < 0);
  // Gasto do mês com este pedido do jeito que está na tela (cancelado não conta).
  const gastoComEste = gastoMes == null ? null : gastoMes - (p.status === 'cancelada' ? 0 : p.valor_total) + (p.status === 'cancelada' ? 0 : totalAgora);
  // Na conferência, excluir o item = conferir 0 (o banco tira o item do pedido e guarda no histórico).
  const excluido = (id: string) => conferindo && quantidades[id] === '0';
  const excluir = (id: string, original: number) =>
    setQuantidades(q => ({ ...q, [id]: q[id] === '0' ? String(original).replace('.', ',') : '0' }));

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setSalvando(true);
    try { await fn(); toast.success(ok); await onAtualizado(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  const lerQuantidades = () => {
    const lista: { item_id: string; quantidade: number }[] = [];
    for (const i of p.itens) {
      const q = digitada(i.id, i.quantidade);
      if (!(q >= 0)) { toast.error(`Quantidade inválida em ${nome(i.material_id)}.`); return null; }
      if (q !== i.quantidade) lista.push({ item_id: i.id, quantidade: q });
    }
    return lista;
  };

  const conferir = (conferido: boolean) => {
    if (!conferido) {
      if (!comentario.trim()) return toast.error('Escreva o motivo da devolução.');
      return agir(() => conferirPedido(p.id, false, comentario), 'Pedido devolvido ao encarregado.');
    }
    if (p.itens.every(i => excluido(i.id))) return toast.error('Todos os itens foram excluídos. Para não atender, devolva com o motivo.');
    const ajustes = lerQuantidades();
    if (ajustes) agir(() => conferirPedido(p.id, true, comentario, ajustes), 'Conferido. Segue para compras atender.');
  };

  const atender = () => {
    const entregues = lerQuantidades();
    if (!entregues) return;
    if (entregues.length && !comentario.trim()) return toast.error('A entrega é diferente do conferido. Escreva o motivo no comentário.');
    agir(() => atenderPedido(p.id, comentario, entregues), entregues.length ? 'Atendido com entrega parcial.' : 'Pedido atendido.');
  };

  const cancelar = () => {
    if (!comentario.trim()) return toast.error('Escreva o motivo do cancelamento no campo abaixo.');
    agir(() => cancelarPedido(p.id, comentario), 'Pedido cancelado.');
  };

  const etapaFeita = (s: StatusPedido) => p.eventos.some(e => e.para_status === s);
  const editando = conferindo || atendendo;

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ClipboardList className="h-5 w-5 text-primary" /> {p.codigo}
            <Badge className={`${COR_STATUS[p.status]} border-0`}>{STATUS_PEDIDO[p.status]}</Badge>
            {p.tem_epi && <Badge variant="outline" className="gap-1"><HardHat className="h-3 w-3" /> Tem item de EPI</Badge>}
            {p.tem_epi && <SeloTermoEpi pedidoId={p.id} />}
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
          {ETAPAS.map((s, i) => {
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

        {['enviada', 'devolvida', 'a_atender'].includes(p.status) && <AnaliseEstoque pedidoId={p.id} materiais={materiais} />}

        {comPreco && variacoes.length > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {subiram.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive">
                <TrendingUp className="h-4 w-4" /> {subiram.length} item(ns) mais caro(s) que na última compra (maior alta: +{Math.max(...subiram).toLocaleString('pt-BR')}%)
              </span>
            )}
            {cairam.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400">
                <TrendingDown className="h-4 w-4" /> {cairam.length} item(ns) mais barato(s)
              </span>
            )}
            {subiram.length === 0 && cairam.length === 0 && <span className="text-muted-foreground">Preços iguais aos da última compra de cada item.</span>}
          </div>
        )}
        {media3 && media3.pedidos > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium">Média dos últimos {media3.pedidos} pedido(s) do posto:</span>
            {media3.valorMedio != null && comPreco && (() => {
              const dif = media3.valorMedio ? Math.round(((totalAgora - media3.valorMedio) / media3.valorMedio) * 1000) / 10 : null;
              return (
                <span>
                  valor médio <strong className="tabular-nums">{reais(media3.valorMedio)}</strong> · este pedido <strong className="tabular-nums">{reais(totalAgora)}</strong>
                  {dif != null && dif !== 0 && (
                    <span className={`ml-1 font-semibold ${dif > 50 ? 'text-destructive' : dif > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      ({dif > 0 ? '+' : ''}{dif.toLocaleString('pt-BR')}%)
                    </span>
                  )}
                </span>
              );
            })()}
            <span className="text-xs text-muted-foreground">Coluna "Média últ. 3": quantidade média de cada item por pedido (pedido sem o item conta 0).</span>
          </div>
        )}
        {comp && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium">Comparado ao pedido anterior {comp.anterior.codigo} ({dataBr(comp.anterior.data)}):</span>
            {comp.iguais > 0 && <span>{comp.iguais} igual(is)</span>}
            {comp.aumentaram > 0 && <span className="text-amber-700 dark:text-amber-400 font-medium">{comp.aumentaram} aumentou(aram)</span>}
            {comp.diminuiram > 0 && <span className="text-emerald-700 dark:text-emerald-400 font-medium">{comp.diminuiram} diminuiu(íram)</span>}
            {comp.novos > 0 && <span className="text-primary font-medium">{comp.novos} novo(s)</span>}
            {comp.sairam.length > 0 && <span className="text-muted-foreground">{comp.sairam.length} saiu(íram)</span>}
            <span className="text-muted-foreground">· quantidade total {formatarNumero(comp.totalAntes)} → <strong className="text-foreground">{formatarNumero(comp.totalAgora)}</strong></span>
          </div>
        )}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right">Média últ. 3<span className="block text-[10px] font-normal">pedidos do posto</span></TableHead>
              <TableHead className="text-right">Pedido anterior<span className="block text-[10px] font-normal">{comp ? comp.anterior.codigo : 'do posto'}</span></TableHead>
              <TableHead className="text-right w-28">Conferido</TableHead>
              <TableHead className="text-right w-28">Entregue</TableHead>
              {comPreco && <TableHead className="text-right">Preço anterior<span className="block text-[10px] font-normal">última compra</span></TableHead>}
              {comPreco && <TableHead className="text-right">Preço atual<span className="block text-[10px] font-normal">deste pedido</span></TableHead>}
              {comPreco && <TableHead className="text-right">Variação</TableHead>}
              {comPreco && <TableHead className="text-right">Valor</TableHead>}
              {conferindo && <TableHead className="w-12"><span className="sr-only">Excluir</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.itens.map(i => {
              const m = mat(i.material_id);
              const campo = (
                <Input className="h-8 text-right" inputMode="decimal" aria-label={`${conferindo ? 'Quantidade conferida' : 'Quantidade entregue'} de ${nome(i.material_id)}`}
                  value={quantidades[i.id] ?? ''} onChange={e => setQuantidades(q => ({ ...q, [i.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
              );
              const entregue = i.quantidade_atendida;
              const fora = excluido(i.id);
              return (
                <TableRow key={i.id} className={fora ? 'opacity-60' : undefined}>
                  <TableCell className={fora ? 'line-through' : undefined}>
                    {nomeMaterial(m, materiais)} <span className="text-xs text-muted-foreground">{m?.unidade}</span>
                    {m?.is_epi && <HardHat className="inline h-3.5 w-3.5 ml-1 text-amber-600" aria-label="EPI" />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarNumero(i.quantidade_pedida)}</TableCell>
                  {(() => {
                    const md = media3?.porItem.get(i.material_id);
                    const media = media3 && media3.pedidos > 0 ? (md?.media ?? 0) : undefined;
                    const acima = acimaDaMedia(i.quantidade_pedida, media);
                    return (
                      <TableCell className="text-right tabular-nums whitespace-nowrap"
                        title={md ? md.valores.map(v => `${v.codigo} (${dataBr(v.data)}): ${formatarNumero(v.quantidade)}`).join('\n') : media3?.pedidos ? 'Não veio nos últimos pedidos' : undefined}>
                        {media == null ? <span className="text-xs text-muted-foreground">sem pedido antes</span> : (
                          <span className={acima ? 'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold' : 'text-muted-foreground'}>
                            {acima && <TrendingUp className="h-3 w-3" />}{formatarNumero(media)}
                          </span>
                        )}
                      </TableCell>
                    );
                  })()}
                  {(() => {
                    const c = comp?.porItem.get(i.material_id);
                    if (!comp || !c) return <TableCell className="text-right"><span className="text-xs text-muted-foreground">sem pedido antes</span></TableCell>;
                    return (
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {c.novo ? <span className="rounded px-1.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold">novo</span> : (
                          <>
                            <span className="text-muted-foreground">{formatarNumero(c.antes)}</span>
                            <span className={`ml-1.5 text-xs font-semibold ${c.dif > 0 ? 'text-amber-700 dark:text-amber-400' : c.dif < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {c.dif > 0 ? `+${formatarNumero(c.dif)}` : c.dif < 0 ? `−${formatarNumero(-c.dif)}` : '='}
                            </span>
                          </>
                        )}
                      </TableCell>
                    );
                  })()}
                  <TableCell className="text-right tabular-nums">{conferindo ? (fora ? <span className="text-xs text-destructive">excluído</span> : campo) : p.status === 'enviada' || p.status === 'devolvida' ? '—' : formatarNumero(i.quantidade)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {atendendo ? campo : entregue == null ? '—' : (
                      <span className={entregue !== i.quantidade ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>{formatarNumero(entregue)}</span>
                    )}
                  </TableCell>
                  {comPreco && (() => {
                    const ant = anterior(i.material_id);
                    return (
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap"
                        title={ant?.codigo_anterior ? `${ant.codigo_anterior} de ${dataBr(ant.data_anterior ?? '')}` : undefined}>
                        {ant?.preco_anterior == null ? <span className="text-xs">sem compra antes</span> : reais(ant.preco_anterior)}
                        {ant?.data_anterior && <span className="block text-[10px]">{dataBr(ant.data_anterior)}</span>}
                      </TableCell>
                    );
                  })()}
                  {comPreco && (
                    <TableCell className="text-right tabular-nums text-sm whitespace-nowrap font-medium">{i.preco_unit == null ? <span className="text-amber-600 text-xs">sem preço</span> : reais(i.preco_unit)}</TableCell>
                  )}
                  {comPreco && (() => {
                    const v = variacaoPreco(anterior(i.material_id)?.preco_anterior ?? null, i.preco_unit);
                    return (
                      <TableCell className="text-right tabular-nums text-sm whitespace-nowrap">
                        {v == null ? <span className="text-muted-foreground">—</span>
                          : v === 0 ? <span className="text-muted-foreground">0%</span>
                            : <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold ${v > 0 ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                              {v > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{v > 0 ? '+' : ''}{v.toLocaleString('pt-BR')}%
                            </span>}
                      </TableCell>
                    );
                  })()}
                  {comPreco && (
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{i.preco_unit == null || fora ? '—' : reais(qtdValor(i) * i.preco_unit)}</TableCell>
                  )}
                  {conferindo && (
                    <TableCell className="p-1 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                        title={fora ? 'Desfazer exclusão' : 'Excluir item do pedido'}
                        aria-label={`${fora ? 'Desfazer exclusão de' : 'Excluir do pedido'} ${nome(i.material_id)}`}
                        onClick={() => excluir(i.id, i.quantidade)}>
                        {fora ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {comPreco && (
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={9} className="text-right text-xs font-semibold uppercase text-muted-foreground">Total do pedido</TableCell>
                <TableCell className="text-right tabular-nums font-bold whitespace-nowrap">{reais(totalAgora)}</TableCell>
                {conferindo && <TableCell />}
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
        {comp && comp.sairam.length > 0 && (
          <div className="rounded-md border border-dashed px-3 py-2 text-sm">
            <span className="font-medium">Estavam no pedido anterior ({comp.anterior.codigo}) e não estão neste:</span>{' '}
            {comp.sairam.map((x, k) => (
              <span key={x.material_id} className="text-muted-foreground">
                {k > 0 && ' · '}{nome(x.material_id)} ({formatarNumero(x.antes)} {mat(x.material_id)?.unidade ?? ''})
              </span>
            ))}
          </div>
        )}
        {comPreco && <p className="text-xs text-muted-foreground">Preço anterior = preço do mesmo item na última compra (último pedido atendido antes deste, de qualquer posto). Preço atual = o deste pedido.</p>}
        {p.sem_preco && comPreco && <p className="text-xs text-amber-600">Há item sem preço: ele fica fora do total. Cadastre o preço em Configurações de Pedidos → Itens.</p>}
        {teto != null && gastoComEste != null && (() => {
          const passou = gastoComEste > teto;
          const pct = teto > 0 ? Math.round((gastoComEste / teto) * 100) : null;
          return (
            <div className={`rounded-md border px-3 py-2 text-sm ${passou ? 'border-destructive/50 bg-destructive/10' : ''}`}>
              <p className={passou ? 'font-semibold text-destructive' : 'font-medium'}>
                {passou ? 'Teto do posto ultrapassado' : 'Teto do posto'} em {p.data_pedido.slice(5, 7)}/{p.data_pedido.slice(0, 4)}:
                {' '}{reais(gastoComEste)} de {reais(teto)}{pct != null && ` (${pct}%)`}
              </p>
              <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${passou ? 'bg-destructive' : pct != null && pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Soma dos pedidos do posto no mês{conferindo ? ', já com as quantidades desta conferência' : ''}.
                {passou ? ' Comercial e Gerência recebem um e-mail; o pedido segue normal.' : ` Sobra ${reais(teto - gastoComEste)}.`}
              </p>
            </div>
          );
        })()}
        {conferindo && <p className="text-xs text-muted-foreground">Para tirar um item do pedido, use a lixeira (ou confira 0). A exclusão fica no histórico.</p>}
        {atendendo && <p className="text-xs text-muted-foreground">A coluna "Entregue" vem com o conferido. Se for entregar menos, corrija e explique no comentário.</p>}
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
                      <strong>{STATUS_PEDIDO[e.para_status] ?? e.para_status}</strong>
                      {e.usuario_nome && ` — ${e.usuario_nome}`}{e.papel && ` (${rotuloPapel(e.papel)})`}
                      {e.comentario && <span className="block text-muted-foreground">“{e.comentario}”</span>}
                    </>
                  )}
                  {e.payload?.ajustes?.length ? (
                    <span className="block text-muted-foreground text-xs">
                      {e.para_status === 'atendida' ? 'Entregue diferente do conferido' : 'Ajustes'}: {e.payload.ajustes.map(a => e.para_status !== 'atendida' && Number(a.para) === 0 ? `${a.item}: excluído` : `${a.item}: ${formatarNumero(Number(a.de))} → ${formatarNumero(Number(a.para))}`).join('; ')}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {(editando || podeCancelar) && (
          <div className="space-y-2">
            <Label htmlFor="coment">
              {conferindo ? 'Comentário (obrigatório para devolver)' : atendendo ? `Comentário${mudados.length ? ' (obrigatório: entrega diferente do conferido)' : ''}` : 'Comentário'}
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
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Conferido — mandar para compras
            </Button>
          </>}
          {atendendo && (
            <Button className="gap-2" disabled={salvando} onClick={atender}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} {mudados.length ? 'Atender com entrega parcial' : 'Pedido atendido'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
