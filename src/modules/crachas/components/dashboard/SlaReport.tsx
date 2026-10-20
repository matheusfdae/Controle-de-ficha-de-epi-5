import { useEmployees } from '@/modules/crachas/hooks/useEmployees';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/modules/crachas/components/ui/empty-state';
import { Clock, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function getSlaDays(): number {
  try {
    const val = localStorage.getItem('sla_days');
    return val ? parseInt(val, 10) || 5 : 5;
  } catch {
    return 5;
  }
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export function SlaReport() {
  const { data: employees = [], isLoading } = useEmployees();
  const navigate = useNavigate();
  const slaDays = getSlaDays();
  const now = new Date();

  // Filter employees whose request is overdue (created_at + slaDays business days < now)
  // and that haven't had a badge generated yet (no valid_until or pending status)
  const overdue = employees.filter(e => {
    if (!e.created_at) return false;
    const deadline = addBusinessDays(new Date(e.created_at), slaDays);
    return now > deadline;
  });

  // Split into severity ranges
  const getOverdueDays = (createdAt: string) => {
    const deadline = addBusinessDays(new Date(createdAt), slaDays);
    const diffMs = now.getTime() - deadline.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const critical = overdue.filter(e => getOverdueDays(e.created_at) > 10);
  const high = overdue.filter(e => {
    const d = getOverdueDays(e.created_at);
    return d > 5 && d <= 10;
  });
  const moderate = overdue.filter(e => {
    const d = getOverdueDays(e.created_at);
    return d >= 1 && d <= 5;
  });

  const ranges = [
    { label: 'Crítico (>10 dias)', count: critical.length, variant: 'destructive' as const },
    { label: 'Alto (6–10 dias)', count: high.length, variant: 'warning' as const },
    { label: 'Moderado (1–5 dias)', count: moderate.length, variant: 'default' as const },
  ].filter(r => r.count > 0);

  if (isLoading) {
    return (
      <div className="section-card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="section-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-destructive" />
          Fora do Prazo (SLA)
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground border-border">
            Prazo: {slaDays} dias
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${overdue.length > 0 ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`}>
            {overdue.length} total
          </Badge>
        </div>
      </div>

      {ranges.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-6 w-6" />}
          title="Nenhuma solicitação fora do prazo"
          description={`Todas as solicitações estão dentro do prazo de ${slaDays} dias úteis`}
          className="py-8"
        />
      ) : (
        <div className="space-y-2">
          {ranges.map(r => (
            <div
              key={r.label}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
              onClick={() => navigate('/crachas/colaboradores')}
            >
              <div className={`p-2 rounded-lg ${r.variant === 'destructive' ? 'bg-destructive/10 text-destructive' : r.variant === 'warning' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{r.label}</p>
              </div>
              <Badge variant="secondary" className="font-bold">{r.count}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
