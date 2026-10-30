import { useEffect, useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect, { TODOS_ESTADOS } from '@/components/EstadoSelect';
import MapaPostos, { type PontoMapa } from '@/components/MapaPostos';
import { listPostos, type Posto } from '@/services/postosService';
import {
  formatarMoeda, hojeBr, inicioDoMes, listGastos, listTetos, serieGastos, tetoNoMes, valorDoPedido,
  type Agrupamento, type TetoPosto,
} from '../lib/pedidosService';

/**
 * Teto x gasto de cada posto. O mapa colore a estrela pelo quanto do teto do
 * mês já foi usado; clicar no posto abre o gráfico diário, quinzenal ou mensal.
 */

// Cores de status (paleta validada); sempre com o % escrito ao lado.
const STATUS = {
  ok: { cor: '#0ca30c', rotulo: 'Até 70% do teto' },
  atencao: { cor: '#fab219', rotulo: '70% a 100%' },
  estourou: { cor: '#d03b3b', rotulo: 'Acima do teto' },
  sem_teto: { cor: '#64748b', rotulo: 'Sem teto definido' },
} as const;
type Situacao = keyof typeof STATUS;

const situacao = (teto: number | null, gasto: number): Situacao =>
  teto == null || teto === 0 ? 'sem_teto' : gasto > teto ? 'estourou' : gasto >= teto * 0.7 ? 'atencao' : 'ok';

const mesesAntes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
};
const fimDoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const menor = (a: string, b: string) => (a < b ? a : b);

type Gasto = Awaited<ReturnType<typeof listGastos>>[number];

