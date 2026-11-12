import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardCheck, Clock, Download, List, Loader2, MailWarning, Repeat, ShieldOff, UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { dataBr, EMPRESAS, listarMovimentacoes, type Movimentacao } from '../lib/movimentacaoService';
import {
  coberturas, doMes, faixasAtraso, indicadores, mesesAte, porDiaSemana, porFiscal, porMes, porMotivo, porPosto, reincidentes, rotuloMes,
} from '../lib/gerencial';

/**
 * Painel Gerencial da Movimentação Diária: indicadores do mês, evolução de 6
 * meses, motivos, dias da semana, atraso dos lançamentos, desempenho dos
 * fiscais, postos, colaboradores que mais faltaram e quem mais cobriu.
 */

const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const num = (v: number | null, suf = '') => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suf}`);
const dias = (v: number | null) => (v == null ? '—' : `${num(v)} dia${v === 1 ? '' : 's'}`);

function Indicador({ titulo, valor, detalhe, icone: Icone, tom }: {
  titulo: string; valor: string; detalhe?: ReactNode; icone: typeof Clock; tom?: 'alerta' | 'ruim' | 'bom';
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <span className="rounded-md bg-primary/10 p-1.5"><Icone className="h-4 w-4 text-primary" /></span>
        </div>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums tracking-tight',
          tom === 'alerta' && 'text-amber-600 dark:text-amber-400', tom === 'ruim' && 'text-destructive', tom === 'bom' && 'text-emerald-600 dark:text-emerald-400')}>{valor}</p>
        {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
      </CardContent>
    </Card>
  );
}

function Quadro({ titulo, descricao, children, tabela, acao }: { titulo: string; descricao?: string; children: ReactNode; tabela?: ReactNode; acao?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            {descricao && <CardDescription>{descricao}</CardDescription>}
          </div>
          {acao}
        </div>
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

const Vazio = ({ texto }: { texto: string }) => <p className="text-sm text-muted-foreground py-10 text-center">{texto}</p>;

export default function PainelMovimentacao() {
  const navigate = useNavigate();
  const hoje = hojeBr();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [uf, setUf] = useState('todos');
  const [empresa, setEmpresa] = useState('todas');
  const [linhas, setLinhas] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verTodos, setVerTodos] = useState(false);

  const meses = mesesAte(mes, 6);
  const fimMes = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    return fim > hoje ? hoje : fim;
  }, [mes, hoje]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLinhas(await listarMovimentacoes(`${meses[0]}-01`, fimMes)); }
    catch (e) { toast.error('Erro ao carregar o painel: ' + (e as Error).message); }
    finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meses[0], fimMes]);
  useEffect(() => { carregar(); }, [carregar]);

  const ufs = useMemo(() => [...new Set(linhas.map(l => l.uf).filter((u): u is string => !!u))].sort(), [linhas]);
  const filtradas = useMemo(() => linhas.filter(l => (uf === 'todos' || l.uf === uf) && (empresa === 'todas' || l.empresa === empresa)), [linhas, uf, empresa]);
  const doMesSel = useMemo(() => filtradas.filter(l => doMes(l, mes)), [filtradas, mes]);

  const k = useMemo(() => indicadores(filtradas, mes, meses[4]), [filtradas, mes, meses]);
  const mensal = useMemo(() => porMes(filtradas, meses, rotuloMes), [filtradas, meses]);
  const motivos = useMemo(() => porMotivo(doMesSel), [doMesSel]);
  const semana = useMemo(() => porDiaSemana(doMesSel), [doMesSel]);
  const atrasos = useMemo(() => faixasAtraso(doMesSel), [doMesSel]);
  const fiscais = useMemo(() => porFiscal(doMesSel), [doMesSel]);
  const postos = useMemo(() => porPosto(doMesSel), [doMesSel]);
  const faltosos = useMemo(() => reincidentes(doMesSel), [doMesSel]);
  const cobridores = useMemo(() => coberturas(doMesSel), [doMesSel]);

  const delta = k.anterior ? Math.round(((k.total - k.anterior) / k.anterior) * 1000) / 10 : null;
  const DeltaIcone = delta != null && delta > 0 ? ArrowUpRight : ArrowDownRight;
  const mesAtual = mes === hoje.slice(0, 7);

  // Leva para a lista de lançamentos já filtrada (período do mês + busca).
  const abrirLista = (busca = '', status = '') => {
    const q = new URLSearchParams({ de: `${mes}-01`, ate: fimMes });
    if (busca) q.set('busca', busca);
    if (status) q.set('status', status);
    navigate(`/movimentacao?${q}`);
  };

  const cor = { ok: 'hsl(var(--success))', div: 'hsl(var(--warning))', s1: 'var(--g-s1)', s2: 'var(--g-s2)', eixo: 'hsl(var(--muted-foreground))', grade: 'hsl(var(--border))' };
  const dica = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))', fontSize: 12 };
  const cursor = { fill: 'hsl(var(--muted))', opacity: 0.5 };

  const baixarExcel = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const aba = (nome: string, cab: string[], ls: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(nome);
      ws.addRow(cab).font = { bold: true };
      ls.forEach(r => ws.addRow(r));
      ws.columns.forEach((c, i) => { c.width = Math.min(50, Math.max(cab[i].length + 2, ...ls.map(r => String(r[i] ?? '').length + 2))); });
    };
    aba('Indicadores', ['Indicador', 'Valor'], [
      ['Mês', rotuloMes(mes)], ['Estado', uf === 'todos' ? 'Todos' : uf], ['Empresa', empresa === 'todas' ? 'Todas' : empresa],
      ['Lançamentos', k.total], ['Divergentes', k.divergentes], ['% divergentes', k.pctDivergentes],
      ['Atraso médio dos divergentes (dias)', k.atrasoMedio], ['Faltas', k.faltas], ['Postos descobertos', k.descobertos],
      ['Coberturas por extra', k.extras], ['Fiscais que lançaram', k.fiscais], ['Postos com lançamento', k.postos],
    ]);
    aba('Fiscais', ['Fiscal', 'Matrícula', 'Lançamentos', 'Divergentes', '% divergentes', 'Atraso médio (dias)', 'Último plantão'],
      fiscais.map(f => [f.nome, f.matricula, f.total, f.divergentes, f.pct, f.atrasoMedio, dataBr(f.ultimo)]));
    aba('Postos', ['Posto', 'UF', 'Lançamentos', 'Faltas', 'Descobertos', 'Por extra', 'Diurno', 'Noturno'],
      postos.map(p => [p.nome, p.uf, p.total, p.faltas, p.descobertos, p.extras, p.diurno, p.noturno]));
    aba('Mais faltaram', ['Colaborador', 'Matrícula', 'Lançamentos', 'Motivo FALTA', 'Postos', 'Último'],
      faltosos.map(c => [c.nome, c.matricula, c.total, c.faltas, c.postos.join(', '), dataBr(c.ultima)]));
    aba('Mais cobriram', ['Colaborador', 'Matrícula', 'Coberturas', 'Por extra', 'Postos'],
      cobridores.map(c => [c.nome, c.matricula, c.total, c.extras, c.postos.join(', ')]));
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `painel-movimentacao-${mes}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const LIMITE = 10;
  const corte = <T,>(xs: T[]) => (verTodos ? xs : xs.slice(0, LIMITE));
  const BotaoTodos = ({ total }: { total: number }) => total > LIMITE ? (
    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setVerTodos(v => !v)}>{verTodos ? `Mostrar só ${LIMITE}` : `Ver todos (${total})`}</Button>
  ) : null;

  return (
    <div className="space-y-6 [--g-s1:#2a78d6] [--g-s2:#eb6834] dark:[--g-s1:#3987e5] dark:[--g-s2:#d95926]">
      <PageHeader eyebrow="Fiscalização" title="Painel Gerencial"
        description="Faltas, coberturas e a pontualidade dos fiscais nos lançamentos da Movimentação Diária."
        actions={<>
          <Button variant="outline" size="sm" className="gap-1.5" asChild><Link to="/movimentacao"><List className="h-4 w-4" /> Lançamentos</Link></Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={baixarExcel} disabled={carregando || !doMesSel.length}><Download className="h-4 w-4" /> Excel</Button>
        </>} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="mes-mov">Mês</Label>
          <Input id="mes-mov" type="month" value={mes} max={hoje.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label>Estado</Label>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estados</SelectItem>
              {ufs.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Empresa</Label>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {EMPRESAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />}
        <p className="text-xs text-muted-foreground mb-2 ml-auto">
          {dataBr(`${mes}-01`)} a {dataBr(fimMes)}{mesAtual ? ' (até hoje)' : ''} · pela data do plantão informada pelo fiscal
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Indicador titulo={`Lançamentos em ${rotuloMes(mes)}`} valor={`${k.total}`} icone={ClipboardCheck}
          detalhe={delta == null ? `${k.fiscais} fiscais · ${k.postos} postos` : (
            <span className="flex items-center gap-0.5"><DeltaIcone className="h-3 w-3" />{delta > 0 ? '+' : ''}{num(delta)}% vs {rotuloMes(meses[4])} · {k.fiscais} fiscais</span>
          )} />
        <Indicador titulo="Lançados fora do dia" valor={num(k.pctDivergentes, '%')} icone={AlertTriangle} tom={k.divergentes ? 'alerta' : undefined}
          detalhe={`${k.divergentes} divergente(s) no mês`} />
        <Indicador titulo="Atraso médio dos divergentes" valor={dias(k.atrasoMedio)} icone={Clock}
          detalhe="entre o plantão e o lançamento" />
        <Indicador titulo="Avisos de divergência pendentes" valor={`${k.avisosPendentes}`} icone={MailWarning} tom={k.avisosPendentes ? 'alerta' : undefined}
          detalhe={k.avisosPendentes ? 'e-mail ainda não enviado' : 'todos avisados'} />
        <Indicador titulo="Faltas" valor={`${k.faltas}`} icone={UserX} detalhe={`motivo FALTA · ${num(k.total ? (k.faltas / k.total) * 100 : null, '%')} dos lançamentos`} />
        <Indicador titulo="Postos descobertos" valor={`${k.descobertos}`} icone={ShieldOff} tom={k.descobertos ? 'ruim' : 'bom'} detalhe="ninguém cobriu a ausência" />
        <Indicador titulo="Coberturas por extra" valor={`${k.extras}`} icone={Repeat} detalhe={`${num(k.pctExtras, '%')} dos lançamentos`} />
        <Indicador titulo="Cobertos no mês" valor={num(k.total ? ((k.total - k.descobertos) / k.total) * 100 : null, '%')} icone={ClipboardCheck}
          tom={k.total && k.descobertos === 0 ? 'bom' : undefined} detalhe="ausências com alguém no lugar" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Quadro titulo="Lançamentos — últimos 6 meses" descricao="OK x divergente, pela data do plantão."
          tabela={(
            <Table>
              <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead className="text-right">OK</TableHead><TableHead className="text-right">Divergente</TableHead><TableHead className="text-right">Descobertos</TableHead></TableRow></TableHeader>
              <TableBody>{mensal.map(m => (
                <TableRow key={m.mes}><TableCell>{m.rotulo}</TableCell><TableCell className="text-right tabular-nums">{m.OK}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.Divergente}</TableCell><TableCell className="text-right tabular-nums">{m.Descobertos}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mensal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={cor.grade} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={{ stroke: cor.grade }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={dica} cursor={cursor} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="OK" stackId="a" fill={cor.ok} maxBarSize={36} />
              <Bar dataKey="Divergente" stackId="a" fill={cor.div} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </Quadro>

        <Quadro titulo="Quanto tempo depois o fiscal lançou" descricao={`Dias entre o plantão e o lançamento, em ${rotuloMes(mes)}.`}>
          {!doMesSel.length ? <Vazio texto="Sem lançamentos neste mês." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={atrasos} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={cor.grade} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="faixa" width={90} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [v, 'Lançamentos']} contentStyle={dica} cursor={cursor} />
                <Bar dataKey="total" name="Lançamentos" fill={cor.div} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Quadro>

        <Quadro titulo="Por motivo" descricao={`Por que o colaborador não estava no posto, em ${rotuloMes(mes)}.`}>
          {!doMesSel.length ? <Vazio texto="Sem lançamentos neste mês." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={motivos} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={cor.grade} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="motivo" width={110} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [v, 'Lançamentos']} contentStyle={dica} cursor={cursor} />
                <Bar dataKey="total" name="Lançamentos" fill={cor.s1} radius={[0, 4, 4, 0]} maxBarSize={26}>
                  <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Quadro>

        <Quadro titulo="Por dia da semana e turno" descricao={`Em que dia do plantão as ausências acontecem, em ${rotuloMes(mes)}.`}>
          {!doMesSel.length ? <Vazio texto="Sem lançamentos neste mês." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={semana} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={cor.grade} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={{ stroke: cor.grade }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cor.eixo }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={dica} cursor={cursor} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Diurno" stackId="t" fill={cor.s1} maxBarSize={32} />
                <Bar dataKey="Noturno" stackId="t" fill={cor.s2} radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Quadro>
      </div>

      <Quadro titulo={`Fiscais — ${rotuloMes(mes)}`} descricao="Quem mais lançou fora do dia aparece primeiro. Clique para ver os lançamentos do fiscal."
        acao={<BotaoTodos total={fiscais.length} />}>
        <div className="overflow-x-auto -mx-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-6">Fiscal</TableHead><TableHead className="text-right">Lançamentos</TableHead><TableHead className="text-right">Divergentes</TableHead>
              <TableHead className="min-w-40">Fora do dia</TableHead><TableHead className="text-right">Atraso médio</TableHead><TableHead className="text-right pr-6">Último plantão</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {fiscais.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum lançamento em {rotuloMes(mes)}.</TableCell></TableRow>}
              {corte(fiscais).map(f => (
                <TableRow key={f.chave} className="cursor-pointer" onClick={() => abrirLista(f.nome)}>
                  <TableCell className="pl-6 font-medium">{f.nome}{f.matricula && <span className="block text-[11px] text-muted-foreground">Mat. {f.matricula}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.total}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', f.divergentes && 'text-amber-600 dark:text-amber-400 font-semibold')}>{f.divergentes}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full', f.pct >= 20 ? 'bg-destructive' : f.pct > 0 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.max(f.pct, f.pct ? 3 : 0)}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums">{num(f.pct, '%')}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{dias(f.atrasoMedio)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm pr-6">{dataBr(f.ultimo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Quadro>

      <Quadro titulo={`Postos — ${rotuloMes(mes)}`} descricao="Postos com mais ausências primeiro. Descoberto = ninguém cobriu. Clique para ver os lançamentos do posto."
        acao={<BotaoTodos total={postos.length} />}>
        <div className="overflow-x-auto -mx-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-6">Posto</TableHead><TableHead className="text-right">Lançamentos</TableHead><TableHead className="text-right">Faltas</TableHead>
              <TableHead className="text-right">Descobertos</TableHead><TableHead className="text-right">Por extra</TableHead>
              <TableHead className="text-right">Diurno</TableHead><TableHead className="text-right pr-6">Noturno</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {postos.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum lançamento em {rotuloMes(mes)}.</TableCell></TableRow>}
              {corte(postos).map(p => (
                <TableRow key={p.nome} className="cursor-pointer" onClick={() => abrirLista(p.nome)}>
                  <TableCell className="pl-6 font-medium">{p.nome} {p.uf && <span className="text-xs text-muted-foreground">{p.uf}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{p.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.faltas}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', p.descobertos && 'text-destructive font-semibold')}>{p.descobertos}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.extras}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.diurno}</TableCell>
                  <TableCell className="text-right tabular-nums pr-6">{p.noturno}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Quadro>

      <div className="grid gap-4 lg:grid-cols-2">
        <Quadro titulo="Colaboradores que mais faltaram" descricao={`Reincidência em ${rotuloMes(mes)}. Clique para ver os lançamentos.`}>
          {faltosos.length === 0 ? <Vazio texto="Ninguém faltou neste mês." /> : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-6">Colaborador</TableHead><TableHead className="text-right">Faltas</TableHead>
                  <TableHead className="text-right">Ausências</TableHead><TableHead className="text-right pr-6">Última</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {faltosos.slice(0, 10).map(c => (
                    <TableRow key={c.matricula} className="cursor-pointer" onClick={() => abrirLista(c.matricula)}>
                      <TableCell className="pl-6">
                        <span className="font-medium">{c.nome}</span>
                        <span className="block text-[11px] text-muted-foreground truncate max-w-64">Mat. {c.matricula} · {c.postos.join(', ')}</span>
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', c.faltas >= 3 && 'text-destructive font-semibold')}>{c.faltas}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm pr-6">{dataBr(c.ultima)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Quadro>

        <Quadro titulo="Quem mais cobriu" descricao={`Colaboradores que ficaram no lugar de quem faltou, em ${rotuloMes(mes)}.`}>
          {cobridores.length === 0 ? <Vazio texto="Nenhuma cobertura neste mês." /> : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-6">Colaborador</TableHead><TableHead className="text-right">Coberturas</TableHead><TableHead className="text-right pr-6">Por extra</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {cobridores.slice(0, 10).map(c => (
                    <TableRow key={c.matricula} className="cursor-pointer" onClick={() => abrirLista(c.matricula)}>
                      <TableCell className="pl-6">
                        <span className="font-medium">{c.nome}</span>
                        <span className="block text-[11px] text-muted-foreground truncate max-w-64">Mat. {c.matricula} · {c.postos.join(', ')}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{c.total}</TableCell>
                      <TableCell className="text-right tabular-nums pr-6">{c.extras}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Quadro>
      </div>
    </div>
  );
}
