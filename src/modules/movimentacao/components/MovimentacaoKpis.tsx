import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, ClipboardCheck, Repeat, ShieldOff, UserX } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { listarMovimentacoes, type Movimentacao } from '../lib/movimentacaoService';

/**
 * Dashboard: indicadores do Controle de Movimentação Diária (mês atual) e
 * lançamentos por dia (últimos 30 dias, OK x divergente).
 */

const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const menosDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const pct = (n: number, t: number) => (t ? `${(Math.round((n / t) * 1000) / 10).toLocaleString('pt-BR')}%` : '—');

const COR_OK = 'hsl(var(--success))';
const COR_DIV = 'hsl(var(--warning))';

function Kpi({ icon: Icon, titulo, valor, detalhe, tom }: {
  icon: typeof AlertTriangle; titulo: string; valor: string | number; detalhe: string; tom: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const cores = {
    primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning', destructive: 'bg-destructive/10 text-destructive',
  };
  return (
    <Card className="h-full">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('p-2.5 rounded-lg shrink-0', cores[tom])}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground leading-tight tabular-nums">{valor}</p>
          <p className="text-xs font-medium text-foreground/80">{titulo}</p>
          <p className="text-[11px] text-muted-foreground">{detalhe}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Ranking({ titulo, descricao, itens, vazio }: {
  titulo: string; descricao: string; itens: { nome: string; valor: number; extra?: string }[]; vazio: string;
}) {
  const max = Math.max(1, ...itens.map(i => i.valor));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{titulo}</CardTitle>
        <CardDescription className="text-xs">{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {itens.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{vazio}</p>}
        {itens.map(i => (
          <div key={i.nome} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{i.nome}</span>
              <span className="font-semibold tabular-nums shrink-0">{i.valor}{i.extra && <span className="text-xs font-normal text-muted-foreground"> · {i.extra}</span>}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(i.valor / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function MovimentacaoKpis() {
  const hoje = hojeBr();
  const inicio30 = menosDias(hoje, 29);
  const inicioMes = hoje.slice(0, 8) + '01';
  const de = inicio30 < inicioMes ? inicio30 : inicioMes;
  const [linhas, setLinhas] = useState<Movimentacao[] | null>(null);

  useEffect(() => { listarMovimentacoes(de, hoje).then(setLinhas, () => setLinhas([])); }, [de, hoje]);

  const k = useMemo(() => {
    const ls = linhas ?? [];
    const mes = ls.filter(l => l.data_movimentacao >= inicioMes);
    const total = mes.length;
    const div = mes.filter(l => l.status === 'divergente').length;
    const faltas = mes.filter(l => l.motivo === 'FALTA').length;
    const descobertos = mes.filter(l => !l.cobertura_nome).length;
    const extras = mes.filter(l => l.cobertura_por_extra).length;

    const porDia = new Map<string, { ok: number; div: number }>();
    for (let i = 29; i >= 0; i--) porDia.set(menosDias(hoje, i), { ok: 0, div: 0 });
    for (const l of ls) {
      const d = porDia.get(l.data_movimentacao);
      if (d) d[l.status === 'ok' ? 'ok' : 'div']++;
    }
    const grafico = [...porDia.entries()].map(([d, v]) => ({ dia: `${d.slice(8, 10)}/${d.slice(5, 7)}`, OK: v.ok, Divergente: v.div }));

    const conta = (lista: Movimentacao[], chave: (l: Movimentacao) => string) => {
      const m = new Map<string, number>();
      for (const l of lista) m.set(chave(l), (m.get(chave(l)) ?? 0) + 1);
      return m;
    };
    const lancPorFiscal = conta(mes, l => l.fiscal_nome);
    const divPorFiscal = [...conta(mes.filter(l => l.status === 'divergente'), l => l.fiscal_nome).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([nome, valor]) => ({ nome, valor, extra: `${pct(valor, lancPorFiscal.get(nome) ?? 0)} dos lançamentos` }));
    const faltasPorPosto = [...conta(mes.filter(l => l.motivo === 'FALTA'), l => l.posto_nome.trim().toUpperCase()).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, valor]) => ({ nome, valor }));

    return { total, div, faltas, descobertos, extras, grafico, divPorFiscal, faltasPorPosto };
  }, [linhas, hoje, inicioMes]);

  const nomeMes = new Date(`${inicioMes}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });

  return (
    <section className="space-y-4" aria-labelledby="kpi-mov">
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h3 id="kpi-mov" className="text-lg font-semibold flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> Movimentação diária</h3>
          <p className="text-xs text-muted-foreground">Faltas e coberturas lançadas pelos fiscais — {nomeMes} até hoje</p>
        </div>
        <div className="flex gap-4">
          <Link to="/movimentacao/gerencial" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">Painel gerencial <ArrowRight className="h-4 w-4" /></Link>
          <Link to="/movimentacao" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">Ver lançamentos <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Kpi icon={ClipboardCheck} titulo="Lançamentos" valor={linhas ? k.total : '…'} detalhe="no mês" tom="primary" />
        <Kpi icon={AlertTriangle} titulo="Divergentes" valor={linhas ? pct(k.div, k.total) : '…'} detalhe={`${k.div} lançados fora do dia`} tom="warning" />
        <Kpi icon={UserX} titulo="Faltas" valor={linhas ? k.faltas : '…'} detalhe={`${pct(k.faltas, k.total)} dos lançamentos`} tom="destructive" />
        <Kpi icon={ShieldOff} titulo="Postos descobertos" valor={linhas ? k.descobertos : '…'} detalhe="ninguém cobriu" tom="destructive" />
        <Kpi icon={Repeat} titulo="Cobertura por extra" valor={linhas ? pct(k.extras, k.total) : '…'} detalhe={`${k.extras} extras`} tom="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lançamentos por dia (últimos 30 dias)</CardTitle>
            <CardDescription className="text-xs">Pela data informada pelo fiscal: OK x divergente</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={k.grafico} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={12} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="OK" stackId="a" fill={COR_OK} />
                <Bar dataKey="Divergente" stackId="a" fill={COR_DIV} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Ranking titulo="Divergências por fiscal" descricao="Quem mais lançou fora do dia no mês"
          itens={k.divPorFiscal} vazio="Nenhuma divergência no mês." />
        <Ranking titulo="Postos com mais faltas" descricao="Motivo FALTA no mês"
          itens={k.faltasPorPosto} vazio="Nenhuma falta no mês." />
      </div>
    </section>
  );
}
