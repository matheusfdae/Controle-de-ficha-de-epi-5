import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LabelList } from 'recharts';
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Eye, FileDown, FileSignature, HardHat, Loader2, PenLine, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect, { TODOS_ESTADOS, useEstadoLembrado } from '@/components/EstadoSelect';
import TermoOficialView from '@/components/TermoOficialView';
import { pdfDoTermoColetivo } from '@/lib/termoEpiPdf';
import { getTermoColetivoFull, listTermosResumo, type TermoColetivoFull, type TermoResumo } from '@/services/termoColetivoService';

const tooltipStyle = { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };
const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Consulta dos Termos de EPI (separada das fichas de uniforme): números, gráficos e os termos por posto. */
export default function ConsultarTermosEpi() {
  const [termos, setTermos] = useState<TermoResumo[] | null>(null);
  const [uf, setUf] = useEstadoLembrado('consultar-termos', true);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<'todos' | 'finalizado' | 'aberto'>('todos');
  const [meses, setMeses] = useState(12);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [vendo, setVendo] = useState<TermoColetivoFull | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => { listTermosResumo().then(setTermos).catch(e => { toast.error((e as Error).message); setTermos([]); }); }, []);

  // Termo sem estado (feito à mão, fora do pedido de material) aparece em "Todos os estados".
  const filtrados = useMemo(() => (termos ?? []).filter(t => {
    if (uf && uf !== TODOS_ESTADOS && t.uf !== uf) return false;
    if (status === 'finalizado' && t.status !== 'finalizado') return false;
    if (status === 'aberto' && t.status === 'finalizado') return false;
    if (busca.trim()) {
      const b = normalizar(busca.trim());
      if (![t.posto, t.lider ?? '', t.codigo ?? '', ...t.colaboradores].some(x => normalizar(x).includes(b))) return false;
    }
    return true;
  }), [termos, uf, status, busca]);

  const total = filtrados.length;
  const finalizados = filtrados.filter(t => t.status === 'finalizado').length;
  const linhas = filtrados.reduce((s, t) => s + t.linhas, 0);
  const assinadas = filtrados.reduce((s, t) => s + t.assinadas, 0);
  const epis = filtrados.reduce((s, t) => s + t.epis_assinados, 0);
  const pct = total ? Math.round((finalizados / total) * 100) : 0;

  const hoje = new Date();
  const porMes = Array.from({ length: meses }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1 - i), 1);
    return { chave: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace('.', ''),
      finalizados: 0, abertos: 0, total: 0 };
  });
  const indiceMes = new Map(porMes.map((m, i) => [m.chave, i]));
  for (const t of filtrados) {
    const d = new Date(t.criado_em);
    const i = indiceMes.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i === undefined) continue;
    if (t.status === 'finalizado') porMes[i].finalizados++; else porMes[i].abertos++;
    porMes[i].total++;
  }

  const postos = useMemo(() => {
    const m = new Map<string, TermoResumo[]>();
    for (const t of filtrados) m.set(t.posto, [...(m.get(t.posto) ?? []), t]);
    return [...m].map(([posto, ts]) => ({
      posto, termos: ts, assinadas: ts.reduce((s, t) => s + t.assinadas, 0), pendentes: ts.reduce((s, t) => s + t.linhas - t.assinadas, 0),
      abertos: ts.filter(t => t.status !== 'finalizado').length,
    })).sort((a, b) => b.pendentes - a.pendentes || a.posto.localeCompare(b.posto));
  }, [filtrados]);
  const graficoPostos = [...postos].sort((a, b) => (b.assinadas + b.pendentes) - (a.assinadas + a.pendentes)).slice(0, 10)
    .map(p => ({ posto: p.posto.length > 22 ? `${p.posto.slice(0, 21)}…` : p.posto, assinadas: p.assinadas, pendentes: p.pendentes, total: p.assinadas + p.pendentes }));

  const alternar = (posto: string) => setAbertos(s => { const n = new Set(s); if (n.has(posto)) n.delete(posto); else n.add(posto); return n; });
  const visualizar = async (id: string) => setVendo(await getTermoColetivoFull(id));
  const baixar = async (id: string) => {
    setBaixando(id);
    try {
      const full = await getTermoColetivoFull(id);
      if (!full) throw new Error('Termo não encontrado.');
      await pdfDoTermoColetivo(full);
    } catch (e) { toast.error((e as Error).message); } finally { setBaixando(null); }
  };
  const temFiltro = !!busca || status !== 'todos';

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Consultar Termos de EPI" description="Termos de entrega de EPI por posto, com as assinaturas colhidas."
          actions={<div className="w-44"><EstadoSelect value={uf} onChange={setUf} permitirTodos placeholder="Estado" /></div>} />

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><FileSignature className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Termos</p><p className="text-2xl font-bold">{total}</p></div>
          </CardContent></Card>
          <button type="button" className="text-left" onClick={() => setStatus(s => (s === 'finalizado' ? 'todos' : 'finalizado'))}>
            <Card className={`h-full transition-colors hover:border-success/60 ${status === 'finalizado' ? 'border-success' : ''}`}><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><CheckCircle2 className="h-5 w-5 text-success" /></div>
              <div><p className="text-xs text-muted-foreground">Finalizados</p>
                <p className="text-2xl font-bold">{finalizados} <span className="text-sm font-medium text-muted-foreground">{pct}%</span></p></div>
            </CardContent></Card>
          </button>
          <button type="button" className="text-left" onClick={() => setStatus(s => (s === 'aberto' ? 'todos' : 'aberto'))}>
            <Card className={`h-full transition-colors hover:border-warning/60 ${status === 'aberto' ? 'border-warning' : ''}`}><CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
              <div><p className="text-xs text-muted-foreground">Em assinatura</p><p className="text-2xl font-bold">{total - finalizados}</p></div>
            </CardContent></Card>
          </button>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><PenLine className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Assinaturas</p>
              <p className="text-2xl font-bold">{assinadas}<span className="text-sm font-medium text-muted-foreground"> de {linhas}</span></p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1"><HardHat className="h-3 w-3" /> {epis} EPIs entregues com assinatura</p></div>
          </CardContent></Card>
        </div>

        {total > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Termos por mês</CardTitle>
                <Select value={String(meses)} onValueChange={v => setMeses(Number(v))}>
                  <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                    <SelectItem value="24">Últimos 24 meses</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent><div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porMes} margin={{ top: 20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={tick} />
                    <YAxis tick={tick} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="finalizados" name="Finalizados" stackId="t" fill="hsl(var(--success))" />
                    <Bar dataKey="abertos" name="Em assinatura" stackId="t" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total" position="top" fontSize={11} fill="hsl(var(--foreground))" formatter={(v: number) => (v ? v : '')} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Assinaturas por posto</CardTitle></CardHeader>
              <CardContent><div className="w-full" style={{ height: Math.max(300, graficoPostos.length * 34 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graficoPostos} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={tick} allowDecimals={false} />
                    <YAxis type="category" dataKey="posto" tick={tick} width={130} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="assinadas" name="Assinadas" stackId="p" fill="hsl(var(--success))" barSize={20} />
                    <Bar dataKey="pendentes" name="Pendentes" stackId="p" fill="hsl(var(--warning))" barSize={20} radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" fontSize={11} fill="hsl(var(--foreground))" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">Termos por posto</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Posto, líder, colaborador ou pedido" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aberto">Em assinatura</SelectItem>
                  <SelectItem value="finalizado">Finalizados</SelectItem>
                </SelectContent>
              </Select>
              {temFiltro && <Button variant="ghost" className="gap-1" onClick={() => { setBusca(''); setStatus('todos'); }}><X className="h-4 w-4" /> Limpar</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {termos === null ? <Loader2 className="h-5 w-5 animate-spin" />
              : postos.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhum termo encontrado.</p>
              : postos.map(p => (
                <div key={p.posto} className="rounded-md border">
                  <button type="button" className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-muted/40" onClick={() => alternar(p.posto)}>
                    <span className="flex items-center gap-2 font-medium min-w-0">
                      {abertos.has(p.posto) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{p.posto}</span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1.5 text-xs shrink-0">
                      <Badge variant="outline">{p.termos.length} termo{p.termos.length > 1 ? 's' : ''}</Badge>
                      <Badge variant="outline" className="border-success/50 text-success">{p.assinadas} assinadas</Badge>
                      {p.pendentes > 0 && <Badge variant="outline" className="border-warning/60 text-warning">{p.pendentes} pendentes</Badge>}
                    </span>
                  </button>
                  {abertos.has(p.posto) && (
                    <ul className="divide-y border-t">
                      {p.termos.map(t => (
                        <li key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium flex flex-wrap items-center gap-2">
                              {t.mes_referencia}{t.codigo && <span className="text-xs text-muted-foreground">· {t.codigo}</span>}
                              <Badge variant={t.status === 'finalizado' ? 'default' : 'secondary'}>{t.status === 'finalizado' ? 'Finalizado' : 'Em assinatura'}</Badge>
                            </p>
                            <p className="text-xs text-muted-foreground">Líder: {t.lider || '—'} · {t.assinadas} de {t.linhas} assinaturas{t.uf ? ` · ${t.uf}` : ''}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => visualizar(t.id)}><Eye className="h-3.5 w-3.5 mr-1" /> Visualizar</Button>
                            <Button size="sm" variant="outline" disabled={baixando === t.id} onClick={() => baixar(t.id)}>
                              {baixando === t.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />} PDF
                            </Button>
                            <Button size="sm" variant="ghost" asChild><Link to={`/termo-coletivo/${t.id}`}>Abrir</Link></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!vendo} onOpenChange={o => { if (!o) setVendo(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              {vendo ? `${vendo.termo.posto} — ${vendo.termo.mes_referencia}` : ''}
              {vendo && (
                <Button size="sm" variant="outline" onClick={() => pdfDoTermoColetivo(vendo).catch(e => toast.error((e as Error).message))}>
                  <FileDown className="h-4 w-4 mr-1" /> Baixar PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {vendo && <TermoOficialView termo={vendo.termo} itens={vendo.itens} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
