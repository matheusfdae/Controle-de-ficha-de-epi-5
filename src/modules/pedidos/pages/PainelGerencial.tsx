import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ClipboardList, Clock, FileDown, HardHat, Loader2, PackageMinus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { listPostos, type Posto } from '@/services/postosService';
import { formatarNumero, hojeBr, listMateriais, listPedidos, reais, type Material, type PedidoCompleto } from '../lib/pedidosService';
import { gastoTeto, indicadores, mesesAte, pedidosPorMes, porEtapa, porPosto, rotuloMes, tempoPorEtapa, topItens } from '../lib/gerencial';
import BarrasPostos3D from '../components/BarrasPostos3D';
import RelatorioTetoPosto, { type PostoTeto } from '../components/RelatorioTetoPosto';
import { pdfPedidosDoMes, pdfPedidosDoPosto, pdfTetoPorPosto } from '../lib/relatoriosPdf';

/**
 * Painel Gerencial dos pedidos de material: indicadores do mês, gasto de cada
 * posto contra o teto, pedidos por posto em barras 3D e gráficos de andamento, itens mais
 * pedidos e tempos de conferência e atendimento.
 */

function Indicador({ titulo, valor, detalhe, icone: Icone, destaque }: {
  titulo: string; valor: string; detalhe?: ReactNode; icone: typeof Clock; destaque?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <span className="rounded-md bg-primary/10 p-1.5"><Icone className="h-4 w-4 text-primary" /></span>
        </div>
        <p className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${destaque ?? ''}`}>{valor}</p>
        {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
      </CardContent>
    </Card>
  );
}

function Grafico({ titulo, descricao, children, tabela }: { titulo: string; descricao?: string; children: ReactNode; tabela?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
        {tabela && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">Ver os números em tabela</summary>
            <div className="mt-2">{tabela}</div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

const diasTxt = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia${v === 1 ? '' : 's'}`);

export default function PainelGerencial() {
  const navigate = useNavigate();
  const [mes, setMes] = useState(hojeBr().slice(0, 7));
  const [uf, setUf] = useState('todos');
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, po, m] = await Promise.all([listPedidos(`${mesesAte(mes, 6)[0]}-01`), listPostos(), listMateriais()]);
      setPedidos(p); setPostos(po); setMateriais(m);
    } catch (e) {
      toast.error('Erro ao carregar o painel: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  // Séries pelas variáveis --g-s1/--g-s2 (claro/escuro definidas no contêiner): trocam junto com o tema.
  const cor = { s1: 'var(--g-s1)', s2: 'var(--g-s2)', eixo: 'hsl(var(--muted-foreground))', grade: 'hsl(var(--border))' };
  const dica = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))', fontSize: 12 };

  const ufs = [...new Set(postos.map(p => p.uf))].sort();
  const postosUf = useMemo(() => postos.filter(p => uf === 'todos' || p.uf === uf), [postos, uf]);
  const pedidosUf = useMemo(() => pedidos.filter(p => uf === 'todos' || p.uf === uf), [pedidos, uf]);
  const meses = mesesAte(mes, 6);

  const linhas = useMemo(() => porPosto(pedidosUf, postosUf, mes), [pedidosUf, postosUf, mes]);
  const k = useMemo(() => indicadores(pedidosUf, mes, meses[4]), [pedidosUf, mes, meses]);
  const mensal = useMemo(() => pedidosPorMes(pedidosUf, meses), [pedidosUf, meses]);
  const etapas = useMemo(() => porEtapa(pedidosUf), [pedidosUf]);
  const itens = useMemo(() => topItens(pedidosUf, materiais, mes), [pedidosUf, materiais, mes]);
  const tempos = useMemo(() => tempoPorEtapa(pedidosUf), [pedidosUf]);
  const tetos = useMemo(() => gastoTeto(pedidosUf, postosUf, mes), [pedidosUf, postosUf, mes]);
  const gastoTotal = tetos.reduce((s, l) => s + l.gasto, 0);
  const acima = tetos.filter(l => l.passou).length;
  const mesAtual = mes === hojeBr().slice(0, 7);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const pdf = async (fn: () => Promise<unknown>) => {
    setGerandoPdf(true);
    try { await fn(); } catch (e) { toast.error('Não foi possível gerar o PDF: ' + (e as Error).message); } finally { setGerandoPdf(false); }
  };
  const doMesUf = () => pedidosUf.filter(p => p.data_pedido.slice(0, 7) === mes);
  const pdfPosto = (id: string) => {
    const po = postos.find(x => x.id === id);
    if (po) pdf(() => pdfPedidosDoPosto(po, doMesUf().filter(p => p.posto_id === id), materiais, mes));
  };

  const delta = k.pedidosAnterior ? Math.round(((k.pedidos - k.pedidosAnterior) / k.pedidosAnterior) * 1000) / 10 : null;
  const DeltaIcone = delta != null && delta > 0 ? ArrowUpRight : ArrowDownRight;
  const abrirPosto = (id: string) => navigate(`/pedidos/posto/${id}?mes=${mes}`);
  // Clique no quadro de teto: relatório do ano no modelo da planilha.
  const [relTeto, setRelTeto] = useState<PostoTeto | null>(null);
  const abrirTeto = (id: string) => {
    const po = postos.find(x => x.id === id);
    if (po) setRelTeto({ id: po.id, nome: po.nome, uf: po.uf, teto_material: po.teto_material });
  };

  return (
    <div className="p-4 lg:p-8 pb-20 [--g-s1:#2a78d6] [--g-s2:#eb6834] dark:[--g-s1:#3987e5] dark:[--g-s2:#d95926]">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Painel Gerencial" eyebrow="Pedidos"
          description="Gasto de cada posto contra o teto, quantos pedidos cada posto fez, o andamento, os itens mais pedidos e o tempo de conferência e de atendimento." />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mes-ger">Mês</Label>
            <Input id="mes-ger" type="month" value={mes} max={hojeBr().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os estados</SelectItem>
                {ufs.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 ml-auto" disabled={carregando || gerandoPdf}>
                {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Relatórios em PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{rotuloMes(mes)} · {uf === 'todos' ? 'todos os estados' : uf}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => pdf(() => pdfTetoPorPosto(tetos, mes, uf))}>Teto x gasto por posto</DropdownMenuItem>
              <DropdownMenuItem onClick={() => pdf(() => pdfPedidosDoMes(doMesUf(), postos, materiais, mes, uf))}>Pedidos do mês (todos)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Pedidos de um posto no mês: use o ícone de PDF na linha do posto, no quadro de teto.</DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Indicador titulo={`Pedidos em ${rotuloMes(mes)}`} valor={`${k.pedidos}`} icone={ClipboardList}
            detalhe={delta == null ? 'sem pedidos no mês anterior' : (
              <span className="flex items-center gap-0.5"><DeltaIcone className="h-3 w-3" />{delta > 0 ? '+' : ''}{delta.toLocaleString('pt-BR')}% vs {rotuloMes(meses[4])}</span>
            )} />
          <Indicador titulo="Em andamento agora" valor={`${k.emAndamento}`} icone={Clock} detalhe="conferência ou a atender" />
          <Indicador titulo="Atendidos no mês" valor={`${k.atendidos}`} icone={CheckCircle2} detalhe={`do pedido ao atendimento: ${diasTxt(k.diasAtendimento)}`} />
          <Indicador titulo="Entregas parciais" valor={`${k.parciais}`} icone={PackageMinus} destaque={k.parciais ? 'text-amber-600 dark:text-amber-400' : ''}
            detalhe="compras entregou menos que o conferido" />
          <Indicador titulo="Devolvidos ao encarregado" valor={`${k.devolvidos}`} icone={Undo2} detalhe="pedidos do mês que voltaram para correção" />
          <Indicador titulo="Pedidos com EPI" valor={`${k.comEpi}`} icone={HardHat} detalhe="no mês" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Teto de gasto por posto — {rotuloMes(mes)}</CardTitle>
            <CardDescription>
              Gasto = soma do valor dos pedidos feitos no mês{mesAtual ? ` até hoje (${hojeBr().split('-').reverse().join('/')})` : ''}, sem os cancelados.
              O teto de cada posto fica em Configurações de Pedidos → Itens por posto. Clique num posto para ver o relatório do ano (previsto, realizado e variação por mês).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Gasto no mês: <strong className="tabular-nums">{reais(gastoTotal)}</strong></span>
              <span>Postos com teto: <strong>{tetos.filter(l => l.teto != null).length}</strong></span>
              <span className={acima ? 'text-destructive font-semibold' : ''}>Acima do teto: <strong>{acima}</strong></span>
            </div>
            {tetos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum posto com teto ou com gasto neste mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Posto</TableHead><TableHead className="text-right">Teto mensal</TableHead><TableHead className="text-right">Gasto no mês</TableHead>
                    <TableHead className="min-w-48">Uso do teto</TableHead><TableHead className="text-right">Sobra / passou</TableHead><TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="w-10"><span className="sr-only">PDF</span></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {tetos.map(l => (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => abrirTeto(l.id)}>
                        <TableCell className="font-medium">{l.nome} <span className="text-xs text-muted-foreground">{l.uf}</span>
                          {l.semPreco > 0 && <span className="block text-[11px] text-amber-600">{l.semPreco} pedido(s) com item sem preço</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{l.teto == null ? <span className="text-muted-foreground text-xs">sem teto</span> : reais(l.teto)}</TableCell>
                        <TableCell className={`text-right tabular-nums whitespace-nowrap ${l.passou ? 'text-destructive font-semibold' : ''}`}>{reais(l.gasto)}</TableCell>
                        <TableCell>
                          {l.pct == null ? <span className="text-xs text-muted-foreground">—</span> : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full ${l.passou ? 'bg-destructive' : l.pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, l.pct)}%` }} />
                              </div>
                              <span className={`w-14 text-right text-xs tabular-nums ${l.passou ? 'text-destructive font-semibold' : ''}`}>{l.pct.toLocaleString('pt-BR')}%</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums whitespace-nowrap text-sm ${l.passou ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                          {l.teto == null ? '—' : l.passou ? `passou ${reais(l.gasto - l.teto)}` : `sobra ${reais(l.teto - l.gasto)}`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.pedidos}</TableCell>
                        <TableCell className="p-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={gerandoPdf} title="PDF dos pedidos do posto no mês"
                            aria-label={`PDF dos pedidos de ${l.nome} no mês`} onClick={e => { e.stopPropagation(); pdfPosto(l.id); }}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pedidos por posto — {rotuloMes(mes)}</CardTitle>
            <CardDescription>Do posto que menos pediu ao que mais pediu. Clique numa barra para ver todos os pedidos do posto no mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarrasPostos3D linhas={linhas} onEscolher={l => abrirPosto(l.id)} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Grafico titulo="Pedidos feitos e atendidos — últimos 6 meses" descricao="Feitos: pela data do pedido. Atendidos: pela data do atendimento."
            tabela={(
              <Table>
                <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead className="text-right">Feitos</TableHead><TableHead className="text-right">Atendidos</TableHead></TableRow></TableHeader>
                <TableBody>{mensal.map(m => (
                  <TableRow key={m.mes}><TableCell>{m.rotulo}</TableCell><TableCell className="text-right tabular-nums">{m.pedidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.atendidos}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mensal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={cor.grade} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={{ stroke: cor.grade }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pedidos" name="Feitos" fill={cor.s1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="atendidos" name="Atendidos" fill={cor.s2} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Grafico>

          <Grafico titulo="Pedidos em cada etapa agora" descricao="Onde os pedidos em andamento estão parados.">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={etapas} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={cor.grade} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="rotulo" width={170} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [v, 'Pedidos']} contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar dataKey="pedidos" name="Pedidos" fill={cor.s1} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  <LabelList dataKey="pedidos" position="right" style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Grafico>

          <Grafico titulo={`Itens mais pedidos em ${rotuloMes(mes)}`} descricao="Em quantos pedidos o item apareceu; ao lado, a quantidade somada."
            tabela={(
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Quantidade</TableHead></TableRow></TableHeader>
                <TableBody>{itens.map(i => (
                  <TableRow key={i.id}><TableCell>{i.nome}</TableCell><TableCell className="text-right tabular-nums">{i.pedidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarNumero(i.quantidade)} {i.unidade}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}>
            {itens.length === 0 ? <p className="text-sm text-muted-foreground py-16 text-center">Sem pedidos neste mês.</p> : (
              <ResponsiveContainer width="100%" height={Math.max(160, itens.length * 34)}>
                <BarChart data={itens} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={cor.grade} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nome" width={180} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number, _n, item) => [`${v} pedido(s) · ${formatarNumero(item.payload.quantidade)} ${item.payload.unidade}`, 'Item']}
                    contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                  <Bar dataKey="pedidos" name="Pedidos" fill={cor.s2} radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="quantidade" position="right"
                      formatter={(v: number) => formatarNumero(v)} style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Grafico>

          <Grafico titulo="Tempo médio em cada etapa" descricao="Dias entre o pedido chegar na etapa e sair dela (últimos 6 meses).">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={tempos} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={cor.grade} />
                <XAxis type="number" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`} />
                <YAxis type="category" dataKey="rotulo" width={180} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number, _n, item) => [`${v.toLocaleString('pt-BR')} dias (${item.payload.pedidos} pedidos)`, 'Média']} contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar dataKey="dias" name="Dias" fill={cor.s1} radius={[0, 4, 4, 0]} maxBarSize={24}>
                  <LabelList dataKey="dias" position="right" formatter={(v: number | null) => diasTxt(v)} style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Grafico>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ranking dos postos em {rotuloMes(mes)}</CardTitle>
            <CardDescription>Do posto que mais pediu ao que menos pediu. Clique para ver os pedidos.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posto</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Atendidos</TableHead>
                  <TableHead className="text-right">Parciais</TableHead>
                  <TableHead className="text-right">Devolvidos</TableHead>
                  <TableHead className="text-right">Em andamento</TableHead>
                  <TableHead className="text-right">Tempo até atender</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pedido em {rotuloMes(mes)}.</TableCell></TableRow>}
                {linhas.map(l => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => abrirPosto(l.id)}>
                    <TableCell className="font-medium">{l.nome} <span className="text-xs text-muted-foreground">{l.uf}</span></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{l.pedidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.linhas}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.atendidos}</TableCell>
                    <TableCell className={`text-right tabular-nums ${l.parciais ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>{l.parciais}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.devolvidos}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.emAndamento}</TableCell>
                    <TableCell className="text-right tabular-nums">{diasTxt(l.diasAtendimento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <RelatorioTetoPosto posto={relTeto} ano={Number(mes.slice(0, 4))} onFechar={() => setRelTeto(null)}
        onVerPedidos={id => { setRelTeto(null); abrirPosto(id); }} />
    </div>
  );
}
