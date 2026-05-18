import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, AlertTriangle, CheckCircle2, Clock, CalendarX, TrendingUp, Users,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichas, seedDemoData } from '@/services/fichaService';
import { getConfig } from '@/services/configService';
import { getItemValidade } from '@/lib/validade';
import { useAuth } from '@/contexts/AuthContext';

interface VencimentoItem {
  fichaId: string;
  nomeFuncionario: string;
  item: EPIItem;
  diasRestantes: number;
}

const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [fichas, setFichas] = useState<EPIFicha[]>([]);

  useEffect(() => {
    seedDemoData();
    getFichas().then(setFichas);
  }, []);

  const totalFichas = fichas.length;
  const fichasAssinadas = fichas.filter(f => f.status === 'assinada').length;
  const fichasPendentes = fichas.filter(f => f.status === 'pendente').length;
  const colaboradoresUnicos = new Set(fichas.map(f => f.nomeFuncionario)).size;

  const hoje = new Date();
  const cfg = getConfig();
  const vencimentos: VencimentoItem[] = [];
  fichas.forEach(ficha => {
    ficha.itens.forEach(item => {
      const validadeStr = getItemValidade(item, ficha, cfg.diasValidadeEpi);
      if (validadeStr) {
        const validade = new Date(validadeStr);
        const diff = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        vencimentos.push({ fichaId: ficha.id, nomeFuncionario: ficha.nomeFuncionario, item: { ...item, dataValidade: validadeStr }, diasRestantes: diff });
      }
    });
  });
  const vencidos = vencimentos.filter(v => v.diasRestantes <= 0);
  const proximosVencer = vencimentos.filter(v => v.diasRestantes > 0 && v.diasRestantes <= 30);
  const emDia = vencimentos.filter(v => v.diasRestantes > 30);
  const alertas = [...vencidos, ...proximosVencer].sort((a, b) => a.diasRestantes - b.diasRestantes);

  // ========== Chart data ==========
  // 1. Fichas por mês (últimos 6 meses) - área
  const fichasPorMes = useMemo(() => {
    const meses: { mes: string; assinadas: number; pendentes: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const label = d.toLocaleDateString('pt-BR', { month: 'short' });
      const fimMes = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const fdoMes = fichas.filter(f => {
        const c = new Date(f.criadoEm);
        return c >= d && c < fimMes;
      });
      meses.push({
        mes: label.charAt(0).toUpperCase() + label.slice(1).replace('.', ''),
        assinadas: fdoMes.filter(f => f.status === 'assinada').length,
        pendentes: fdoMes.filter(f => f.status === 'pendente').length,
      });
    }
    return meses;
  }, [fichas]);

  // 2. Status pizza
  const statusData = [
    { name: 'Assinadas', value: fichasAssinadas, color: CHART_COLORS.success },
    { name: 'Pendentes', value: fichasPendentes, color: CHART_COLORS.warning },
  ].filter(d => d.value > 0);

  // 3. Vencimentos por categoria
  const vencimentosData = [
    { name: 'Vencidos', total: vencidos.length, fill: CHART_COLORS.destructive },
    { name: 'Próximos', total: proximosVencer.length, fill: CHART_COLORS.warning },
    { name: 'Em Dia', total: emDia.length, fill: CHART_COLORS.success },
  ];

  // 4. Top 5 EPIs mais entregues
  const topEpis = useMemo(() => {
    const map = new Map<string, number>();
    fichas.forEach(f => f.itens.forEach(i => {
      const key = (i.descricao || 'Sem descrição').substring(0, 25);
      map.set(key, (map.get(key) || 0) + (i.quantidade || 0));
    }));
    return Array.from(map.entries())
      .map(([descricao, total]) => ({ descricao, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [fichas]);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Hero */}
        <div className="rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-6 lg:p-8 shadow-lg flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Bem-vindo de volta</p>
            <h2 className="text-2xl lg:text-3xl font-bold mt-1">Olá, {user?.nome} 👋</h2>
            <p className="text-sm opacity-90 mt-1.5">
              {isAdmin ? 'Você tem acesso total ao sistema.' : 'Modo somente leitura — apenas administradores podem alterar dados.'}
            </p>
          </div>
          <Badge variant="secondary" className="bg-white/15 text-primary-foreground border-white/20 text-xs uppercase tracking-wider">
            {isAdmin ? 'Administrador' : 'Operador'}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard icon={ClipboardList} label="Total de Fichas" value={totalFichas} color="primary" />
          <StatCard icon={CheckCircle2} label="Assinadas" value={fichasAssinadas} color="success" />
          <StatCard icon={Clock} label="Pendentes" value={fichasPendentes} color="warning" />
          <StatCard icon={Users} label="Colaboradores" value={colaboradoresUnicos} color="primary" />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Fichas por mês */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Fichas geradas (últimos 6 meses)
              </CardTitle>
              <CardDescription>Volume mensal de fichas assinadas e pendentes</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={fichasPorMes} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAssinadas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPendentes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="assinadas" stroke={CHART_COLORS.success} strokeWidth={2} fill="url(#gradAssinadas)" name="Assinadas" />
                  <Area type="monotone" dataKey="pendentes" stroke={CHART_COLORS.warning} strokeWidth={2} fill="url(#gradPendentes)" name="Pendentes" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status pizza */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status das Fichas</CardTitle>
              <CardDescription>Distribuição atual</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%" cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Vencimentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status de Vencimento</CardTitle>
              <CardDescription>Itens monitorados</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={vencimentosData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top EPIs */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Top 5 EPIs mais entregues</CardTitle>
              <CardDescription>Total de unidades distribuídas</CardDescription>
            </CardHeader>
            <CardContent>
              {topEpis.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Sem dados ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topEpis} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="descricao" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={140} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="total" fill={CHART_COLORS.primary} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX className="h-5 w-5 text-destructive" /> Alertas de Vencimento
            </CardTitle>
            <CardDescription>EPIs vencidos ou próximos do vencimento (30 dias)</CardDescription>
          </CardHeader>
          <CardContent>
            {alertas.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-success/40" />
                <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alertas.slice(0, 8).map((v, i) => (
                  <Link key={i} to={`/ficha/${v.fichaId}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      {v.diasRestantes <= 0
                        ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                        : <Clock className="h-5 w-5 text-warning shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{v.item.descricao}</p>
                        <p className="text-xs text-muted-foreground">{v.nomeFuncionario} · CA: {v.item.ca || '—'}</p>
                      </div>
                      <Badge variant="secondary" className={v.diasRestantes <= 0
                        ? 'bg-destructive/10 text-destructive border-destructive/20'
                        : 'bg-warning/10 text-warning border-warning/20'}>
                        {v.diasRestantes <= 0
                          ? `Vencido há ${Math.abs(v.diasRestantes)}d`
                          : `${v.diasRestantes}d restantes`}
                      </Badge>
                    </div>
                  </Link>
                ))}
                {alertas.length > 8 && (
                  <Link to="/vencimentos">
                    <p className="text-sm text-primary text-center mt-2 hover:underline">
                      Ver todos os {alertas.length} alertas →
                    </p>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
