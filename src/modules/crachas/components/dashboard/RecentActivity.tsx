import { Badge } from '@/components/ui/badge';
import { mockHistory, mockEmployees } from '@/modules/crachas/data/mockData';
import { CheckCircle, RefreshCw, XCircle, Edit } from 'lucide-react';

const actionIcons = {
  emitido: CheckCircle,
  reemitido: RefreshCw,
  cancelado: XCircle,
  alterado: Edit,
};

const actionLabels = {
  emitido: 'Emitido',
  reemitido: 'Reemitido',
  cancelado: 'Cancelado',
  alterado: 'Alterado',
};

const actionColors = {
  emitido: 'bg-success/10 text-success border-success/20',
  reemitido: 'bg-primary/10 text-primary border-primary/20',
  cancelado: 'bg-destructive/10 text-destructive border-destructive/20',
  alterado: 'bg-warning/10 text-warning border-warning/20',
};

export function RecentActivity() {
  const recentHistory = mockHistory.slice(0, 5);

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card animate-slide-up">
      <h3 className="text-lg font-semibold text-foreground mb-4">Atividade Recente</h3>
      <div className="space-y-4">
        {recentHistory.map((item) => {
          const employee = mockEmployees.find(e => e.id === item.employeeId);
          const Icon = actionIcons[item.acao];
          
          return (
            <div key={item.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <div className={`p-2 rounded-lg ${actionColors[item.acao]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {employee?.nomeCompleto || 'Colaborador'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.observacao || `Crachá ${actionLabels[item.acao].toLowerCase()}`}
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className={actionColors[item.acao]}>
                  {actionLabels[item.acao]}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(item.dataAcao).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
