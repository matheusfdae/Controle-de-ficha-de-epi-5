import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, HandCoins, Loader2, MinusCircle, Package, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { listPostos, type Posto } from '@/services/postosService';
import {
  classificarVariacao, formatarMoeda, hojeBr, listMateriais, listPedidos, listPrecos, listTetos,
  type LinhaPreco, type Material, type PedidoCompleto, type TetoPosto,
} from '../lib/pedidosService';
import {
  COR_SITUACAO, ROTULO_SITUACAO, gastoMensal, indicadores, mesesAte, porEtapa, porPosto, rotuloMes, tempoPorEtapa, topItens,
  type LinhaPosto, type Situacao,
} from '../lib/gerencial';
import BarrasPostos3D from '../components/BarrasPostos3D';

/**
 * Painel Gerencial dos pedidos de material: indicadores do mês, vista 3D dos
 * postos (gasto x teto) e gráficos analíticos (gasto mensal, etapas, itens,
 * tempos, preços). Os gráficos de números ficam em 2D para a leitura ser exata.
 */

const ICONE_SITUACAO: Record<Situacao, typeof CheckCircle2> = { ok: CheckCircle2, atencao: AlertTriangle, acima: AlertTriangle, sem_teto: MinusCircle };
const moedaCurta = (v: number) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`);
const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

function Indicador({ titulo, valor, detalhe, icone: Icone, destaque }: {
  titulo: string; valor: string; detalhe?: ReactNode; icone: typeof Wallet; destaque?: string;
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

export default function PainelGerencial() {
  const navigate = useNavigate();
  const [mes, setMes] = useState(hojeBr().slice(0, 7));
  const [uf, setUf] = useState('todos');
  const [pedidos, setPedidos] = useState<PedidoCompleto[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [tetos, setTetos] = useState<TetoPosto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [precos, setPrecos] = useState<LinhaPreco[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const inicio = `${mesesAte(mes, 6)[0]}-01`;
      const hoje = hojeBr();
      const d90 = new Date(Date.parse(hoje + 'T12:00:00Z') - 90 * 864e5).toISOString().slice(0, 10);
      const [p, po, t, m, pr] = await Promise.all([listPedidos(inicio), listPostos(), listTetos(), listMateriais(), listPrecos(d90, hoje)]);
      setPedidos(p); setPostos(po); setTetos(t); setMateriais(m); setPrecos(pr);
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

  const linhas = useMemo(() => porPosto(pedidosUf, postosUf, tetos, mes), [pedidosUf, postosUf, tetos, mes]);
  const k = useMemo(() => indicadores(pedidosUf, linhas, mes, meses[4]), [pedidosUf, linhas, mes, meses]);
  const mensal = useMemo(() => gastoMensal(pedidosUf, postosUf, tetos, meses), [pedidosUf, postosUf, tetos, meses]);
  const etapas = useMemo(() => porEtapa(pedidosUf), [pedidosUf]);
  const itens = useMemo(() => topItens(pedidosUf, materiais, mes), [pedidosUf, materiais, mes]);
  const tempos = useMemo(() => tempoPorEtapa(pedidosUf), [pedidosUf]);
  const variacoes = useMemo(() => {
    const doUf = precos.filter(l => uf === 'todos' || !l.pedido_id || pedidosUf.some(p => p.id === l.pedido_id));
    const cl = doUf.map(l => ({ ...l, ...classificarVariacao(l.valor_unitario, l.valor_anterior) }));
    return {
      aumentou: cl.filter(l => l.tipo === 'aumentou').length, manteve: cl.filter(l => l.tipo === 'manteve').length,
      baixou: cl.filter(l => l.tipo === 'baixou').length,
      maiores: cl.filter(l => l.tipo === 'aumentou').sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0)).slice(0, 5),
    };
  }, [precos, uf, pedidosUf]);

  const delta = k.gastoAnterior ? Math.round(((k.gasto - k.gastoAnterior) / k.gastoAnterior) * 1000) / 10 : null;
  const DeltaIcone = delta != null && delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="p-4 lg:p-8 pb-20 [--g-s1:#2a78d6] [--g-s2:#eb6834] dark:[--g-s1:#3987e5] dark:[--g-s2:#d95926]">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Painel Gerencial" eyebrow="Pedidos"
          description="Gasto, teto, andamento e preços dos pedidos de material. Gasto = pedidos aprovados (a faturar ou faturados) no mês da aprovação, fora os cobrados do cliente." />

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
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Indicador titulo={`Gasto em ${rotuloMes(mes)}`} valor={formatarMoeda(k.gasto)} icone={Wallet}
            detalhe={delta == null ? 'sem gasto no mês anterior' : (
              <span className="flex items-center gap-0.5"><DeltaIcone className="h-3 w-3" />
                {delta > 0 ? '+' : ''}{pct(delta)} vs {rotuloMes(meses[4])}</span>
            )} />
          <Indicador titulo="Uso do teto somado" valor={pct(k.usoTeto)} icone={Package}
            detalhe={`${k.postosComTeto} posto(s) com teto`} />
          <Indicador titulo="Postos acima do teto" valor={`${k.postosAcima}`} icone={AlertTriangle}
            destaque={k.postosAcima ? 'text-destructive' : ''} detalhe={`excesso: ${k.excessoAprovado} aprovado(s), ${k.excessoReprovado} reprovado(s)`} />
          <Indicador titulo="Pedidos no mês" valor={`${k.pedidosNoMes}`} icone={Package} detalhe={`${k.emAberto} em andamento agora`} />
          <Indicador titulo="Do pedido ao faturamento" valor={k.tempoAteFaturar == null ? '—' : `${k.tempoAteFaturar.toLocaleString('pt-BR')} dias`}
            icone={Clock} detalhe="média dos faturados no mês" />
          <Indicador titulo="A cobrar do cliente" valor={formatarMoeda(k.aCobrar)} icone={HandCoins} detalhe="postos sob demanda" />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Uso do teto por posto — {rotuloMes(mes)}</CardTitle>
            <CardDescription>Do menor para o maior uso. Clique numa barra para ver todos os pedidos do posto no mês.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarrasPostos3D linhas={linhas} onEscolher={l => navigate(`/pedidos/posto/${l.id}?mes=${mes}`)} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Grafico titulo="Gasto x teto somado — últimos 6 meses" descricao="Barras: gasto aprovado no mês. Linha tracejada: soma dos tetos dos postos."
            tabela={(
              <Table>
                <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">Teto somado</TableHead></TableRow></TableHeader>
                <TableBody>{mensal.map(m => (
                  <TableRow key={m.mes}><TableCell>{m.rotulo}</TableCell><TableCell className="text-right tabular-nums">{formatarMoeda(m.gasto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(m.teto)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={mensal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={cor.grade} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={{ stroke: cor.grade }} />
                <YAxis tickFormatter={moedaCurta} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} width={76} />
                <Tooltip formatter={(v: number, n: string) => [formatarMoeda(v), n]} contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gasto" name="Gasto" fill={cor.s1} radius={[4, 4, 0, 0]} maxBarSize={44} />
                <Line dataKey="teto" name="Teto somado" type="stepAfter" stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Grafico>

          <Grafico titulo="Pedidos em cada etapa agora" descricao="Onde os pedidos em andamento estão parados.">
            <ResponsiveContainer width="100%" height={260}>
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

          <Grafico titulo={`Itens com maior gasto em ${rotuloMes(mes)}`} descricao="Pelo valor da nota; sem nota, pelo orçado."
            tabela={(
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead className="text-right">Gasto</TableHead></TableRow></TableHeader>
                <TableBody>{itens.map(i => (
                  <TableRow key={i.id}><TableCell>{i.nome}</TableCell><TableCell className="text-right tabular-nums">{i.quantidade.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(i.gasto)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}>
            {itens.length === 0 ? <p className="text-sm text-muted-foreground py-16 text-center">Sem gasto com itens neste mês.</p> : (
              <ResponsiveContainer width="100%" height={Math.max(160, itens.length * 34)}>
                <BarChart data={itens} layout="vertical" margin={{ top: 4, right: 76, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={cor.grade} />
                  <XAxis type="number" tickFormatter={moedaCurta} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nome" width={170} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => [formatarMoeda(v), 'Gasto']} contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                  <Bar dataKey="gasto" name="Gasto" fill={cor.s2} radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="gasto" position="right" formatter={(v: number) => moedaCurta(v)} style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Grafico>

          <Grafico titulo="Tempo médio em cada etapa" descricao="Dias entre o pedido chegar na etapa e sair dela (últimos 6 meses).">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tempos} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={cor.grade} />
                <XAxis type="number" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} allowDecimals={false}
                  tickFormatter={(v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`} />
                <YAxis type="category" dataKey="rotulo" width={170} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number, _n, item) => [`${v.toLocaleString('pt-BR')} dias (${item.payload.pedidos} pedidos)`, 'Média']} contentStyle={dica} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Bar dataKey="dias" name="Dias" fill={cor.s1} radius={[0, 4, 4, 0]} maxBarSize={24}>
                  <LabelList dataKey="dias" position="right" formatter={(v: number | null) => (v == null ? 'sem dados' : `${v.toLocaleString('pt-BR')} d`)} style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Grafico>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ranking dos postos em {rotuloMes(mes)}</CardTitle>
              <CardDescription>Do maior uso do teto para o menor.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Posto</TableHead>
                    <TableHead className="text-right">Teto</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead className="w-40">Uso do teto</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l: LinhaPosto) => {
                    const Icone = ICONE_SITUACAO[l.situacao];
                    return (
                      <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/pedidos/posto/${l.id}?mes=${mes}`)}>
                        <TableCell className="font-medium">{l.nome} <span className="text-xs text-muted-foreground">{l.uf}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{l.teto == null ? '—' : formatarMoeda(l.teto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(l.gasto)}</TableCell>
                        <TableCell>
                          {l.uso != null && (
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.uso)}%`, background: COR_SITUACAO[l.situacao] }} />
                              </div>
                              <span className="text-xs tabular-nums w-12 text-right">{pct(l.uso)}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs whitespace-nowrap">
                            <Icone className="h-3.5 w-3.5" style={{ color: COR_SITUACAO[l.situacao] }} />{ROTULO_SITUACAO[l.situacao]}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Preços nas compras — últimos 90 dias</CardTitle>
              <CardDescription>Cada item de nota comparado com a compra anterior no mesmo fornecedor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {([['Aumentaram', variacoes.aumentou, ArrowUpRight], ['Mantiveram', variacoes.manteve, MinusCircle], ['Baixaram', variacoes.baixou, ArrowDownRight]] as const).map(([r, v, I]) => (
                  <div key={r} className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><I className="h-3 w-3" />{r}</p>
                    <p className="text-xl font-bold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium mb-1">Maiores aumentos</p>
                {variacoes.maiores.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aumento no período.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {variacoes.maiores.map(l => (
                      <li key={l.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{l.material_nome} <span className="text-xs text-muted-foreground">· {l.fornecedor_nome}</span></span>
                        <span className="tabular-nums font-medium text-red-600 dark:text-red-400 shrink-0">+{pct(l.percentual)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => navigate('/pedidos/precos')}>Ver o relatório de variação de preço</button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