export default function PainelGastos() {
  const [uf, setUf] = useState(TODOS_ESTADOS);
  const [mes, setMes] = useState(hojeBr().slice(0, 7));
  const [postos, setPostos] = useState<Posto[]>([]);
  const [tetos, setTetos] = useState<TetoPosto[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const inicio = mesesAntes(`${mes}-01`, 11);
    Promise.all([listPostos(), listTetos(), listGastos(inicio, fimDoMes(mes))])
      .then(([p, t, g]) => { if (vivo) { setPostos(p); setTetos(t); setGastos(g); } })
      .catch(e => toast.error('Erro ao carregar: ' + (e as Error).message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [mes]);

  const inicioMes = `${mes}-01`;
  const linhas = useMemo(() => postos
    .filter(p => p.ativo && (uf === TODOS_ESTADOS || p.uf === uf))
    .map(p => {
      const teto = tetoNoMes(tetos, p.id, inicioMes);
      const gasto = Math.round(gastos.filter(g => g.posto_id === p.id && inicioDoMes(g.data_aprovacao) === inicioMes)
        .reduce((s, g) => s + valorDoPedido(g), 0) * 100) / 100;
      return { posto: p, teto, gasto, saldo: teto == null ? null : teto - gasto, pct: teto ? (gasto / teto) * 100 : null, sit: situacao(teto, gasto) };
    })
    .filter(l => l.teto != null || l.gasto > 0)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.gasto - a.gasto), [postos, tetos, gastos, uf, inicioMes]);

  const pontos: PontoMapa[] = linhas
    .filter(l => l.posto.latitude != null && l.posto.longitude != null)
    .map(l => ({
      chave: l.posto.id, nome: l.posto.nome, latitude: l.posto.latitude!, longitude: l.posto.longitude!,
      peso: Math.max(1, l.gasto), cor: STATUS[l.sit].cor,
      valorLegenda: l.pct != null ? `${Math.round(l.pct)}%` : formatarMoeda(l.gasto),
      detalhe: `Gasto ${formatarMoeda(l.gasto)} de ${l.teto == null ? 'sem teto' : formatarMoeda(l.teto)}${l.pct != null ? ` (${Math.round(l.pct)}%)` : ''}`,
    }));

  const totalTeto = linhas.reduce((s, l) => s + (l.teto ?? 0), 0);
  const totalGasto = linhas.reduce((s, l) => s + l.gasto, 0);
  const estourados = linhas.filter(l => l.sit === 'estourou').length;
  const selecionado = linhas.find(l => l.posto.id === aberto) ?? null;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Teto de Gastos por Posto" eyebrow="Pedidos"
          description="Consumido = pedidos orçados e aprovados no mês (a faturar ou faturados), pelo valor da nota quando já faturado, senão o orçado. Clique em um posto para ver o gráfico." />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mes">Mês</Label>
            <Input id="mes" type="month" value={mes} max={hojeBr().slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} className="w-44" />
          </div>
          <div className="w-44">
            <Label>Estado</Label>
            <EstadoSelect value={uf} onChange={setUf} permitirTodos />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Resumo rotulo="Teto somado dos postos" valor={formatarMoeda(totalTeto)} />
          <Resumo rotulo="Gasto no mês" valor={formatarMoeda(totalGasto)}
            sub={totalTeto ? `${Math.round((totalGasto / totalTeto) * 100)}% do teto somado` : undefined} />
          <Resumo rotulo="Postos acima do teto" valor={String(estourados)} alerta={estourados > 0} />
        </div>

        {carregando ? (
          <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
        ) : (
          <>
            {pontos.length > 0 && (
              <div className="space-y-2">
                <MapaPostos pontos={pontos} onSelecionar={setAberto} dicaClique="Clique para ver o gráfico de gastos"
                  resumoLegenda={`${formatarMoeda(totalGasto)} gastos no mês`} />
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {(Object.keys(STATUS) as Situacao[]).map(s => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ background: STATUS[s].cor }} /> {STATUS[s].rotulo}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posto</TableHead>
                      <TableHead className="text-right">Teto</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-48">Uso do teto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                        Nenhum posto com teto ou gasto neste mês. Defina os tetos em Configurações de Pedidos.
                      </TableCell></TableRow>
                    )}
                    {linhas.map(l => (
                      <TableRow key={l.posto.id} className="cursor-pointer" onClick={() => setAberto(l.posto.id)}>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {l.posto.latitude == null && <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-label="sem localização" />}
                            {l.posto.nome} <span className="text-xs text-muted-foreground">{l.posto.uf}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.teto == null ? '—' : formatarMoeda(l.teto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(l.gasto)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${l.saldo != null && l.saldo < 0 ? 'text-destructive font-semibold' : ''}`}>
                          {l.saldo == null ? '—' : formatarMoeda(l.saldo)}
                        </TableCell>
                        <TableCell>
                          {l.pct == null ? <span className="text-xs text-muted-foreground">{STATUS.sem_teto.rotulo}</span> : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden" role="progressbar"
                                aria-valuenow={Math.round(l.pct)} aria-valuemin={0} aria-valuemax={100}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.pct)}%`, background: STATUS[l.sit].cor }} />
                              </div>
                              <span className="text-xs tabular-nums w-12 text-right flex items-center gap-0.5">
                                {l.sit === 'estourou' && <AlertTriangle className="h-3 w-3 text-destructive" />}{Math.round(l.pct)}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {linhas.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(totalTeto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(totalGasto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(totalTeto - totalGasto)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {selecionado && (
        <GraficoPosto posto={selecionado.posto} mes={mes} gastos={gastos.filter(g => g.posto_id === selecionado.posto.id)}
          tetos={tetos} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, sub, alerta }: { rotulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{rotulo}</p>
        <p className={`text-2xl font-bold tabular-nums ${alerta ? 'text-destructive' : 'text-foreground'}`}>{valor}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const PERIODOS: Record<Agrupamento, { rotulo: string; descricao: string }> = {
  dia: { rotulo: 'Diário', descricao: 'cada dia do mês, com o acumulado do mês' },
  quinzena: { rotulo: 'Quinzenal', descricao: 'últimos 6 meses, com o acumulado do mês' },
  mes: { rotulo: 'Mensal', descricao: 'últimos 12 meses' },
};

function GraficoPosto({ posto, mes, gastos, tetos, onFechar }: {
  posto: Posto; mes: string; gastos: Gasto[]; tetos: TetoPosto[]; onFechar: () => void;
}) {
  const [ag, setAg] = useState<Agrupamento>('dia');
  const escuro = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const cor = { gasto: escuro ? '#3987e5' : '#2a78d6', acumulado: escuro ? '#d95926' : '#eb6834' };
  const fim = menor(fimDoMes(mes), hojeBr());
  const inicio = ag === 'dia' ? `${mes}-01` : mesesAntes(`${mes}-01`, ag === 'quinzena' ? 5 : 11);
  const serie = serieGastos(gastos, inicio, fim, ag, m => tetoNoMes(tetos, posto.id, m));
  const tetoMes = tetoNoMes(tetos, posto.id, `${mes}-01`);
  const total = serie.reduce((s, p) => s + p.gasto, 0);
  const mostraAcumulado = ag !== 'mes';
  const moedaCurta = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(v)}`;

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{posto.nome} <span className="text-sm font-normal text-muted-foreground">{posto.uf}</span></DialogTitle>
          <DialogDescription>
            Teto do mês: {tetoMes == null ? 'sem teto' : formatarMoeda(tetoMes)} · Gasto no período: {formatarMoeda(total)} · {PERIODOS[ag].descricao}
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup type="single" value={ag} onValueChange={v => v && setAg(v as Agrupamento)} className="justify-start">
          {(Object.keys(PERIODOS) as Agrupamento[]).map(a => <ToggleGroupItem key={a} value={a}>{PERIODOS[a].rotulo}</ToggleGroupItem>)}
        </ToggleGroup>

        <Card>
          <CardHeader className="pb-0"><CardTitle className="text-sm font-medium">Gasto x teto (R$)</CardTitle></CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={serie} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tickFormatter={moedaCurta} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip
                  formatter={(v: number, nome: string) => [formatarMoeda(v), nome]}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gasto" name={ag === 'dia' ? 'Gasto do dia' : ag === 'quinzena' ? 'Gasto da quinzena' : 'Gasto do mês'}
                  fill={cor.gasto} radius={[4, 4, 0, 0]} maxBarSize={36} />
                {mostraAcumulado && (
                  <Line dataKey="acumulado" name="Acumulado no mês" type="monotone" stroke={cor.acumulado} strokeWidth={2}
                    dot={ag === 'quinzena' ? { r: 4 } : false} activeDot={{ r: 5 }} />
                )}
                <Line dataKey="teto" name="Teto do mês" type="stepAfter" stroke="hsl(var(--foreground))" strokeWidth={2}
                  strokeDasharray="6 4" dot={false} activeDot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ver os números em tabela</summary>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                {mostraAcumulado && <TableHead className="text-right">Acumulado no mês</TableHead>}
                <TableHead className="text-right">Teto do mês</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serie.filter(p => ag !== 'dia' || p.gasto > 0).map(p => (
                <TableRow key={p.chave}>
                  <TableCell>{p.rotulo}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(p.gasto)}</TableCell>
                  {mostraAcumulado && <TableCell className="text-right tabular-nums">{formatarMoeda(p.acumulado)}</TableCell>}
                  <TableCell className="text-right tabular-nums">{p.teto == null ? '—' : formatarMoeda(p.teto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </DialogContent>
    </Dialog>
  );
}
