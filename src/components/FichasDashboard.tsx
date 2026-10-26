import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LabelList } from 'recharts';
import { CheckCircle2, ClipboardList, Clock, Package } from 'lucide-react';
import { EPIFicha, MotivoEntrega } from '@/types/epi';

const tooltipStyle = {
  background: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};
const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

interface Props {
  /** Fichas já filtradas pela tela (estado, busca, status, motivo, datas). */
  fichas: EPIFicha[];
  motivoLabel: Record<MotivoEntrega, string>;
  status: 'todos' | EPIFicha['status'];
  /** Clicar no cartão de assinadas/pendentes filtra a lista (de novo = tira o filtro). */
  onStatus: (s: 'todos' | EPIFicha['status']) => void;
}

/** Resumo das fichas que estão na lista: números, fichas por mês e por motivo. */
export default function FichasDashboard({ fichas, motivoLabel, status, onStatus }: Props) {
  const [meses, setMeses] = useState(12);
  const total = fichas.length;
  const assinadas = fichas.filter(f => f.status === 'assinada').length;
  const pendentes = total - assinadas;
  const itens = fichas.reduce((s, f) => s + f.itens.filter(i => i.recebido).reduce((q, i) => q + (i.quantidade || 1), 0), 0);
  const pct = total ? Math.round((assinadas / total) * 100) : 0;

  // Últimos meses (pelo dia em que a ficha foi criada), inclusive os sem ficha.
  const hoje = new Date();
  const porMes = Array.from({ length: meses }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1 - i), 1);
    return {
      chave: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace('.', ''),
      assinadas: 0,
      pendentes: 0,
      total: 0,
    };
  });
  const indiceMes = new Map(porMes.map((m, i) => [m.chave, i]));
  for (const f of fichas) {
    const d = new Date(f.criadoEm);
    const i = indiceMes.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i === undefined) continue;
    if (f.status === 'assinada') porMes[i].assinadas++;
    else porMes[i].pendentes++;
    porMes[i].total++;
  }

  const porMotivo = (Object.keys(motivoLabel) as MotivoEntrega[])
    .map(m => ({ motivo: motivoLabel[m], fichas: fichas.filter(f => f.motivo === m).length }))
    .filter(m => m.fichas > 0)
    .sort((a, b) => b.fichas - a.fichas);

  const alternar = (s: EPIFicha['status']) => onStatus(status === s ? 'todos' : s);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><ClipboardList className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Fichas</p>
              <p className="text-2xl font-bold text-foreground">{total}</p>
            </div>
          </CardContent>
        </Card>
        <button type="button" onClick={() => alternar('assinada')} className="text-left"
          title={status === 'assinada' ? 'Mostrar todas' : 'Mostrar só as assinadas'}>
          <Card className={`h-full transition-colors hover:border-success/60 ${status === 'assinada' ? 'border-success' : ''}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><CheckCircle2 className="h-5 w-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Assinadas</p>
                <p className="text-2xl font-bold text-foreground">
                  {assinadas} <span className="text-sm font-medium text-muted-foreground">{pct}%</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </button>
        <button type="button" onClick={() => alternar('pendente')} className="text-left"
          title={status === 'pendente' ? 'Mostrar todas' : 'Mostrar só as pendentes'}>
          <Card className={`h-full transition-colors hover:border-warning/60 ${status === 'pendente' ? 'border-warning' : ''}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><Clock className="h-5 w-5 text-warning" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-foreground">{pendentes}</p>
              </div>
            </CardContent>
          </Card>
        </button>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Package className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Itens entregues</p>
              <p className="text-2xl font-bold text-foreground">{itens}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {total > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Fichas por mês</CardTitle>
              <Select value={String(meses)} onValueChange={v => setMeses(Number(v))}>
                <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                  <SelectItem value="24">Últimos 24 meses</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porMes} margin={{ top: 20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={tick} />
                    <YAxis tick={tick} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="assinadas" name="Assinadas" stackId="f" fill="hsl(var(--success))" />
                    <Bar dataKey="pendentes" name="Pendentes" stackId="f" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total" position="top" fontSize={11} fill="hsl(var(--foreground))" formatter={(v: number) => (v ? v : '')} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Por motivo</CardTitle></CardHeader>
            <CardContent>
              <div className="w-full h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porMotivo} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={tick} allowDecimals={false} />
                    <YAxis type="category" dataKey="motivo" tick={tick} width={96} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                    <Bar dataKey="fichas" name="Fichas" fill="hsl(213 80% 55%)" radius={[0, 4, 4, 0]} barSize={28}>
                      <LabelList dataKey="fichas" position="right" fontSize={11} fill="hsl(var(--foreground))" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
