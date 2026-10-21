import type { TablesUpdate } from '@/integrations/supabase/types';
import { revisarSolicitacao } from '@/modules/crachas/lib/solicitacaoService';
import { useState } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { BadgeRenderer } from '@/modules/crachas/components/badge/BadgeRenderer';
import { mapEmployeeToBadgeData } from '@/modules/crachas/lib/badgeFieldMap';
import { useEmployees, Employee } from '@/modules/crachas/hooks/useEmployees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, MoreVertical, Eye, Edit, FileDown, Printer, RefreshCw, UserPlus, Filter, Loader2, User, ShieldCheck, ShieldAlert, ImageOff, Trash2, CheckCircle2, XCircle, Clock, Inbox } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/modules/crachas/components/layout/PageHeader';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateBadgesPDF, downloadPDF, printPDF } from '@/modules/crachas/lib/pdfGenerator';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePhotoValidation } from '@/modules/crachas/hooks/usePhotoValidation';
import { Progress } from '@/components/ui/progress';
import { atualizarDaSenior } from '@/services/colaboradoresSeniorService';
import { useAuth } from '@/contexts/AuthContext';

const Colaboradores = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showBadgeDialog, setShowBadgeDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [atualizandoSenior, setAtualizandoSenior] = useState(false);
  const { can } = useAuth();
  const podeAtualizarSenior = can('colaboradores', 'edit');

  // Mesma atualização da tela Colaboradores Senior; o banco leva as mudanças para os crachás.
  const atualizarSenior = async () => {
    setAtualizandoSenior(true);
    const aviso = toast.loading('Atualizando da Senior… (leva uns 2 minutos)');
    try {
      const r = await atualizarDaSenior(texto => toast.loading(texto, { id: aviso }));
      toast.success(`${r.total} colaboradores atualizados${r.inativados ? `; ${r.inativados} saíram da Senior (desligados)` : ''}.`,
        { id: aviso, duration: 10000 });
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-stats'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar', { id: aviso });
    } finally {
      setAtualizandoSenior(false);
    }
  };
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [reviewingEmployee, setReviewingEmployee] = useState<Employee | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'full_name' | 'employee_id' | 'role' | 'company' } | null>(null);
  const [cellDraft, setCellDraft] = useState('');

  const commitCellEdit = async (employee: Employee, field: 'full_name' | 'employee_id' | 'role' | 'company', value: string) => {
    const trimmed = value.trim();
    const current = (employee as any)[field] ?? '';
    if (trimmed === (current ?? '')) { setEditingCell(null); return; }
    if ((field === 'full_name' || field === 'employee_id') && !trimmed) {
      toast.error(field === 'full_name' ? 'Nome não pode ficar vazio' : 'Matrícula não pode ficar vazia');
      setEditingCell(null);
      return;
    }
    try {
      const { error } = await supabase
        .from('cracha_employees')
        .update({ [field]: trimmed || null } as TablesUpdate<'cracha_employees'>)
        .eq('id', employee.id);
      if (error) throw error;
      toast.success('Alteração salva');
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setEditingCell(null);
    }
  };

  const EditableCell = ({ employee, field, value, className }: { employee: Employee; field: 'full_name' | 'employee_id' | 'role' | 'company'; value: string; className?: string }) => {
    const isEditing = editingCell?.id === employee.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={cellDraft}
          onChange={(e) => setCellDraft(e.target.value)}
          onBlur={() => commitCellEdit(employee, field, cellDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitCellEdit(employee, field, cellDraft); }
            else if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); }
          }}
          className="w-full bg-background border border-primary outline-none px-1 py-0.5 text-[13px] font-sans"
        />
      );
    }
    return (
      <div
        onClick={() => { setEditingCell({ id: employee.id, field }); setCellDraft(value || ''); }}
        className={cn('cursor-cell min-h-[20px] hover:bg-primary/5 rounded-sm px-1 -mx-1', className)}
        title="Clique para editar"
      >
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    );
  };
  const [editForm, setEditForm] = useState({
    full_name: '',
    employee_id: '',
    cnv: '',
    role: '',
    company: '',
    photo_url: '',
    valid_until: '',
    rg: '',
    cpf: '',
    blood_type: '',
    access_level: '',
    qr_value: '',
    request_reason: '',
    phone: '',
    address: '',
  });
  const [addForm, setAddForm] = useState({
    full_name: '',
    role: '',
    company: '',
    employee_id: '',
  });

  const { data: employees = [], isLoading } = useEmployees();

  const { photoStatuses, isValidating, progress: validationProgress, validateAll, clearValidation, validCount, invalidCount } = usePhotoValidation();

  // Fetch active template for PDF generation
  const { data: activeTemplate } = useQuery({
    queryKey: ['active-template-for-colaboradores'],
    queryFn: async () => {
      const { data: tpls } = await supabase
        .from('cracha_badge_templates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!tpls || tpls.length === 0) return null;
      const tpl = tpls[0];
      const { data: elements } = await supabase
        .from('cracha_template_elements')
        .select('*')
        .eq('template_id', tpl.id);
      return { ...tpl, elements: elements || [] };
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const filteredEmployees = employees.filter(emp => {
    const searchMatch = !search ||
      emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      (emp.role && emp.role.toLowerCase().includes(search.toLowerCase()));
    
    const statusMatch = statusFilter === 'todos' ||
      (statusFilter === 'com_foto' && emp.photo_url) ||
      (statusFilter === 'sem_foto' && !emp.photo_url) ||
      (statusFilter === 'foto_ok' && photoStatuses[emp.id] === 'valid') ||
      (statusFilter === 'foto_invalida' && photoStatuses[emp.id] === 'invalid') ||
      (statusFilter === 'sol_recebida' && emp.request_status === 'recebida') ||
      (statusFilter === 'sol_analise' && emp.request_status === 'em_analise') ||
      (statusFilter === 'sol_aprovada' && emp.request_status === 'aprovada') ||
      (statusFilter === 'sol_rejeitada' && emp.request_status === 'rejeitada') ||
      (statusFilter === 'sol_todas' && !!emp.request_status);
    
    return searchMatch && statusMatch;
  });

  const handleValidatePhotos = async () => {
    const results = await validateAll(employees);
    const inv = Object.values(results).filter(s => s === 'invalid').length;
    if (inv > 0) {
      toast.warning(`${inv} colaborador(es) com foto inacessível`);
      setStatusFilter('foto_invalida');
    } else {
      toast.success('Todas as fotos estão acessíveis!');
    }
  };

  const toBadgeData = (emp: Employee) => mapEmployeeToBadgeData(emp);

  const handleViewBadge = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowBadgeDialog(true);
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditForm({
      full_name: employee.full_name || '',
      employee_id: employee.employee_id || '',
      cnv: employee.cnv || '',
      role: employee.role || '',
      company: employee.company || '',
      photo_url: employee.photo_url || '',
      valid_until: employee.valid_until ? employee.valid_until.substring(0, 10) : '',
      rg: employee.rg || '',
      cpf: employee.cpf || '',
      blood_type: employee.blood_type || '',
      access_level: employee.access_level || '',
      qr_value: employee.qr_value || '',
      request_reason: employee.request_reason || '',
      phone: employee.phone || '',
      address: employee.address || '',
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmployee) return;
    try {
      const payload: Record<string, any> = {
        full_name: editForm.full_name,
        employee_id: editForm.employee_id,
      };
      const optional: (keyof typeof editForm)[] = [
        'cnv','role','company','photo_url','valid_until','rg','cpf',
        'blood_type','access_level','qr_value','request_reason','phone','address',
      ];
      optional.forEach((k) => { payload[k] = editForm[k] ? editForm[k] : null; });

      const { error } = await supabase
        .from('cracha_employees')
        .update(payload as TablesUpdate<'cracha_employees'>)
        .eq('id', selectedEmployee.id);

      if (error) throw error;
      toast.success('Colaborador atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
      setShowEditDialog(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  };

  const updateRequestStatus = async (
    employee: Employee,
    status: 'recebida' | 'em_analise' | 'aprovada' | 'rejeitada',
    reason?: string,
  ) => {
    setIsUpdatingStatus(true);
    try {
      // Mesma regra da tela Solicitações: aprovada, a foto enviada vira a do crachá.
      await revisarSolicitacao(employee, status, reason);
      queryClient.invalidateQueries({ queryKey: ['cracha_solicitacoes'] });
      const labels: Record<string, string> = {
        recebida: 'marcada como Recebida',
        em_analise: 'marcada como Em análise',
        aprovada: 'Aprovada',
        rejeitada: 'Rejeitada',
      };
      toast.success(`Solicitação ${labels[status]}`);
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
      setReviewingEmployee(null);
      setRejectionReason('');
    } catch (err: any) {
      toast.error('Erro ao atualizar status: ' + err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };


  const handleAddEmployee = async () => {
    if (!addForm.full_name || !addForm.employee_id) {
      toast.error('Nome e matrícula são obrigatórios');
      return;
    }

    try {
      const { error } = await supabase
        .from('cracha_employees')
        .insert({
          full_name: addForm.full_name,
          employee_id: addForm.employee_id,
          role: addForm.role || null,
          company: addForm.company || null,
        });

      if (error) throw error;
      toast.success('Colaborador adicionado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
      setShowAddDialog(false);
      setAddForm({ full_name: '', role: '', company: '', employee_id: '' });
    } catch (error: any) {
      toast.error('Erro ao adicionar: ' + error.message);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { downloadCsv, todayStamp } = await import('@/modules/crachas/lib/csvExport');
      const rows = filteredEmployees.map(emp => [
        emp.full_name,
        emp.employee_id,
        emp.role || '',
        emp.company || '',
        emp.valid_until ? new Date(emp.valid_until).toLocaleDateString('pt-BR') : '',
        emp.photo_url ? 'Com foto' : 'Sem foto',
      ]);
      downloadCsv(
        `colaboradores_${todayStamp()}.csv`,
        ['Nome', 'Matrícula', 'Cargo', 'Empresa', 'Validade', 'Status'],
        rows,
      );
      toast.success(`${rows.length} colaborador(es) exportado(s)`);
    } catch {
      toast.error('Erro ao exportar dados');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedEmployee) return;
    setIsGeneratingPdf(true);
    try {
      const pdf = await generateBadgesPDF({
        employees: [toBadgeData(selectedEmployee)],
        template: activeTemplate || null,
        singlePerPage: true,
      });
      downloadPDF(pdf, `cracha-${selectedEmployee.employee_id}.pdf`);
      toast.success('PDF gerado com sucesso!');
    } catch {
      toast.error('Erro ao gerar PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedEmployee) return;
    setIsGeneratingPdf(true);
    try {
      const pdf = await generateBadgesPDF({
        employees: [toBadgeData(selectedEmployee)],
        template: activeTemplate || null,
        singlePerPage: true,
      });
      printPDF(pdf);
      toast.success('Enviado para impressão!');
    } catch {
      toast.error('Erro ao imprimir');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader
        title="Colaboradores"
        description={`Gerencie os dados e crachás dos colaboradores (${employees.length} total)`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleValidatePhotos} disabled={isValidating} data-guia="btn-crachas-validar-fotos">
              {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Validar Fotos
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Exportar
            </Button>
            {podeAtualizarSenior && (
              <Button variant="outline" size="sm" className="gap-2" onClick={atualizarSenior} disabled={atualizandoSenior} data-guia="btn-crachas-atualizar-senior">
                {atualizandoSenior ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar da Senior
              </Button>
            )}
            <Button size="sm" className="gap-2" onClick={() => setShowAddDialog(true)} data-guia="btn-crachas-adicionar">
              <UserPlus className="h-4 w-4" />
              Adicionar
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-card rounded-xl border border-border shadow-card">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros:</span>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, matrícula, cargo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="com_foto">Com Foto</SelectItem>
            <SelectItem value="sem_foto">Sem Foto</SelectItem>
            {Object.keys(photoStatuses).length > 0 && (
              <>
                <SelectItem value="foto_ok">✅ Foto Acessível</SelectItem>
                <SelectItem value="foto_invalida">❌ Foto Inacessível</SelectItem>
              </>
            )}
            <SelectItem value="sol_todas">📥 Todas solicitações públicas</SelectItem>
            <SelectItem value="sol_recebida">🟦 Recebida</SelectItem>
            <SelectItem value="sol_analise">🟡 Em análise</SelectItem>
            <SelectItem value="sol_aprovada">🟢 Aprovada</SelectItem>
            <SelectItem value="sol_rejeitada">🔴 Rejeitada</SelectItem>
          </SelectContent>
        </Select>
        {Object.keys(photoStatuses).length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-success font-medium">✅ {validCount}</span>
            <span className="text-destructive font-medium">❌ {invalidCount}</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { clearValidation(); setStatusFilter('todos'); }}>
              Limpar
            </Button>
          </div>
        )}
      </div>

      {/* Validation Progress */}
      {isValidating && (
        <div className="mb-4 p-3 bg-card rounded-xl border border-border shadow-card space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando fotos... {validationProgress}%
          </div>
          <Progress value={validationProgress} className="h-2" />
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/40 animate-fade-in">
          <p className="text-sm font-medium">
            {selectedIds.size} {selectedIds.size === 1 ? 'colaborador selecionado' : 'colaboradores selecionados'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Limpar seleção
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)} className="gap-2">
              <Trash2 className="h-4 w-4" /> Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Employee Table — estilo Excel */}
      <div className="bg-card rounded-md border border-border overflow-x-auto shadow-card animate-fade-in font-mono text-[13px]">
        <table className="w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
          <thead>
            {/* Linha de letras estilo Excel (A, B, C...) */}
            <tr className="bg-[#e7eaf0] dark:bg-muted text-muted-foreground">
              <th className="w-[36px] h-6 text-center text-[11px] font-semibold border border-border bg-[#d6dae3] dark:bg-muted/80"></th>
              {['A','B','C','D','E','F','G','H'].map((l) => (
                <th key={l} className="h-6 text-center text-[11px] font-semibold tracking-wide">{l}</th>
              ))}
            </tr>
            {/* Cabeçalhos reais */}
            <tr className="bg-[#f3f4f7] dark:bg-muted/60 text-foreground">
              <th className="w-[36px] text-center text-[11px] font-semibold bg-[#d6dae3] dark:bg-muted/80">#</th>
              <th className="w-[40px] px-2 py-1.5 text-left">
                <Checkbox
                  checked={filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.has(e.id))}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(filteredEmployees.map(e => e.id)));
                    else setSelectedIds(new Set());
                  }}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="w-[60px] px-2 py-1.5 text-left font-semibold">Foto</th>
              <th className="px-2 py-1.5 text-left font-semibold">Colaborador</th>
              <th className="px-2 py-1.5 text-left font-semibold">Matrícula</th>
              <th className="px-2 py-1.5 text-left font-semibold">Cargo</th>
              <th className="px-2 py-1.5 text-left font-semibold">Empresa</th>
              <th className="px-2 py-1.5 text-left font-semibold">Status</th>
              <th className="w-[70px] px-2 py-1.5 text-center font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  {search ? 'Nenhum colaborador encontrado' : 'Nenhum colaborador sincronizado. Vá em Conexões para importar.'}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((employee, idx) => {
                const isSelected = selectedIds.has(employee.id);
                return (
                <tr
                  key={employee.id}
                  className={cn(
                    'transition-colors',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                    isSelected && 'bg-primary/10 hover:bg-primary/15',
                    !isSelected && 'hover:bg-muted/40',
                  )}
                  data-state={isSelected ? 'selected' : undefined}
                >
                  <td className="w-[36px] text-center text-[11px] font-semibold text-muted-foreground bg-[#d6dae3] dark:bg-muted/80">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(employee.id); else next.delete(employee.id);
                          return next;
                        });
                      }}
                      aria-label={`Selecionar ${employee.full_name}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center">
                      {employee.photo_url ? (
                        <img src={getPhotoUrl(employee.photo_url)} alt={employee.full_name} className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} referrerPolicy="no-referrer" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 font-sans font-medium text-foreground whitespace-nowrap">
                    <EditableCell employee={employee} field="full_name" value={employee.full_name} />
                  </td>
                  <td className="px-2 py-1 tabular-nums">
                    <EditableCell employee={employee} field="employee_id" value={employee.employee_id} />
                  </td>
                  <td className="px-2 py-1 font-sans">
                    <EditableCell employee={employee} field="role" value={employee.role || ''} />
                  </td>
                  <td className="px-2 py-1 font-sans">
                    <EditableCell employee={employee} field="company" value={employee.company || ''} />
                  </td>
                  <td className="px-2 py-1 font-sans">
                    <div className="flex flex-col gap-1 items-start">
                      {employee.request_status && (() => {
                        const s = employee.request_status;
                        const map: Record<string, { label: string; cls: string; Icon: any }> = {
                          recebida:    { label: 'Recebida',    cls: 'bg-primary/10 text-primary border-primary/20',          Icon: Inbox },
                          em_analise:  { label: 'Em análise',  cls: 'bg-warning/10 text-warning border-warning/20',          Icon: Clock },
                          aprovada:    { label: 'Aprovada',    cls: 'bg-success/10 text-success border-success/20',          Icon: CheckCircle2 },
                          rejeitada:   { label: 'Rejeitada',   cls: 'bg-destructive/10 text-destructive border-destructive/20', Icon: XCircle },
                        };
                        const cfg = map[s] || map.recebida;
                        const Icon = cfg.Icon;
                        return (
                          <>
                            <Badge
                              variant="outline"
                              className={cn(cfg.cls, 'gap-1')}
                              title={s === 'rejeitada' && employee.rejection_reason ? `Motivo: ${employee.rejection_reason}` : undefined}
                            >
                              <Icon className="h-3 w-3" /> {cfg.label}
                            </Badge>
                            {s === 'rejeitada' && employee.rejection_reason && (
                              <span className="text-xs text-destructive max-w-[220px] whitespace-normal leading-snug">
                                <strong>Motivo:</strong> {employee.rejection_reason}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {photoStatuses[employee.id] === 'invalid' ? (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                          <ImageOff className="h-3 w-3" /> Inacessível
                        </Badge>
                      ) : photoStatuses[employee.id] === 'valid' ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1">
                          <ShieldCheck className="h-3 w-3" /> OK
                        </Badge>
                      ) : employee.photo_url ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">Com foto</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Sem foto</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewBadge(employee)}>
                          <Eye className="h-4 w-4 mr-2" /> Visualizar Crachá
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditEmployee(employee)}>
                          <Edit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        {employee.request_status && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={employee.request_status === 'em_analise'}
                              onClick={() => updateRequestStatus(employee, 'em_analise')}
                            >
                              <Clock className="h-4 w-4 mr-2 text-warning" /> Marcar em análise
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={employee.request_status === 'aprovada'}
                              onClick={() => updateRequestStatus(employee, 'aprovada')}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2 text-success" /> Aprovar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={employee.request_status === 'rejeitada'}
                              onClick={() => { setReviewingEmployee(employee); setRejectionReason(employee.rejection_reason || ''); }}
                            >
                              <XCircle className="h-4 w-4 mr-2 text-destructive" /> Rejeitar...
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingEmployeeId(employee.id)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        Mostrando {filteredEmployees.length} de {employees.length} colaboradores
      </p>

      {/* Badge Preview Dialog */}
      <Dialog open={showBadgeDialog} onOpenChange={setShowBadgeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Visualização do Crachá</DialogTitle>
            <DialogDescription>Pré-visualização do crachá do colaborador</DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="flex flex-col items-center gap-4 py-4">
              {activeTemplate ? (
                <BadgeRenderer data={toBadgeData(selectedEmployee)} scale={0.95} template={activeTemplate} />
              ) : (
                <div className="text-sm text-muted-foreground">Nenhum modelo configurado</div>
              )}
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1 gap-2" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Baixar PDF
                </Button>
                <Button className="flex-1 gap-2" onClick={handlePrint} disabled={isGeneratingPdf}>
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
            <DialogDescription>Atualize todos os dados mapeados do colaborador</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome Completo *</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Matrícula *</Label>
              <Input value={editForm.employee_id} onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CNV</Label>
              <Input value={editForm.cnv} onChange={(e) => setEditForm({ ...editForm, cnv: e.target.value.replace(/\D+/g, '') })} placeholder="Somente números" />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>RG</Label>
              <Input value={editForm.rg} onChange={(e) => setEditForm({ ...editForm, rg: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo Sanguíneo</Label>
              <Input value={editForm.blood_type} onChange={(e) => setEditForm({ ...editForm, blood_type: e.target.value })} placeholder="Ex.: O+" />
            </div>
            <div className="space-y-2">
              <Label>Nível de Acesso</Label>
              <Input value={editForm.access_level} onChange={(e) => setEditForm({ ...editForm, access_level: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Validade</Label>
              <Input type="date" value={editForm.valid_until} onChange={(e) => setEditForm({ ...editForm, valid_until: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Local de Trabalho / Endereço</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>URL da Foto</Label>
              <Input value={editForm.photo_url} onChange={(e) => setEditForm({ ...editForm, photo_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>QR Code (valor)</Label>
              <Input value={editForm.qr_value} onChange={(e) => setEditForm({ ...editForm, qr_value: e.target.value })} placeholder="Padrão: matrícula" />
            </div>
            <div className="space-y-2">
              <Label>Motivo da Solicitação</Label>
              <Input value={editForm.request_reason} onChange={(e) => setEditForm({ ...editForm, request_reason: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-4 md:col-span-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSaveEdit}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Colaborador</DialogTitle>
            <DialogDescription>Preencha os dados do novo colaborador</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="Nome do colaborador" />
            </div>
            <div className="space-y-2">
              <Label>Matrícula *</Label>
              <Input value={addForm.employee_id} onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })} placeholder="Número da matrícula" />
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} placeholder="Cargo" />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={addForm.company} onChange={(e) => setAddForm({ ...addForm, company: e.target.value })} placeholder="Empresa" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddEmployee}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingEmployeeId} onOpenChange={(open) => !open && setDeletingEmployeeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Colaborador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este colaborador? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deletingEmployeeId) return;
                try {
                  const { error } = await supabase.from('cracha_employees').delete().eq('id', deletingEmployeeId);
                  if (error) throw error;
                  toast.success('Colaborador excluído com sucesso!');
                  queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
                } catch (error: any) {
                  toast.error('Erro ao excluir: ' + error.message);
                } finally {
                  setDeletingEmployeeId(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={(open) => !open && !isBulkDeleting && setShowBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} colaboradores</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir os {selectedIds.size} colaboradores selecionados? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setIsBulkDeleting(true);
                try {
                  const ids = Array.from(selectedIds);
                  const { error } = await supabase.from('cracha_employees').delete().in('id', ids);
                  if (error) throw error;
                  toast.success(`${ids.length} colaboradores excluídos!`);
                  setSelectedIds(new Set());
                  queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
                } catch (error: any) {
                  toast.error('Erro ao excluir: ' + error.message);
                } finally {
                  setIsBulkDeleting(false);
                  setShowBulkDeleteConfirm(false);
                }
              }}
            >
              {isBulkDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo...</> : 'Excluir todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Request Dialog */}
      <Dialog open={!!reviewingEmployee} onOpenChange={(open) => { if (!open) { setReviewingEmployee(null); setRejectionReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar solicitação</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. O motivo ficará registrado na solicitação de {reviewingEmployee?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Motivo da rejeição *</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Ex.: Foto fora do padrão, dados divergentes, documentação incompleta..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewingEmployee(null); setRejectionReason(''); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={isUpdatingStatus || !rejectionReason.trim()}
              onClick={() => reviewingEmployee && updateRequestStatus(reviewingEmployee, 'rejeitada', rejectionReason.trim())}
            >
              {isUpdatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Colaboradores;
