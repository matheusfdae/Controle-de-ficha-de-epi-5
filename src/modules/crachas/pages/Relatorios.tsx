import { useState } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { PageHeader } from '@/modules/crachas/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileDown, Loader2, Users, Printer, History, RefreshCw, ShieldCheck, AlertCircle,
  BarChart3, Calendar, Building2, Briefcase, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/modules/crachas/hooks/useUserRole';
import { useEmployees } from '@/modules/crachas/hooks/useEmployees';
import { useAuth } from '@/modules/crachas/hooks/useAuth';
import { Navigate } from 'react-router-dom';

type ReportType = 'employees' | 'badges_issued' | 'sync_history' | 'summary';

const reportTypes = [
  { id: 'employees' as ReportType, label: 'Colaboradores', icon: Users, description: 'Lista completa com dados e status de foto' },
  { id: 'badges_issued' as ReportType, label: 'Crachás Emitidos', icon: Printer, description: 'Histórico de emissões com confirmação' },
  { id: 'sync_history' as ReportType, label: 'Sincronizações', icon: RefreshCw, description: 'Logs de sincronização com planilha' },
  { id: 'summary' as ReportType, label: 'Resumo Geral', icon: BarChart3, description: 'Estatísticas consolidadas do sistema' },
];

const Relatorios = () => {
  const { user } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [activeReport, setActiveReport] = useState<ReportType>('employees');
  const [isExporting, setIsExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: employees = [] } = useEmployees();

  const { data: batches = [] } = useQuery({
    queryKey: ['report-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_generation_batches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['report-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_sync_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (roleLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/crachas" replace />;
  }

  // Statistics
  const totalEmployees = employees.length;
  const withPhoto = employees.filter(e => e.photo_url).length;
  const withoutPhoto = totalEmployees - withPhoto;
  const uniqueCompanies = [...new Set(employees.map(e => e.company).filter(Boolean))];
  const uniqueRoles = [...new Set(employees.map(e => e.role).filter(Boolean))];
  const totalBadgesIssued = batches.reduce((acc, b) => acc + (b.processed_badges || 0), 0);
  const confirmedBatches = batches.filter(b => b.confirmed_at).length;
  const totalSyncs = syncLogs.length;
  const successfulSyncs = syncLogs.filter(l => l.status === 'success').length;
  const totalRecordsSynced = syncLogs.reduce((acc, l) => acc + (l.total_records || 0), 0);

  const generatePDF = async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const addHeader = (title: string) => {
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, 22);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth - margin, 22, { align: 'right' });
        doc.text('Sistema de Crachás – Grupo 5 Estrelas', pageWidth - margin, 28, { align: 'right' });
        y = 45;
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setFillColor(241, 245, 249);
        doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
        doc.text('Documento confidencial – uso exclusivo administrativo', margin, pageHeight - 5);
      };

      const checkPage = (needed: number) => {
        if (y + needed > pageHeight - 20) {
          doc.addPage();
          y = margin + 5;
          return true;
        }
        return false;
      };

      const drawTableRow = (cells: string[], widths: number[], isHeader: boolean, rowY: number) => {
        const rowHeight = 7;
        if (isHeader) {
          doc.setFillColor(241, 245, 249);
          doc.rect(margin, rowY, contentWidth, rowHeight, 'F');
          doc.setTextColor(30, 41, 59);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
        } else {
          doc.setTextColor(51, 65, 85);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
        }
        let x = margin + 2;
        cells.forEach((cell, i) => {
          doc.text(String(cell || '-').substring(0, 40), x, rowY + 4.5);
          x += widths[i];
        });
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, rowY + rowHeight, margin + contentWidth, rowY + rowHeight);
        return rowHeight;
      };

      if (activeReport === 'employees') {
        addHeader('Relatório de Colaboradores');

        // Stats boxes
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(margin, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin + contentWidth / 3, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin + (contentWidth / 3) * 2, y, contentWidth / 3, 18, 2, 2, 'F');

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(String(totalEmployees), margin + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Total', margin + 8, y + 15);

        doc.setTextColor(22, 101, 52);
        doc.text(String(withPhoto), margin + contentWidth / 3 + 8, y + 11);
        doc.setFontSize(16);
        doc.text(String(withPhoto), margin + contentWidth / 3 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Com Foto', margin + contentWidth / 3 + 8, y + 15);

        doc.setTextColor(146, 64, 14);
        doc.setFontSize(16);
        doc.text(String(withoutPhoto), margin + (contentWidth / 3) * 2 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Sem Foto', margin + (contentWidth / 3) * 2 + 8, y + 15);

        y += 25;

        // Table
        const headers = ['Nome', 'Matrícula', 'Cargo', 'Empresa', 'Foto', 'Cadastro'];
        const widths = [50, 25, 35, 30, 18, 22];
        y += drawTableRow(headers, widths, true, y);

        for (const emp of employees) {
          checkPage(8);
          const row = [
            emp.full_name,
            emp.employee_id,
            emp.role || '-',
            emp.company || '-',
            emp.photo_url ? 'Sim' : 'Não',
            format(new Date(emp.created_at), 'dd/MM/yy'),
          ];
          y += drawTableRow(row, widths, false, y);
        }

      } else if (activeReport === 'badges_issued') {
        addHeader('Relatório de Crachás Emitidos');

        doc.setFillColor(239, 246, 255);
        doc.roundedRect(margin, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin + contentWidth / 3, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin + (contentWidth / 3) * 2, y, contentWidth / 3, 18, 2, 2, 'F');

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(String(batches.length), margin + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Lotes', margin + 8, y + 15);

        doc.setTextColor(22, 101, 52);
        doc.setFontSize(16);
        doc.text(String(totalBadgesIssued), margin + contentWidth / 3 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Crachás', margin + contentWidth / 3 + 8, y + 15);

        doc.setTextColor(146, 64, 14);
        doc.setFontSize(16);
        doc.text(String(confirmedBatches), margin + (contentWidth / 3) * 2 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Confirmados', margin + (contentWidth / 3) * 2 + 8, y + 15);

        y += 25;

        const headers = ['Data', 'Status', 'Total', 'Processados', 'Falhas', 'Formato', 'Confirmação'];
        const widths = [28, 22, 18, 25, 18, 20, 49];
        y += drawTableRow(headers, widths, true, y);

        for (const batch of batches) {
          checkPage(8);
          const row = [
            format(new Date(batch.created_at), 'dd/MM/yy HH:mm'),
            batch.status === 'completed' ? 'Concluído' : batch.status === 'pending' ? 'Pendente' : batch.status,
            String(batch.total_badges),
            String(batch.processed_badges),
            String(batch.failed_badges),
            batch.export_format?.toUpperCase() || 'PDF',
            batch.confirmed_by_name ? `${batch.confirmed_by_name} (${format(new Date(batch.confirmed_at!), 'dd/MM/yy')})` : 'Pendente',
          ];
          y += drawTableRow(row, widths, false, y);
        }

      } else if (activeReport === 'sync_history') {
        addHeader('Relatório de Sincronizações');

        doc.setFillColor(239, 246, 255);
        doc.roundedRect(margin, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(margin + contentWidth / 3, y, contentWidth / 3 - 3, 18, 2, 2, 'F');
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin + (contentWidth / 3) * 2, y, contentWidth / 3, 18, 2, 2, 'F');

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(String(totalSyncs), margin + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Total', margin + 8, y + 15);

        doc.setTextColor(22, 101, 52);
        doc.setFontSize(16);
        doc.text(String(successfulSyncs), margin + contentWidth / 3 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Sucesso', margin + contentWidth / 3 + 8, y + 15);

        doc.setTextColor(146, 64, 14);
        doc.setFontSize(16);
        doc.text(String(totalRecordsSynced), margin + (contentWidth / 3) * 2 + 8, y + 11);
        doc.setFontSize(7);
        doc.text('Registros', margin + (contentWidth / 3) * 2 + 8, y + 15);

        y += 25;

        const headers = ['Data', 'Status', 'Total', 'Novos', 'Atualizados', 'Ignorados', 'Erro'];
        const widths = [28, 18, 18, 18, 25, 22, 51];
        y += drawTableRow(headers, widths, true, y);

        for (const log of syncLogs) {
          checkPage(8);
          const row = [
            format(new Date(log.created_at), 'dd/MM/yy HH:mm'),
            log.status === 'success' ? 'OK' : 'Erro',
            String(log.total_records),
            String(log.new_records),
            String(log.updated_records),
            String(log.skipped_records),
            log.error_message || '-',
          ];
          y += drawTableRow(row, widths, false, y);
        }

      } else if (activeReport === 'summary') {
        addHeader('Resumo Geral do Sistema');

        const drawStatBlock = (label: string, value: string, x: number, bgColor: [number, number, number], textColor: [number, number, number]) => {
          doc.setFillColor(...bgColor);
          doc.roundedRect(x, y, (contentWidth - 12) / 4, 22, 2, 2, 'F');
          doc.setTextColor(...textColor);
          doc.setFontSize(18);
          doc.setFont('helvetica', 'bold');
          doc.text(value, x + 8, y + 13);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(label, x + 8, y + 19);
        };

        const blockW = (contentWidth - 12) / 4;
        drawStatBlock('Colaboradores', String(totalEmployees), margin, [239, 246, 255], [30, 64, 175]);
        drawStatBlock('Com Foto', String(withPhoto), margin + blockW + 4, [240, 253, 244], [22, 101, 52]);
        drawStatBlock('Crachás Emitidos', String(totalBadgesIssued), margin + (blockW + 4) * 2, [254, 249, 195], [146, 64, 14]);
        drawStatBlock('Sincronizações', String(totalSyncs), margin + (blockW + 4) * 3, [237, 233, 254], [88, 28, 135]);

        y += 30;

        // Companies breakdown
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Colaboradores por Empresa', margin, y);
        y += 6;

        const companyGroups = uniqueCompanies.map(c => ({
          name: c as string,
          count: employees.filter(e => e.company === c).length,
        })).sort((a, b) => b.count - a.count);

        if (companyGroups.length > 0) {
          const cHeaders = ['Empresa', 'Quantidade', '% do Total'];
          const cWidths = [80, 40, 40];
          y += drawTableRow(cHeaders, cWidths, true, y);
          for (const cg of companyGroups) {
            checkPage(8);
            y += drawTableRow([cg.name, String(cg.count), `${((cg.count / totalEmployees) * 100).toFixed(1)}%`], cWidths, false, y);
          }
        } else {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100, 116, 139);
          doc.text('Nenhuma empresa cadastrada', margin, y + 5);
          y += 10;
        }

        y += 10;
        checkPage(30);

        // Roles breakdown
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Colaboradores por Cargo', margin, y);
        y += 6;

        const roleGroups = uniqueRoles.map(r => ({
          name: r as string,
          count: employees.filter(e => e.role === r).length,
        })).sort((a, b) => b.count - a.count).slice(0, 20);

        if (roleGroups.length > 0) {
          const rHeaders = ['Cargo', 'Quantidade', '% do Total'];
          const rWidths = [80, 40, 40];
          y += drawTableRow(rHeaders, rWidths, true, y);
          for (const rg of roleGroups) {
            checkPage(8);
            y += drawTableRow([rg.name, String(rg.count), `${((rg.count / totalEmployees) * 100).toFixed(1)}%`], rWidths, false, y);
          }
        }
      }

      // Add footers
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      doc.save(`relatorio-${activeReport}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const currentReport = reportTypes.find(r => r.id === activeReport)!;

  return (
    <MainLayout>
      <PageHeader
        title="Relatórios"
        description="Relatórios administrativos para análise e exportação"
        actions={
          <Button className="gap-2" onClick={generatePDF} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Exportar PDF
          </Button>
        }
      />

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {reportTypes.map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id)}
            className={cn(
              'p-4 rounded-xl border text-left transition-all duration-200',
              activeReport === report.id
                ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20'
                : 'border-border bg-card hover:border-primary/30 hover:bg-muted/50'
            )}
          >
            <report.icon className={cn(
              'h-5 w-5 mb-2',
              activeReport === report.id ? 'text-primary' : 'text-muted-foreground'
            )} />
            <h3 className="font-semibold text-sm text-foreground">{report.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
          </button>
        ))}
      </div>

      {/* Report Content Preview */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <currentReport.icon className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">{currentReport.label}</h2>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
            <Lock className="h-3 w-3" />
            Admin
          </Badge>
        </div>

        {activeReport === 'employees' && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Foto</TableHead>
                  <TableHead>Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.slice(0, 15).map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">{emp.employee_id}</TableCell>
                    <TableCell>{emp.role || '-'}</TableCell>
                    <TableCell>{emp.company || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={emp.photo_url ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}>
                        {emp.photo_url ? 'Sim' : 'Não'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(emp.created_at), 'dd/MM/yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {employees.length > 15 && (
              <p className="text-xs text-muted-foreground p-3 text-center border-t border-border">
                Mostrando 15 de {employees.length} — o PDF conterá todos os registros
              </p>
            )}
          </div>
        )}

        {activeReport === 'badges_issued' && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Processados</TableHead>
                  <TableHead>Falhas</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Confirmação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma emissão registrada
                    </TableCell>
                  </TableRow>
                ) : batches.slice(0, 15).map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="text-sm">{format(new Date(batch.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        batch.status === 'completed' ? 'bg-success/10 text-success' :
                        batch.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning'
                      }>
                        {batch.status === 'completed' ? 'Concluído' : batch.status === 'pending' ? 'Pendente' : batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{batch.total_badges}</TableCell>
                    <TableCell>{batch.processed_badges}</TableCell>
                    <TableCell>{batch.failed_badges}</TableCell>
                    <TableCell className="uppercase text-xs font-mono">{batch.export_format}</TableCell>
                    <TableCell>
                      {batch.confirmed_by_name ? (
                        <div className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-success" />
                          <span className="text-xs">{batch.confirmed_by_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendente</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {batches.length > 15 && (
              <p className="text-xs text-muted-foreground p-3 text-center border-t border-border">
                Mostrando 15 de {batches.length} — o PDF conterá todos os registros
              </p>
            )}
          </div>
        )}

        {activeReport === 'sync_history' && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Novos</TableHead>
                  <TableHead>Atualizados</TableHead>
                  <TableHead>Ignorados</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma sincronização registrada
                    </TableCell>
                  </TableRow>
                ) : syncLogs.slice(0, 15).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        log.status === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                      }>
                        {log.status === 'success' ? 'Sucesso' : 'Erro'}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.total_records}</TableCell>
                    <TableCell>{log.new_records}</TableCell>
                    <TableCell>{log.updated_records}</TableCell>
                    <TableCell>{log.skipped_records}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{log.error_message || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {activeReport === 'summary' && (
          <div className="p-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <Users className="h-5 w-5 text-primary mb-2" />
                  <p className="text-2xl font-bold text-foreground">{totalEmployees}</p>
                  <p className="text-xs text-muted-foreground">Colaboradores</p>
                </CardContent>
              </Card>
              <Card className="border-success/20 bg-success/5">
                <CardContent className="p-4">
                  <ShieldCheck className="h-5 w-5 text-success mb-2" />
                  <p className="text-2xl font-bold text-foreground">{withPhoto}</p>
                  <p className="text-xs text-muted-foreground">Com Foto</p>
                </CardContent>
              </Card>
              <Card className="border-warning/20 bg-warning/5">
                <CardContent className="p-4">
                  <Printer className="h-5 w-5 text-warning mb-2" />
                  <p className="text-2xl font-bold text-foreground">{totalBadgesIssued}</p>
                  <p className="text-xs text-muted-foreground">Crachás Emitidos</p>
                </CardContent>
              </Card>
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardContent className="p-4">
                  <RefreshCw className="h-5 w-5 text-purple-500 mb-2" />
                  <p className="text-2xl font-bold text-foreground">{totalSyncs}</p>
                  <p className="text-xs text-muted-foreground">Sincronizações</p>
                </CardContent>
              </Card>
            </div>

            {/* Companies */}
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Por Empresa
              </h3>
              <div className="space-y-2">
                {uniqueCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada</p>
                ) : uniqueCompanies.map(c => {
                  const count = employees.filter(e => e.company === c).length;
                  const pct = totalEmployees > 0 ? (count / totalEmployees) * 100 : 0;
                  return (
                    <div key={String(c)} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-40 truncate">{String(c)}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roles */}
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" /> Por Cargo (top 10)
              </h3>
              <div className="space-y-2">
                {uniqueRoles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum cargo cadastrado</p>
                ) : uniqueRoles.slice(0, 10).map(r => {
                  const count = employees.filter(e => e.role === r).length;
                  const pct = totalEmployees > 0 ? (count / totalEmployees) * 100 : 0;
                  return (
                    <div key={String(r)} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-40 truncate">{String(r)}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-accent-foreground/30 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Relatorios;
