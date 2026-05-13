import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ArrowDown, ArrowUp, Package } from 'lucide-react';
import { listMovimentacoes, MovimentacaoDia, listEpis } from '@/services/estoqueService';
import { supabase } from '@/integrations/supabase/client';

export default function EstoqueChart() {
  const [dias, setDias] = useState<number>(30);
  const [data, setData] = useState<MovimentacaoDia[]>([]);
  const [estoqueTotal, setEstoqueTotal] = useState(0);

  const reload = async () => {
    const [m, epis] = await Promise.all([listMovimentacoes(dias), listEpis()]);
    setData(m);
    setEstoqueTotal(epis.reduce((s, e) => s + (e.estoque_atual || 0), 0));
  };

  useEffect(() => {
    reload();
    const channel = supabase
      .channel('estoque-mov-chart')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimentacoes_estoque' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'epis' }, reload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const totalEntradas = data.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = data.reduce((s, d) => s + d.saidas, 0);

  const chartData = data.map(d => ({
    ...d,
    label: new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    saldo: d.entradas - d.saidas,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10"><ArrowUp className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Entradas no período</p>
              <p className="text-2xl font-bold text-foreground">{totalEntradas}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><ArrowDown className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Saídas no período</p>
              <p className="text-2xl font-bold text-foreground">{totalSaidas}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Package className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo atual em estoque</p>
              <p className="text-2xl font-bold text-foreground">{estoqueTotal}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Movimentação de estoque</CardTitle>
          <Select value={String(dias)} onValueChange={(v) => setDias(parseInt(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="365">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const lbl = name === 'entradas' ? 'Entradas' : name === 'saidas' ? 'Saídas' : 'Saldo';
                    return [value, lbl];
                  }}
                  labelFormatter={(label, payload) => {
                    if (!payload?.[0]) return label;
                    const d = payload[0].payload;
                    return `${label} · saldo do dia: ${d.saldo > 0 ? '+' : ''}${d.saldo}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entradas" name="Entradas" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="hsl(20 90% 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
