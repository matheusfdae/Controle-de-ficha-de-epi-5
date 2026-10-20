import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { PageHeader } from '@/modules/crachas/components/layout/PageHeader';
import { StatCard } from '@/modules/crachas/components/dashboard/StatCard';
import { RecentActivityReal } from '@/modules/crachas/components/dashboard/RecentActivityReal';
import { DuplicateRequestsReport } from '@/modules/crachas/components/dashboard/DuplicateRequestsReport';
import { PendingReport } from '@/modules/crachas/components/dashboard/PendingReport';
import { ExpiringReport } from '@/modules/crachas/components/dashboard/ExpiringReport';
import { SlaReport } from '@/modules/crachas/components/dashboard/SlaReport';
import { DashboardCharts } from '@/modules/crachas/components/dashboard/DashboardCharts';
import { TourButton } from '@/modules/crachas/components/tour/TourButton';
import { Users, CreditCard, AlertTriangle, Clock, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useEmployeeStats } from '@/modules/crachas/hooks/useEmployeeStats';
import { useDashboardRealtime } from '@/modules/crachas/hooks/useDashboardRealtime';

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useEmployeeStats(null);
  useDashboardRealtime();

  return (
    <MainLayout>
      <PageHeader
        title="Dashboard"
        description="Visão geral do sistema de gestão de crachás"
        actions={
          <>
            <TourButton />
            <Button size="sm" className="gap-2" onClick={() => navigate('/crachas/gerar')}>
              <FileText className="h-4 w-4" />
              Gerar Crachás
            </Button>
          </>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="animate-slide-up stagger-1">
          <StatCard
            title="Total Colaboradores"
            value={statsLoading ? '—' : stats?.total || 0}
            subtitle={`${stats?.withPhoto || 0} com foto`}
            icon={<Users className="h-5 w-5" />}
            variant="primary"
          />
        </div>
        <div className="animate-slide-up stagger-2">
          <StatCard
            title="Crachás Emitidos"
            value={statsLoading ? '—' : stats?.badgesGenerated || 0}
            subtitle={`${stats?.withPhoto || 0} com foto cadastrada`}
            icon={<CreditCard className="h-5 w-5" />}
            variant="success"
          />
        </div>
        <div className="animate-slide-up stagger-3">
          <StatCard
            title="Pendentes"
            value={statsLoading ? '—' : stats?.pending || 0}
            subtitle={`${stats?.noPhoto || 0} sem foto, ${stats?.noRole || 0} sem cargo`}
            icon={<Clock className="h-5 w-5" />}
            variant="warning"
            action={
              <Button variant="link" size="sm" className="h-auto p-0 text-xs gap-1" onClick={() => navigate('/crachas/colaboradores')}>
                Ver pendentes <ArrowRight className="h-3 w-3" />
              </Button>
            }
          />
        </div>
        <div className="animate-slide-up stagger-4">
          <StatCard
            title="Vencimento Próximo"
            value={statsLoading ? '—' : stats?.expiringSoon || 0}
            subtitle="Próximos 30 dias"
            icon={<AlertTriangle className="h-5 w-5" />}
            variant="destructive"
            action={
              <Button variant="link" size="sm" className="h-auto p-0 text-xs gap-1" onClick={() => navigate('/crachas/colaboradores')}>
                Ver lista <ArrowRight className="h-3 w-3" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Main sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <PendingReport />
        <ExpiringReport />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <SlaReport />
        <DuplicateRequestsReport />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <RecentActivityReal />
      </div>

      {/* Charts */}
      <DashboardCharts />
    </MainLayout>
  );
};

export default Dashboard;
