import { useEmployees } from '@/modules/crachas/hooks/useEmployees';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/modules/crachas/components/ui/empty-state';
import { AlertCircle, Camera, FileWarning, User, ArrowRight, ShieldAlert, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv, todayStamp } from '@/modules/crachas/lib/csvExport';
import { toast } from 'sonner';

/** Roles that require CNV to be filled */
const ROLES_REQUIRING_CNV = ['vigilante', 'vigilante patrimonial', 'vigilante líder'];

function isCnvRequired(role: string | null): boolean {
  if (!role) return false;
  return ROLES_REQUIRING_CNV.includes(role.toLowerCase().trim());
}

export function PendingReport() {
  const { data: employees = [], isLoading } = useEmployees();
  const navigate = useNavigate();

  const noPhoto = employees.filter(e => !e.photo_url);
  const noRole = employees.filter(e => !e.role);
  const noCnv = employees.filter(e => isCnvRequired(e.role) && !e.cnv);

  const categories = [
    { label: 'Sem foto', count: noPhoto.length, icon: Camera, variant: 'warning' as const },
    { label: 'Sem cargo', count: noRole.length, icon: FileWarning, variant: 'default' as const },
    { label: 'Vigilante sem CNV', count: noCnv.length, icon: ShieldAlert, variant: 'destructive' as const },
  ].filter(c => c.count > 0);

  const totalPending = noPhoto.length + noRole.length + noCnv.length;

  if (isLoading) {
    return (
      <div className="section-card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  const handleExport = () => {
    const rows: any[][] = [];
    noPhoto.forEach(e => rows.push([e.full_name, e.employee_id, e.role || '-', e.company || '-', 'Sem foto']));
    noRole.forEach(e => rows.push([e.full_name, e.employee_id, '-', e.company || '-', 'Sem cargo']));
    noCnv.forEach(e => rows.push([e.full_name, e.employee_id, e.role || '-', e.company || '-', 'Vigilante sem CNV']));
    if (rows.length === 0) {
      toast.info('Nenhum pendente para exportar');
      return;
    }
    downloadCsv(`pendentes_${todayStamp()}.csv`, ['Nome', 'Matrícula', 'Cargo', 'Empresa', 'Pendência'], rows);
    toast.success(`${rows.length} pendente(s) exportado(s)`);
  };

  return (
    <div className="section-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">Pendentes</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
            {totalPending} itens
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExport}
            title="Exportar CSV"
            disabled={totalPending === 0}
          >
            <FileDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={<User className="h-6 w-6" />}
          title="Tudo em dia!"
          description="Nenhum colaborador com dados pendentes"
          className="py-8"
        />
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div
              key={cat.label}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
              onClick={() => navigate('/crachas/colaboradores')}
            >
              <div className={`p-2 rounded-lg ${cat.variant === 'warning' ? 'bg-warning/10 text-warning' : cat.variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                <cat.icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{cat.label}</p>
              </div>
              <Badge variant="secondary" className="font-bold">{cat.count}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
