import { Badge } from '@/components/ui/badge';
import { useRecentEmployees } from '@/modules/crachas/hooks/useEmployees';
import { CheckCircle, User, Loader2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RecentActivityReal() {
  const { data: employees, isLoading } = useRecentEmployees(5);

  if (isLoading) {
    return (
      <div className="section-card p-6 animate-slide-up">
        <h3 className="text-lg font-bold text-foreground mb-4">Atividade Recente</h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4 p-3">
              <div className="h-10 w-10 rounded-xl bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted rounded-lg animate-pulse" />
                <div className="h-3 w-48 bg-muted rounded-lg animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!employees || employees.length === 0) {
    return (
      <div className="section-card p-6 animate-slide-up">
        <h3 className="text-lg font-bold text-foreground mb-4">Atividade Recente</h3>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
            <Clock className="h-6 w-6 opacity-40" />
          </div>
          <p className="text-sm font-medium">Nenhum colaborador sincronizado ainda</p>
          <p className="text-xs mt-1 opacity-60">Sincronize uma planilha para ver atividades</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-foreground">Atividade Recente</h3>
        <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
          {employees.length} registros
        </span>
      </div>
      <div className="space-y-1">
        {employees.map((employee, i) => (
          <div
            key={employee.id}
            className={cn(
              'flex items-center gap-4 p-3 rounded-xl hover:bg-muted/40 transition-all duration-200 group cursor-default animate-slide-right',
              `stagger-${Math.min(i + 1, 4)}`
            )}
          >
            {/* Avatar */}
            <div className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
              employee.photo_url
                ? 'bg-success/10 text-success'
                : 'bg-warning/10 text-warning'
            )}>
              {employee.photo_url ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {employee.full_name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {employee.role || 'Cargo não definido'} • <span className="font-mono">{employee.employee_id}</span>
              </p>
            </div>

            {/* Status & Date */}
            <div className="text-right shrink-0">
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-semibold border-0 px-2 py-0.5',
                  employee.photo_url
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                )}
              >
                {employee.photo_url ? 'Completo' : 'Pendente'}
              </Badge>
              <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
                {new Date(employee.updated_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
