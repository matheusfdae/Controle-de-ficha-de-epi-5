import { IA_DISPONIVEL } from '@/modules/crachas/lib/recursos';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { PageHeader } from '@/modules/crachas/components/layout/PageHeader';
import { EmptyState } from '@/modules/crachas/components/ui/empty-state';
import { useEmployees, Employee } from '@/modules/crachas/hooks/useEmployees';
import { BadgeRenderer } from '@/modules/crachas/components/badge/BadgeRenderer';
import { mapEmployeeToBadgeData, validateBadgeData } from '@/modules/crachas/lib/badgeFieldMap';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  FileDown, Printer, CheckCircle, AlertCircle, Loader2, Search, User,
  X, Layers, ChevronDown, Filter, Package, Eye, RotateCw, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { generateBadgesPDF, downloadPDF, printPDF, generateBadgePNG } from '@/modules/crachas/lib/pdfGenerator';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { fetchImageAsDataUrl, replacePhotoBackgroundWithWhite, replacePhotoBackgroundWithAdvancedAI } from '@/modules/crachas/lib/badgeAssets';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/modules/crachas/hooks/useAuth';
import { validateBadgeGenerationInput } from '@/modules/crachas/lib/badgeGenerationValidation';
import { normalizeTemplateForRender } from '@/modules/crachas/lib/badgeTemplateNormalizer';
import { PhotoAdjustment, DEFAULT_PHOTO_ADJUSTMENT, isAdjustmentDefault } from '@/modules/crachas/lib/photoAdjustments';
import { Crop, ZoomIn, RotateCcw } from 'lucide-react';

const ITEMS_PER_PAGE = 20;

