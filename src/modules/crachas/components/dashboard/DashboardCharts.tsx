import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
} from 'recharts';
import { Camera, CameraOff, Building2, CalendarDays, FileText, TrendingUp } from 'lucide-react';

const COLORS = [
  'hsl(225, 73%, 57%)',
  'hsl(152, 69%, 40%)',
  'hsl(38, 92%, 50%)',
  'hsl(195, 85%, 48%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 72%, 55%)',
  'hsl(160, 50%, 45%)',
  'hsl(30, 80%, 55%)',
];

const GRADIENT_PAIRS = [
  ['hsl(225, 73%, 57%)', 'hsl(225, 73%, 72%)'],
  ['hsl(152, 69%, 40%)', 'hsl(152, 69%, 60%)'],
  ['hsl(38, 92%, 50%)', 'hsl(38, 92%, 65%)'],
  ['hsl(195, 85%, 48%)', 'hsl(195, 85%, 65%)'],
  ['hsl(280, 60%, 55%)', 'hsl(280, 60%, 70%)'],
  ['hsl(0, 72%, 55%)', 'hsl(0, 72%, 70%)'],
];

export function DashboardCharts() {
  const { data } = useQuery({
    queryKey: ['dashboard-charts'],
    queryFn: async () => {
      const employees: { company: string | null; role: string | null; photo_url: string | null; valid_until: string | null; request_reason: string | null; created_at: string }[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from('cracha_employees')
          .select('company, role, photo_url, valid_until, request_reason, created_at')
          .is('desligado_em', null)
          .order('id')
          .range(de, de + 999);
        if (error) throw error;
        employees.push(...(data ?? []));
        if (!data || data.length < 1000) return employees;
      }
    },
  });

  // Filter out employees without validity
  const filtered = (data || []).filter(e => e.valid_until);
  if (!filtered || filtered.length === 0) return null;

  const total = filtered.length;
  const withPhoto = filtered.filter(e => e.photo_url).length;
  const withoutPhoto = total - withPhoto;
  const photoPercent = total > 0 ? Math.round((withPhoto / total) * 100) : 0;
  const photoData = [
    { name: 'Com Foto', value: withPhoto },
    { name: 'Sem Foto', value: withoutPhoto },
  ];

  const companyMap: Record<string, number> = {};
  filtered.forEach(e => {
    const c = e.company || 'Não informada';
    companyMap[c] = (companyMap[c] || 0) + 1;
  });
  const companyData = Object.entries(companyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, value }));

  const reasonMap: Record<string, number> = {};
  filtered.forEach(e => {
    const r = e.request_reason || 'Não informado';
    reasonMap[r] = (reasonMap[r] || 0) + 1;
  });
  const reasonData = Object.entries(reasonMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 13) + '…' : name, fullName: name, value, percent: total > 0 ? Math.round((value / total) * 100) : 0 }));

  const monthMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    monthMap[key] = 0;
  }
  filtered.forEach(e => {
    const d = new Date(e.created_at);
    const key = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    if (key in monthMap) monthMap[key]++;
  });
  const monthData = Object.entries(monthMap).map(([name, value]) => ({ name, value }));
  const maxMonth = Math.max(...monthData.map(m => m.value), 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl px-4 py-2.5 shadow-xl">
        <p className="text-xs font-bold text-foreground">{label || payload[0]?.payload?.fullName || payload[0]?.name}</p>
        <p className="text-lg font-bold text-primary">{payload[0]?.value}</p>
        <p className="text-[10px] text-muted-foreground">colaborador(es)</p>
      </div>
    );
  };

  const renderCustomBarLabel = ({ x, y, width, value }: any) => (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-xs font-bold">
      {value}
    </text>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Photo Status - Donut with center stat */}
      <div className="section-card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style={{ background: 'var(--gradient-primary)', filter: 'blur(40px)' }} />
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-primary/10">
            <Camera className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Status de Fotos</h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={photoData}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                >
                  <Cell fill="hsl(152, 69%, 40%)" />
                  <Cell fill="hsl(220, 20%, 90%)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-foreground leading-none">{photoPercent}%</span>
              <span className="text-[10px] text-muted-foreground font-medium mt-0.5">completo</span>
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/10">
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Camera className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-foreground leading-none">{withPhoto}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Com foto</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <CameraOff className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-foreground leading-none">{withoutPhoto}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Sem foto</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Registrations by Month - Area chart */}
      <div className="section-card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style={{ background: 'hsl(225, 73%, 57%)', filter: 'blur(40px)' }} />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Cadastros por Mês</h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-lg">
            <TrendingUp className="h-3 w-3" />
            <span className="font-semibold">{total} total</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={monthData}>
            <defs>
              <linearGradient id="monthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(225, 73%, 57%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(225, 73%, 57%)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,92%)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(220,10%,46%)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,46%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(225, 73%, 57%)"
              strokeWidth={2.5}
              fill="url(#monthGradient)"
              dot={{ r: 5, fill: 'hsl(225, 73%, 57%)', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7, fill: 'hsl(225, 73%, 57%)', strokeWidth: 3, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* By Company - Horizontal bars with values */}
      <div className="section-card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style={{ background: 'hsl(195, 85%, 48%)', filter: 'blur(40px)' }} />
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-accent/10">
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Colaboradores por Empresa</h3>
        </div>
        <div className="space-y-3">
          {companyData.map((item, i) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground truncate max-w-[60%]">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{item.value}</span>
                    <span className="text-[10px] text-muted-foreground">({percent.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${percent}%`,
                      background: `linear-gradient(90deg, ${GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][0]}, ${GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][1]})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By Request Reason - Styled bar chart with labels */}
      <div className="section-card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style={{ background: 'hsl(38, 92%, 50%)', filter: 'blur(40px)' }} />
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-xl bg-warning/10">
            <FileText className="h-4 w-4 text-warning" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Motivos de Solicitação</h3>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={reasonData} barSize={32}>
            <defs>
              {reasonData.map((_, i) => (
                <linearGradient key={i} id={`reasonGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][1]} />
                  <stop offset="100%" stopColor={GRADIENT_PAIRS[i % GRADIENT_PAIRS.length][0]} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,20%,92%)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(220,10%,46%)', fontWeight: 500 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,46%)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(220,20%,95%)', radius: 8 }} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} label={renderCustomBarLabel}>
              {reasonData.map((_, i) => (
                <Cell key={i} fill={`url(#reasonGrad${i})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
