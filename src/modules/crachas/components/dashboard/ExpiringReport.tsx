import { useEmployees } from '@/modules/crachas/hooks/useEmployees';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/modules/crachas/components/ui/empty-state';
import { CalendarClock, CheckCircle, ArrowRight, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv, todayStamp } from '@/modules/crachas/lib/csvExport';
import { toast } from 'sonner';

export function ExpiringReport() {
  const { data: employees = [], isLoading } = useEmployees();
  const navigate = useNavigate();

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const in15 = new Date(now.getTime() + 15 * 86400000);
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const getExpiring = (start: Date, end: Date) =>
    employees.filter(e => {
      if (!e.valid_until) return false;
      const d = new Date(e.valid_until);
      return d > start && d <= end;
    });

  const expired = employees.filter(e => e.valid_until && new Date(e.valid_until) <= now);
  const ranges = [
    { label: 'Vencidos', count: expired.length, variant: 'destructive' as const },
    { label: 'Próximos 7 dias', count: getExpiring(now, in7).length, variant: 'warning' as const },
    { label: 'Em 8–15 dias', count: getExpiring(in7, in15).length, variant: 'default' as const },
    { label: 'Em 16–30 dias', count: getExpiring(in15, in30).length, variant: 'default' as const },
  ].filter(r => r.count > 0);

  if (isLoading) {
    return (
      <div className="section-card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  const handleExport = () => {
    const eligible = employees.filter(e => !!e.valid_until);
    if (eligible.length === 0) {
      toast.info('Nenhum colaborador com validade para exportar');
      return;
    }
    const rows = eligible
      .sort((a, b) => new Date(a.valid_until!).getTime() - new Date(b.valid_until!).getTime())
      .map(e => {
        const d = new Date(e.valid_until!);
        const status = d <= now ? 'Vencido' : d <= in7 ? 'Vence em ≤7 dias' : d <= in15 ? 'Vence em 8-15 dias' : d <= in30 ? 'Vence em 16-30 dias' : 'Vigente';
        return [e.full_name, e.employee_id, e.role || '-', e.company || '-', d.toLocaleDateString('pt-BR'), status];
      });
    downloadCsv(`vencimentos_${todayStamp()}.csv`, ['Nome', 'Matrícula', 'Cargo', 'Empresa', 'Validade', 'Status'], rows);
    toast.success(`${rows.length} registro(s) exportado(s)`);
  };

  return (
    <div className="section-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">Vencimentos</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
            {ranges.reduce((s, r) => s + r.count, 0)} total
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExport}
            title="Exportar CSV"
            disabled={employees.filter(e => !!e.valid_until).length === 0}
          >
            <FileDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {ranges.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-6 w-6" />}
          title="Nenhum vencimento próximo"
          description="Todos os crachás estão com validade em dia"
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
                <CalendarClock className="h-4 w-4" />
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