const GerarCrachas = () => {
  const { user } = useAuth();
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [previewEmployeeId, setPreviewEmployeeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [roleFilter, setRoleFilter] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'download' | 'print' | 'png'>('download');
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [pdfLayout, setPdfLayout] = useState<'auto' | 'grid-2x2'>('auto');
  const [removeBackground, setRemoveBackground] = useState(false);
  const [bgTolerance, setBgTolerance] = useState<number>(25);
  // Per-employee tolerance overrides for batch background removal.
  const [bgToleranceByEmployee, setBgToleranceByEmployee] = useState<Record<string, number>>({});
  // Per-employee opt-in to use the advanced AI (Gemini edge function) for stubborn photos.
  const [bgUseAdvancedByEmployee, setBgUseAdvancedByEmployee] = useState<Record<string, boolean>>({});
  const [bgScope, setBgScope] = useState<'all' | 'sample'>('all');
  const [bgSampleEmployeeId, setBgSampleEmployeeId] = useState<string | null>(null);
  const [bgPreviewLoading, setBgPreviewLoading] = useState(false);
  const [bgPreviewOriginal, setBgPreviewOriginal] = useState<string | null>(null);
  const [bgPreviewProcessed, setBgPreviewProcessed] = useState<string | null>(null);
  const [bgPreviewError, setBgPreviewError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [generationResults, setGenerationResults] = useState<{success: number; errors: string[]}>({ success: 0, errors: [] });

  // Per-employee photo adjustments (zoom + offset) applied right before export.
  const [photoAdjustments, setPhotoAdjustments] = useState<Record<string, PhotoAdjustment>>({});
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustEmployeeId, setAdjustEmployeeId] = useState<string | null>(null);

  const { data: employees = [], isLoading: loadingEmployees } = useEmployees();

  const { data: templates = [] } = useQuery({
    queryKey: ['badge-templates-with-elements'],
    queryFn: async () => {
      const { data: tpls, error } = await supabase
        .from('cracha_badge_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const templateIds = (tpls || []).map(t => t.id);
      if (templateIds.length === 0) return [];
      const { data: elements, error: elError } = await supabase
        .from('cracha_template_elements')
        .select('*')
        .in('template_id', templateIds);
      if (elError) throw elError;
      return (tpls || []).map(t => ({
        ...t,
        elements: (elements || []).filter(e => e.template_id === t.id),
      }));
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });


  const activeTemplate = templates.find(t => t.id === selectedTemplate) || null;
  const normalizedActiveTemplate = useMemo(
    () => normalizeTemplateForRender(activeTemplate),
    [activeTemplate]
  );

  if (templates.length > 0 && !selectedTemplate) {
    setSelectedTemplate(templates[0].id);
  }

  // Extract unique roles for filter
  const uniqueRoles = useMemo(() => {
    const roles = employees
      .map(e => e.role)
      .filter((r): r is string => !!r && r.trim() !== '');
    return [...new Set(roles)].sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const searchMatch = !searchTerm ||
        e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.role && e.role.toLowerCase().includes(searchTerm.toLowerCase()));
      const statusMatch = statusFilter === 'todos' ||
        (statusFilter === 'com_foto' && e.photo_url) ||
        (statusFilter === 'sem_foto' && !e.photo_url);
      const roleMatch = roleFilter === 'todos' ||
        (e.role && e.role === roleFilter);
      return searchMatch && statusMatch && roleMatch;
    });
  }, [employees, searchTerm, statusFilter, roleFilter]);

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
  const paginatedEmployees = filteredEmployees.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const previewEmployee = employees.find(e => e.id === previewEmployeeId) || employees[0];

  const toBadgeData = (emp: Employee) => mapEmployeeToBadgeData(emp);

  // Selection helpers
  const allPageSelected = paginatedEmployees.length > 0 && paginatedEmployees.every(e => selectedEmployees.includes(e.id));
  const somePageSelected = paginatedEmployees.some(e => selectedEmployees.includes(e.id));
  const allFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedEmployees.includes(e.id));

  const handleSelectPage = (checked: boolean) => {
    if (checked) {
      const pageIds = paginatedEmployees.map(e => e.id);
      setSelectedEmployees(prev => [...new Set([...prev, ...pageIds])]);
    } else {
      const pageIds = new Set(paginatedEmployees.map(e => e.id));
      setSelectedEmployees(prev => prev.filter(id => !pageIds.has(id)));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedEmployees(filteredEmployees.map(e => e.id));
    toast.success(`${filteredEmployees.length} colaboradores selecionados`);
  };

  const handleClearSelection = () => {
    setSelectedEmployees([]);
  };

  const handleSelectEmployee = (employeeId: string, checked: boolean) => {
    if (checked) {
      setSelectedEmployees(prev => [...prev, employeeId]);
      setPreviewEmployeeId(employeeId);
    } else {
      setSelectedEmployees(prev => {
        const updated = prev.filter(id => id !== employeeId);
        if (previewEmployeeId === employeeId) {
          setPreviewEmployeeId(updated.length > 0 ? updated[updated.length - 1] : null);
        }
        return updated;
      });
    }
  };

  const getSelectedEmployeesData = () => {
    return employees
      .filter(e => selectedEmployees.includes(e.id))
      .map(e => {
        const data: any = toBadgeData(e);
        const adj = photoAdjustments[e.id];
        if (adj && !isAdjustmentDefault(adj)) {
          data.photo_adjustment = adj;
        }
        return data;
      });
  };

  const updatePhotoAdjustment = (empId: string, patch: Partial<PhotoAdjustment>) => {
    setPhotoAdjustments(prev => ({
      ...prev,
      [empId]: { ...DEFAULT_PHOTO_ADJUSTMENT, ...prev[empId], ...patch },
    }));
  };

  const resetPhotoAdjustment = (empId: string) => {
    setPhotoAdjustments(prev => {
      const copy = { ...prev };
      delete copy[empId];
      return copy;
    });
  };

  const adjustedCount = Object.entries(photoAdjustments).filter(
    ([id, adj]) => selectedEmployees.includes(id) && !isAdjustmentDefault(adj)
  ).length;

  const openConfirm = (action: 'download' | 'print' | 'png') => {
    if (selectedEmployees.length === 0) {
      toast.error('Selecione pelo menos um colaborador');
      return;
    }
    setConfirmAction(action);
    setShowConfirmDialog(true);
  };


  const executeGeneration = async () => {
    setShowConfirmDialog(false);
    setIsGenerating(true);
    setGenerationProgress(0);
    setProgressMessage('Preparando...');
    
    try {
      const employeesData = getSelectedEmployeesData();

      if (!normalizedActiveTemplate) {
        toast.error('Selecione um modelo de crachá');
        return;
      }

      setProgressMessage('Validando modelo e recursos...');
      const validation = await validateBadgeGenerationInput({
        employees: employeesData,
        template: normalizedActiveTemplate,
      });

      if (!validation.ok) {
        setGenerationResults({ success: 0, errors: validation.errors });
        setShowResultDialog(true);
        return;
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach(w => toast.warning(w, { duration: 6000 }));
      }

      const handleProgress = (current: number, total: number, name?: string) => {
        if (name && !name.includes('/')) {
          setProgressMessage(`Gerando: ${name} (${current}/${total})`);
        } else if (name) {
          setProgressMessage(name);
        }
        setGenerationProgress(total > 0 ? (current / total) * 100 : 0);
      };

      if (confirmAction === 'png') {
        setProgressMessage('Carregando fotos...');
        for (let i = 0; i < employeesData.length; i++) {
          handleProgress(i + 1, employeesData.length, employeesData[i].full_name);
           const blob = await generateBadgePNG(employeesData[i], normalizedActiveTemplate, { removeBackground, bgRemovalTolerance: bgTolerance });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cracha_${employeesData[i].employee_id}_${employeesData[i].full_name.replace(/\s+/g, '_')}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        const pdf = await generateBadgesPDF({
          employees: employeesData,
          template: normalizedActiveTemplate,
          singlePerPage: employeesData.length === 1,
          badgesPerPage: 4,
          pdfLayout: employeesData.length === 1 ? 'auto' : pdfLayout,
          removeBackground,
          bgRemovalEmployeeIds: removeBackground && bgScope === 'sample' && bgSampleEmployeeId
            ? new Set([bgSampleEmployeeId])
            : undefined,
          bgRemovalTolerance: bgTolerance,
          bgRemovalToleranceByEmployee: removeBackground ? bgToleranceByEmployee : undefined,
          bgRemovalUseAdvancedByEmployee: removeBackground
            ? new Set(Object.entries(bgUseAdvancedByEmployee).filter(([, v]) => v).map(([k]) => k))
            : undefined,
          onProgress: handleProgress,
        });
        
        setGenerationProgress(100);
        setProgressMessage('Finalizando...');

        if (confirmAction === 'download') {
          const filename = employeesData.length === 1 
            ? `cracha-${employeesData[0].employee_id}.pdf`
            : `crachas-${new Date().toISOString().split('T')[0]}.pdf`;
          downloadPDF(pdf, filename);
        } else {
          printPDF(pdf);
        }
      }

      setGenerationProgress(100);

      // Register generation batch as "completed" (emitido)
      if (user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nome_completo, email')
            .eq('id', user.id)
            .single();

          await supabase.from('cracha_generation_batches').insert({
            user_id: user.id,
            template_id: activeTemplate?.id || null,
            export_format: confirmAction === 'png' ? 'png' : 'pdf',
            total_badges: employeesData.length,
            processed_badges: employeesData.length,
            failed_badges: 0,
            status: 'completed' as const,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
            confirmed_by_name: profile?.nome_completo || profile?.email || user.email || 'Usuário',
          });
        } catch (e) {
          console.warn('Failed to register generation batch:', e);
        }
      }

      // Persist valid_until for employees that didn't have one (1 year from now)
      try {
        const empsWithoutValidity = employees
          .filter(e => selectedEmployees.includes(e.id) && !e.valid_until)
          .map(e => e.id);
        if (empsWithoutValidity.length > 0) {
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          const validUntilStr = oneYearFromNow.toISOString().split('T')[0];
          for (const empId of empsWithoutValidity) {
            await supabase.from('cracha_employees').update({ valid_until: validUntilStr }).eq('id', empId);
          }
        }
      } catch (e) {
        console.warn('Failed to persist valid_until:', e);
      }

      setGenerationResults({ success: employeesData.length, errors: [] });
      setShowResultDialog(true);
    } catch (error) {
      console.error('Error generating:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setGenerationResults({
        success: 0,
        errors: [
          `Erro ao gerar crachás: ${msg}`,
          'Dicas: 1) Verifique se as fotos do Google Drive estão como "Qualquer pessoa com o link". 2) Confirme que o modelo selecionado tem dimensões válidas. 3) Tente gerar apenas 1 colaborador para isolar o problema.',
        ],
      });
      setShowResultDialog(true);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setProgressMessage('');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('todos');
    setRoleFilter('todos');
    setPage(1);
  };

  const hasFilters = searchTerm || statusFilter !== 'todos' || roleFilter !== 'todos';

  const selectedNames = getSelectedEmployeesData().slice(0, 5).map(e => e.full_name);
  const remainingCount = selectedEmployees.length - selectedNames.length;

  const handlePreviewBgRemoval = useCallback(async (
    employeeIdOverride?: string,
    toleranceOverride?: number,
    useAdvancedOverride?: boolean,
  ) => {
    setBgPreviewError(null);
    const targetId = employeeIdOverride
      ?? bgSampleEmployeeId
      ?? selectedEmployees[0]
      ?? null;
    const emp = targetId ? employees.find(e => e.id === targetId) : null;
    if (!emp) {
      setBgPreviewError('Selecione um colaborador para visualizar.');
      return;
    }
    const photoUrl = getPhotoUrl(emp.photo_url);
    if (!photoUrl || photoUrl === '/placeholder.svg') {
      setBgPreviewError('Este colaborador não possui foto cadastrada.');
      setBgPreviewOriginal(null);
      setBgPreviewProcessed(null);
      return;
    }
    setBgSampleEmployeeId(emp.id);
    setBgPreviewLoading(true);
    const tol = toleranceOverride ?? bgToleranceByEmployee[emp.id] ?? bgTolerance;
    const useAdvanced = useAdvancedOverride ?? bgUseAdvancedByEmployee[emp.id] ?? false;
    try {
      const original = await fetchImageAsDataUrl(photoUrl);
      if (!original) {
        throw new Error('Não foi possível carregar a foto original.');
      }
      setBgPreviewOriginal(original);
      setBgPreviewProcessed(null);

      const processed = useAdvanced
        ? await replacePhotoBackgroundWithAdvancedAI(photoUrl, original)
        : await replacePhotoBackgroundWithWhite(photoUrl, original, tol);
      setBgPreviewProcessed(processed);
    } catch (err: any) {
      console.error('[BgPreview] error:', err);
      const code = err?.code;
      if (code === 'credits-exhausted') {
        // Desativa IA avançada para este colaborador e cai para o modo padrão automaticamente.
        setBgUseAdvancedByEmployee((prev) => ({ ...prev, [emp.id]: false }));
        toast.error('Créditos de IA esgotados', {
          description: 'A IA avançada foi desativada para este colaborador. Usando o modo padrão. Adicione créditos em Configurações › Workspace › Uso para reativar.',
        });
        try {
          const original = bgPreviewOriginal ?? (await fetchImageAsDataUrl(photoUrl));
          if (original) {
            const fallback = await replacePhotoBackgroundWithWhite(photoUrl, original, tol);
            setBgPreviewProcessed(fallback);
          }
        } catch {/* ignore */}
      } else if (code === 'rate-limited') {
        toast.error('IA avançada com limite atingido', {
          description: 'Muitas requisições à IA avançada. Tente novamente em alguns instantes.',
        });
      } else {
        setBgPreviewError(err?.message || 'Erro ao processar a foto.');
      }
    } finally {
      setBgPreviewLoading(false);
    }
  }, [employees, selectedEmployees, bgSampleEmployeeId, bgTolerance, bgToleranceByEmployee, bgUseAdvancedByEmployee, bgPreviewOriginal, toast]);

  // Auto re-processar quando muda colaborador-amostra ou intensidade aplicada (debounced).
  useEffect(() => {
    if (!removeBackground) return;
    if (!bgSampleEmployeeId) return;
    if (!bgPreviewOriginal && !bgPreviewProcessed) return; // só auto-refresh se já houve uma prévia
    const tol = bgToleranceByEmployee[bgSampleEmployeeId] ?? bgTolerance;
    const t = setTimeout(() => {
      handlePreviewBgRemoval(bgSampleEmployeeId, tol);
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgSampleEmployeeId, bgTolerance, bgToleranceByEmployee, removeBackground]);

  return (
    <MainLayout>
      <PageHeader
        title="Gerar Crachás"
        description="Selecione colaboradores e gere crachás em lote para impressão"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Template Selection */}
          <div className="section-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Modelo de Crachá</h3>
                  <p className="text-xs text-muted-foreground">Modelo aplicado na geração</p>
                </div>
              </div>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filters bar */}
          <div className="section-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, matrícula ou cargo..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  className="pl-10 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="com_foto">Com Foto</SelectItem>
                  <SelectItem value="sem_foto">Sem Foto</SelectItem>
                </SelectContent>
              </Select>
              {uniqueRoles.length > 0 && (
                <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas Funções</SelectItem>
                    {uniqueRoles.map(role => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1">
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Selection actions bar */}
          {selectedEmployees.length > 0 && (
            <div className="sticky top-0 z-30 section-card p-3 border-primary/30 bg-primary/5 animate-slide-up">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground font-bold px-3 py-1">
                    {selectedEmployees.length} selecionado{selectedEmployees.length > 1 ? 's' : ''}
                  </Badge>
                  {!allFilteredSelected && filteredEmployees.length > paginatedEmployees.length && (
                    <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={handleSelectAllFiltered}>
                      Selecionar todos os {filteredEmployees.length} filtrados
                    </Button>
                  )}
                  <Button variant="link" size="sm" className="text-xs h-auto p-0 text-muted-foreground" onClick={handleClearSelection}>
                    Limpar seleção
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => openConfirm('png')}
                    disabled={isGenerating}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Baixar PNG
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => openConfirm('download')}
                    disabled={isGenerating}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Baixar PDF
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => openConfirm('print')}
                    disabled={isGenerating}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {loadingEmployees ? (
            <div className="section-card p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="section-card">
              <EmptyState
                icon={<Package className="h-7 w-7" />}
                title={searchTerm || statusFilter !== 'todos' ? 'Nenhum resultado encontrado' : 'Nenhum colaborador sincronizado'}
                description={searchTerm ? 'Tente ajustar os filtros de busca' : 'Vá em Conexões para importar dados da planilha'}
                action={hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>Limpar Filtros</Button>
                ) : undefined}
              />
            </div>
          ) : (
            <div className="section-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-[44px]">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={handleSelectPage}
                        aria-label="Selecionar página"
                      />
                    </TableHead>
                    <TableHead className="w-[44px]">Foto</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEmployees.map((employee) => {
                    const isSelected = selectedEmployees.includes(employee.id);
                    return (
                      <TableRow
                        key={employee.id}
                        className={cn(
                          'cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-muted/40'
                        )}
                        onClick={() => {
                          handleSelectEmployee(employee.id, !isSelected);
                          setPreviewEmployeeId(employee.id);
                        }}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectEmployee(employee.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                            {employee.photo_url ? (
                              <img src={getPhotoUrl(employee.photo_url)} alt={employee.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-foreground text-sm">{employee.full_name}</p>
                          <p className="text-xs text-muted-foreground">{employee.company || ''}</p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{employee.employee_id}</TableCell>
                        <TableCell className="text-sm">{employee.role || '—'}</TableCell>
                        <TableCell>
                          {employee.photo_url ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Pronto
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Sem foto
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {filteredEmployees.length} resultado{filteredEmployees.length !== 1 ? 's' : ''} • Página {page} de {totalPages || 1}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - Preview */}
        <div className="space-y-4">
          <div className="section-card p-6 sticky top-6">
            <h3 className="font-semibold text-foreground text-sm mb-4">Pré-visualização</h3>
            {previewEmployee ? (
              <>
                <div className="flex justify-center mb-4 overflow-hidden">
                  {activeTemplate ? (
                    <BadgeRenderer 
                      data={toBadgeData(previewEmployee)} 
                       template={normalizedActiveTemplate || activeTemplate}
                       scale={Math.min(0.85, 260 / ((normalizedActiveTemplate || activeTemplate).width_mm * 3.78))} 
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">Selecione um modelo</div>
                  )}
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium text-foreground text-sm">{previewEmployee.full_name}</p>
                  <p className="text-xs text-muted-foreground">{previewEmployee.role || 'Sem cargo'}</p>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<User className="h-6 w-6" />}
                title="Nenhum colaborador"
                description="Selecione um colaborador para ver o preview"
                className="py-8"
              />
            )}
            <div className="mt-6 pt-4 border-t border-border space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opções de Impressão</h4>
              {(() => {
                const templateForPreview = normalizedActiveTemplate || activeTemplate;
                const hasBack = templateForPreview && Boolean(
                  templateForPreview.has_back_side ||
                  templateForPreview.back_background_image_url ||
                  (templateForPreview.elements || []).some((el: any) => el.side === 'back')
                );
                const dims = templateForPreview ? `${templateForPreview.width_mm} × ${templateForPreview.height_mm} mm` : '85 × 54 mm';
                return [
                  ['Formato', dims],
                  ['Qualidade', '300 DPI'],
                  ['Frente e Verso', hasBack ? 'Sim' : 'Não'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{value}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Generation Progress Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="section-card p-8 max-w-sm w-full mx-4 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-semibold text-foreground">Gerando crachás...</p>
              <p className="text-xs text-muted-foreground mt-1">
                {progressMessage || `${selectedEmployees.length} crachá(s) em processamento`}
              </p>
            </div>
            <Progress value={generationProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">{Math.round(generationProgress)}%</p>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => {
        setShowConfirmDialog(open);
        if (!open) {
          setPreviewSide('front');
          setBgPreviewOriginal(null);
          setBgPreviewProcessed(null);
          setBgPreviewError(null);
        }
      }}>
        <DialogContent className="max-w-[100vw] w-screen h-screen sm:max-w-[100vw] sm:rounded-none p-6 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Comparação: Preview vs Exportação
            </DialogTitle>
            <DialogDescription>
              Compare a pré-visualização com o resultado final antes de gerar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {normalizedActiveTemplate && (() => {
              const hasBack = Boolean(
                normalizedActiveTemplate.has_back_side ||
                normalizedActiveTemplate.back_background_image_url ||
                (normalizedActiveTemplate.elements || []).some((el: any) => el.side === 'back')
              );
              const firstEmp = employees.find(e => selectedEmployees.includes(e.id));
              if (!firstEmp) return null;
              const badgeData = toBadgeData(firstEmp);
              const previewScale = Math.min(0.7, 220 / (normalizedActiveTemplate.width_mm * 3.78));
              return (
                <>
                  {hasBack && (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant={previewSide === 'front' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setPreviewSide('front')}
                      >
                        Frente
                      </Button>
                      <Button
                        variant={previewSide === 'back' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setPreviewSide('back')}
                      >
                        <RotateCw className="h-3 w-3" />
                        Verso
                      </Button>
                    </div>
                  )}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground text-center uppercase tracking-wide">
                        Layout de Exportação ({confirmAction === 'png' ? 'PNG' : 'PDF'})
                      </p>
                      <div className="flex justify-center rounded-xl border border-border bg-muted/30 p-3">
                        <BadgeRenderer
                          data={badgeData}
                          template={normalizedActiveTemplate}
                          scale={previewScale}
                          side={previewSide}
                          renderMode="export"
                        />
                      </div>
                    </div>
                  <p className="text-[10px] text-center text-muted-foreground">
                    Amostra: {firstEmp.full_name}
                  </p>
                </>
              );
            })()}

            {/* Layout selector — only for PDF with multiple badges */}
            {confirmAction !== 'png' && selectedEmployees.length > 1 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Layout do PDF
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfLayout('auto')}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      pdfLayout === 'auto'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-muted/40'
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">Automático</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Encaixa o máximo possível por folha A4
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfLayout('grid-2x2')}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      pdfLayout === 'grid-2x2'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-muted/40'
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">4 por folha (2×2)</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Exatamente 4 crachás centralizados, sem alterar o tamanho
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Photo adjustment (zoom + position) per employee */}
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Ajuste de foto
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aplique zoom e reposicionamento por colaborador antes de gerar.
                    {adjustedCount > 0 && (
                      <span className="ml-1 text-foreground font-medium">
                        ({adjustedCount} ajustado{adjustedCount > 1 ? 's' : ''})
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  disabled={selectedEmployees.length === 0}
                  onClick={() => {
                    const firstId = selectedEmployees[0];
                    if (firstId) setAdjustEmployeeId(firstId);
                    setShowAdjustDialog(true);
                  }}
                >
                  <Crop className="h-3.5 w-3.5" />
                  Ajustar fotos
                </Button>
              </div>
            </div>

            {/* Background removal toggle (AI) — temporariamente desativado */}
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tratamento de fotos
              </p>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 cursor-pointer hover:bg-muted/40 transition-colors">
                <Checkbox
                  checked={removeBackground}
                  onCheckedChange={(v) => setRemoveBackground(Boolean(v))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Trocar fundo das fotos para branco automaticamente
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Preserva a pessoa e substitui apenas a cor de fundo detectada por branco. Pode levar alguns segundos por foto.
                  </p>
                </div>
              </label>

              {removeBackground && (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-3">
                  {/* Scope selector: apply to all selected employees or only the sample */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Aplicar remoção em
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBgScope('all')}
                        className={cn(
                          'rounded-md border p-2 text-left transition-colors',
                          bgScope === 'all'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border bg-background hover:bg-muted/40'
                        )}
                      >
                        <p className="text-xs font-medium text-foreground">Todos selecionados</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {selectedEmployees.length} colaborador(es) — pode levar segundos por foto
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBgScope('sample')}
                        disabled={!bgSampleEmployeeId}
                        className={cn(
                          'rounded-md border p-2 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                          bgScope === 'sample'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border bg-background hover:bg-muted/40'
                        )}
                      >
                        <p className="text-xs font-medium text-foreground">Apenas a amostra</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {bgSampleEmployeeId
                            ? 'Usa a foto pré-visualizada; demais ficam originais'
                            : 'Visualize uma amostra primeiro para liberar'}
                        </p>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">
                      Pré-visualização do resultado
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handlePreviewBgRemoval()}
                      disabled={bgPreviewLoading || selectedEmployees.length === 0}
                    >
                      {bgPreviewLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          {bgPreviewProcessed ? 'Reprocessar' : 'Visualizar amostra'}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Seletor de colaborador-amostra */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Colaborador para validar
                    </p>
                    <Select
                      value={bgSampleEmployeeId ?? ''}
                      onValueChange={(v) => {
                        setBgSampleEmployeeId(v);
                        // Auto re-processa se já há prévia carregada
                        if (bgPreviewOriginal || bgPreviewProcessed) {
                          handlePreviewBgRemoval(v);
                        }
                      }}
                      disabled={selectedEmployees.length === 0}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Escolha um colaborador selecionado" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees
                          .filter((e) => selectedEmployees.includes(e.id))
                          .map((e) => (
                            <SelectItem key={e.id} value={e.id} className="text-xs">
                              {e.full_name} — {e.employee_id}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fine-tune slider for background match tolerance */}
                  <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-foreground">
                        Intensidade do ajuste
                      </p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {bgTolerance}
                      </span>
                    </div>
                    <Slider
                      value={[bgTolerance]}
                      onValueChange={(v) => setBgTolerance(v[0] ?? 25)}
                      min={5}
                      max={120}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Suave (preserva mais)</span>
                      <span>Forte (limpa mais fundo)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Aumente se sobrar fundo colorido. Diminua se a pessoa estiver sendo apagada. Clique em <strong>Reprocessar</strong> para ver o efeito.
                    </p>
                  </div>

                  {/* Per-employee tolerance overrides (batch fine-tuning) */}
                  {selectedEmployees.length > 0 && bgScope === 'all' && (
                    <details className="rounded-md border border-border bg-background/60 p-2.5 group">
                      <summary className="flex items-center justify-between cursor-pointer list-none">
                        <div>
                          <p className="text-[11px] font-medium text-foreground">
                            Ajuste fino por colaborador
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {Object.keys(bgToleranceByEmployee).length > 0
                              ? `${Object.keys(bgToleranceByEmployee).length} com intensidade personalizada`
                              : 'Todos usam a intensidade padrão acima'}
                          </p>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>

                      <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                        {Object.keys(bgToleranceByEmployee).length > 0 && (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => setBgToleranceByEmployee({})}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Resetar todos
                            </Button>
                          </div>
                        )}
                        {employees
                          .filter((e) => selectedEmployees.includes(e.id))
                          .map((emp) => {
                            const value = bgToleranceByEmployee[emp.id] ?? bgTolerance;
                            const isCustom = bgToleranceByEmployee[emp.id] !== undefined;
                            const useAdvanced = !!bgUseAdvancedByEmployee[emp.id];
                            return (
                              <div
                                key={emp.id}
                                className={cn(
                                  'rounded border bg-background p-2 space-y-1.5',
                                  useAdvanced ? 'border-primary/40' : 'border-border'
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-medium text-foreground truncate">
                                      {emp.full_name}
                                    </p>
                                    <p className="text-[9px] text-muted-foreground">
                                      Matrícula {emp.employee_id}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {useAdvanced && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-1">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        IA avançada
                                      </span>
                                    )}
                                    <span
                                      className={cn(
                                        'text-[10px] tabular-nums px-1.5 py-0.5 rounded',
                                        isCustom
                                          ? 'bg-primary/10 text-primary font-medium'
                                          : 'text-muted-foreground',
                                        useAdvanced && 'opacity-50 line-through'
                                      )}
                                    >
                                      {value}
                                    </span>
                                    {isCustom && !useAdvanced && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setBgToleranceByEmployee((prev) => {
                                            const copy = { ...prev };
                                            delete copy[emp.id];
                                            return copy;
                                          })
                                        }
                                        className="text-muted-foreground hover:text-foreground"
                                        title="Voltar ao padrão"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <Slider
                                  value={[value]}
                                  onValueChange={(v) =>
                                    setBgToleranceByEmployee((prev) => ({
                                      ...prev,
                                      [emp.id]: v[0] ?? bgTolerance,
                                    }))
                                  }
                                  min={5}
                                  max={120}
                                  step={1}
                                  disabled={useAdvanced}
                                  className="w-full"
                                />
                                <div className="flex justify-end gap-1 flex-wrap">
                                  {IA_DISPONIVEL && <Button
                                    type="button"
                                    size="sm"
                                    variant={useAdvanced ? 'default' : 'outline'}
                                    className="h-6 text-[10px] gap-1 px-2"
                                    onClick={() => {
                                      const next = !useAdvanced;
                                      setBgUseAdvancedByEmployee((prev) => ({ ...prev, [emp.id]: next }));
                                      // Atualiza prévia automaticamente para mostrar o resultado da IA.
                                      handlePreviewBgRemoval(emp.id, value, next);
                                    }}
                                    title="Usa IA avançada (Gemini) — consome créditos"
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    {useAdvanced ? 'IA ativada' : 'Reprocessar c/ IA avançada'}
                                  </Button>}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] gap-1"
                                    onClick={() => handlePreviewBgRemoval(emp.id, value, useAdvanced)}
                                  >
                                    <Eye className="h-3 w-3" />
                                    {bgSampleEmployeeId === emp.id ? 'Atualizar prévia' : 'Validar prévia'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </details>
                  )}

                  {bgPreviewError && (
                    <p className="text-[11px] text-destructive">{bgPreviewError}</p>
                  )}

                  {(bgPreviewOriginal || bgPreviewProcessed) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                          Original
                        </p>
                        <div className="aspect-square rounded-md border border-border bg-background overflow-hidden flex items-center justify-center">
                          {bgPreviewOriginal ? (
                            <img
                              src={bgPreviewOriginal}
                              alt="Foto original"
                              className="w-full h-full object-cover"
                              style={{ objectPosition: 'center top' }}
                            />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                          Fundo branco
                        </p>
                        <div
                          className="aspect-square rounded-md border border-border overflow-hidden flex items-center justify-center"
                          style={{
                            backgroundImage:
                              'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)',
                            backgroundSize: '12px 12px',
                            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                          }}
                        >
                          {bgPreviewProcessed ? (
                            <img
                              src={bgPreviewProcessed}
                              alt="Foto sem fundo"
                              className="w-full h-full object-cover"
                              style={{ objectPosition: 'center top' }}
                            />
                          ) : bgPreviewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Aguardando…</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Escolha o colaborador acima e ajuste a intensidade — a prévia atualiza sozinha. Aprovado? Gere o PDF normalmente; o resultado fica em cache por intensidade.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <Badge className="bg-primary text-primary-foreground">{selectedEmployees.length}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Formato</span>
                <span className="font-medium">{confirmAction === 'png' ? 'PNG' : 'PDF'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Modelo</span>
                <span className="font-medium text-xs">{normalizedActiveTemplate?.name || activeTemplate?.name || 'Padrão'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Dimensões</span>
                <span className="font-medium text-xs">{normalizedActiveTemplate ? `${normalizedActiveTemplate.width_mm}×${normalizedActiveTemplate.height_mm}mm` : '—'}</span>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Colaboradores:</p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedNames.map(name => (
                  <span key={name} className="text-xs text-foreground flex items-center gap-1 bg-muted/50 rounded-md px-2 py-0.5">
                    <CheckCircle className="h-3 w-3 text-success shrink-0" />
                    {name}
                  </span>
                ))}
                {remainingCount > 0 && (
                  <span className="text-xs text-muted-foreground px-2 py-0.5">+ {remainingCount} outro(s)</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Cancelar</Button>
            <Button onClick={executeGeneration} className="gap-2">
              {confirmAction === 'download' ? <FileDown className="h-4 w-4" /> : confirmAction === 'print' ? <Printer className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
              Confirmar e Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {generationResults.errors.length === 0 ? '✅ Concluído!' : '⚠️ Resultado'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {generationResults.success > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
                <p className="text-sm font-medium text-foreground">{generationResults.success} crachá(s) gerado(s) com sucesso</p>
              </div>
            )}
            {generationResults.errors.map((err, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm text-foreground">{err}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Adjustment Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crop className="h-5 w-5 text-primary" />
              Ajustar fotos antes de gerar
            </DialogTitle>
            <DialogDescription>
              Selecione um colaborador, ajuste o zoom e a posição da foto. As mudanças
              serão aplicadas no PDF/PNG final.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const selectedEmps = employees.filter(e => selectedEmployees.includes(e.id));
            const currentEmp = selectedEmps.find(e => e.id === adjustEmployeeId) || selectedEmps[0];
            if (!currentEmp || !normalizedActiveTemplate) {
              return (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Selecione ao menos um colaborador e um modelo.
                </p>
              );
            }
            const adj = photoAdjustments[currentEmp.id] || DEFAULT_PHOTO_ADJUSTMENT;
            const previewData: any = toBadgeData(currentEmp);
            previewData.photo_adjustment = adj;
            const previewScale = Math.min(0.7, 240 / (normalizedActiveTemplate.width_mm * 3.78));
            const photoUrl = getPhotoUrl(currentEmp.photo_url);
            const hasPhoto = photoUrl && photoUrl !== '/placeholder.svg';

            return (
              <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 py-2">
                {/* Employee list */}
                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1 border-r border-border">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Colaboradores ({selectedEmps.length})
                  </p>
                  {selectedEmps.map(emp => {
                    const isActive = emp.id === currentEmp.id;
                    const isAdjusted = photoAdjustments[emp.id] && !isAdjustmentDefault(photoAdjustments[emp.id]);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => setAdjustEmployeeId(emp.id)}
                        className={cn(
                          'w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors flex items-center gap-2',
                          isActive
                            ? 'bg-primary/10 text-foreground ring-1 ring-primary'
                            : 'hover:bg-muted/40 text-foreground'
                        )}
                      >
                        <span className="truncate flex-1">{emp.full_name}</span>
                        {isAdjusted && (
                          <span className="text-[9px] uppercase tracking-wide bg-primary/20 text-primary rounded px-1.5 py-0.5 shrink-0">
                            ajustado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Editor */}
                <div className="space-y-4">
                  {!hasPhoto && (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Este colaborador não possui foto cadastrada. O ajuste só
                      tem efeito quando há foto.
                    </div>
                  )}

                  <div className="flex justify-center rounded-xl border border-border bg-muted/30 p-3">
                    <BadgeRenderer
                      data={previewData}
                      template={normalizedActiveTemplate}
                      scale={previewScale}
                      side="front"
                      renderMode="export"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-medium text-foreground flex items-center gap-1.5">
                          <ZoomIn className="h-3.5 w-3.5" />
                          Zoom
                        </label>
                        <span className="text-muted-foreground tabular-nums">
                          {adj.zoom.toFixed(2)}×
                        </span>
                      </div>
                      <Slider
                        min={1}
                        max={3}
                        step={0.05}
                        value={[adj.zoom]}
                        onValueChange={([v]) => updatePhotoAdjustment(currentEmp.id, { zoom: v })}
                        disabled={!hasPhoto}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-medium text-foreground">Posição horizontal</label>
                        <span className="text-muted-foreground tabular-nums">{adj.offsetX.toFixed(0)}%</span>
                      </div>
                      <Slider
                        min={-50}
                        max={50}
                        step={1}
                        value={[adj.offsetX]}
                        onValueChange={([v]) => updatePhotoAdjustment(currentEmp.id, { offsetX: v })}
                        disabled={!hasPhoto}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-medium text-foreground">Posição vertical</label>
                        <span className="text-muted-foreground tabular-nums">{adj.offsetY.toFixed(0)}%</span>
                      </div>
                      <Slider
                        min={-50}
                        max={50}
                        step={1}
                        value={[adj.offsetY]}
                        onValueChange={([v]) => updatePhotoAdjustment(currentEmp.id, { offsetY: v })}
                        disabled={!hasPhoto}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => resetPhotoAdjustment(currentEmp.id)}
                      disabled={isAdjustmentDefault(photoAdjustments[currentEmp.id])}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Redefinir
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      As alterações são aplicadas automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              Fechar
            </Button>
            <Button onClick={() => setShowAdjustDialog(false)} className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Concluir ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>

  );
};

export default GerarCrachas;
