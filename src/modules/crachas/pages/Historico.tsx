import { useState } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, FileDown, CheckCircle, XCircle, Clock, Filter, Calendar, Loader2, Package, MoreVertical, ShieldCheck, Trash2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/crachas/hooks/useAuth';

const statusConfig = {
  pending: { label: 'Pendente', icon: Clock, className: 'bg-warning/10 text-warning border-warning/20' },
  processing: { label: 'Processando', icon: Loader2, className: 'bg-primary/10 text-primary border-primary/20' },
  completed: { label: 'Concluído', icon: CheckCircle, className: 'bg-success/10 text-success border-success/20' },
  failed: { label: 'Falhou', icon: XCircle, className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const Historico = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [isExporting, setIsExporting] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined, to: undefined,
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmingBatchId, setConfirmingBatchId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [detailBatch, setDetailBatch] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['generation-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_generation_batches')
        .select(`
          *,
          badge_templates ( name ),
          sheet_connections ( sheet_name )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch user profile for confirmation name
  const { data: profile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('nome_completo, email')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const filteredBatches = batches.filter(batch => {
    const searchMatch = !search ||
      (batch.badge_templates as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (batch.sheet_connections as any)?.sheet_name?.toLowerCase().includes(search.toLowerCase());
    
    const statusMatch = statusFilter === 'todos' || batch.status === statusFilter;
    
    const batchDate = new Date(batch.created_at);
    const dateMatch = (!dateRange.from || batchDate >= dateRange.from) &&
                      (!dateRange.to || batchDate <= dateRange.to);
    
    return searchMatch && statusMatch && dateMatch;
  });

  const handleConfirmBatch = async () => {
    if (!confirmingBatchId || !user) return;
    setIsProcessing(true);
    try {
      const userName = profile?.nome_completo || profile?.email || user.email || 'Usuário';
      const { error } = await supabase
        .from('cracha_generation_batches')
        .update({
          confirmed_by: user.id,
          confirmed_at: new Date().toISOString(),
          confirmed_by_name: userName,
        } as any)
        .eq('id', confirmingBatchId);
      
      if (error) throw error;
      toast.success('Emissão confirmada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['generation-batches'] });
    } catch (error: any) {
      toast.error('Erro ao confirmar: ' + error.message);
    } finally {
      setIsProcessing(false);
      setConfirmingBatchId(null);
    }
  };

  const handleDeleteBatch = async () => {
    if (!deletingBatchId) return;
    setIsProcessing(true);
    try {
      // Delete batch items first
      const { error: itemsError } = await supabase
        .from('cracha_batch_items')
        .delete()
        .eq('batch_id', deletingBatchId);
      
      if (itemsError) throw itemsError;

      const { error } = await supabase
        .from('cracha_generation_batches')
        .delete()
        .eq('id', deletingBatchId);
      
      if (error) throw error;
      toast.success('Registro excluído com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['generation-batches'] });
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setIsProcessing(false);
      setDeletingBatchId(null);
    }
  };

  const handleExportReport = async () => {
    setIsExporting(true);
    try {
      const headers = ['Data', 'Modelo', 'Status', 'Total', 'Processados', 'Falhas', 'Formato', 'Confirmado Por', 'Confirmado Em'];
      const rows = filteredBatches.map(batch => [
        new Date(batch.created_at).toLocaleDateString('pt-BR'),
        (batch.badge_templates as any)?.name || 'N/A',
        statusConfig[batch.status as keyof typeof statusConfig]?.label || batch.status,
        batch.total_badges,
        batch.processed_badges,
        batch.failed_badges,
        batch.export_format,
        (batch as any).confirmed_by_name || '',
        (batch as any).confirmed_at ? new Date((batch as any).confirmed_at).toLocaleDateString('pt-BR') : '',
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `historico_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      toast.success('Relatório exportado com sucesso!');
    } catch {
      toast.error('Erro ao exportar relatório');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
          <p className="text-muted-foreground mt-1">
            Registro de todas as gerações de crachás em lote
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExportReport} disabled={isExporting}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Exportar Relatório
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-card rounded-xl border border-border shadow-card">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros:</span>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por modelo ou conexão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Calendar className="h-4 w-4" />
              {dateRange.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, 'dd/MM', { locale: ptBR })} - {format(dateRange.to, 'dd/MM', { locale: ptBR })}</>
                ) : format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })
              ) : 'Período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Inicial</Label>
                  <CalendarComponent mode="single" selected={dateRange.from} onSelect={(date) => setDateRange({ ...dateRange, from: date })} locale={ptBR} />
                </div>
                <div className="space-y-2">
                  <Label>Data Final</Label>
                  <CalendarComponent mode="single" selected={dateRange.to} onSelect={(date) => setDateRange({ ...dateRange, to: date })} locale={ptBR} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDateRange({ from: undefined, to: undefined }); setShowDatePicker(false); }} className="flex-1">Limpar</Button>
                <Button size="sm" onClick={() => setShowDatePicker(false)} className="flex-1">Aplicar</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {(search || statusFilter !== 'todos' || dateRange.from || dateRange.to) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('todos'); setDateRange({ from: undefined, to: undefined }); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* History Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-card animate-fade-in">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Processados</TableHead>
                <TableHead className="text-center">Falhas</TableHead>
                <TableHead>Confirmação</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Nenhum registro de geração encontrado</p>
                    <p className="text-sm text-muted-foreground mt-1">Gere crachás em lote para ver o histórico aqui</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredBatches.map((batch) => {
                  const config = statusConfig[batch.status as keyof typeof statusConfig] || statusConfig.pending;
                  const Icon = config.icon;
                  const isConfirmed = !!(batch as any).confirmed_at;
                  return (
                    <TableRow key={batch.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        {new Date(batch.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {(batch.badge_templates as any)?.name || 'Modelo removido'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(batch.sheet_connections as any)?.sheet_name || ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('gap-1', config.className)}>
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{batch.total_badges}</TableCell>
                      <TableCell className="text-center text-success">{batch.processed_badges}</TableCell>
                      <TableCell className="text-center text-destructive">{batch.failed_badges}</TableCell>
                      <TableCell>
                        {isConfirmed ? (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Confirmado
                            </Badge>
                            <p className="text-[10px] text-muted-foreground">
                              {(batch as any).confirmed_by_name} • {new Date((batch as any).confirmed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        ) : batch.status === 'completed' ? (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                            <Clock className="h-3 w-3" />
                            Aguardando
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailBatch(batch)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            {batch.status === 'completed' && !isConfirmed && (
                              <DropdownMenuItem onClick={() => setConfirmingBatchId(batch.id)}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Confirmar Emissão
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingBatchId(batch.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir Registro
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        Mostrando {filteredBatches.length} de {batches.length} registros
      </p>

      {/* Confirm Emission Dialog */}
      <Dialog open={!!confirmingBatchId} onOpenChange={() => setConfirmingBatchId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              Confirmar Emissão
            </DialogTitle>
            <DialogDescription>
              Ao confirmar, você atesta que os crachás deste lote foram revisados e entregues corretamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 rounded-xl bg-muted/50 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Confirmado por</span>
                <span className="font-medium text-foreground">{profile?.nome_completo || user?.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data/Hora</span>
                <span className="font-medium text-foreground">{new Date().toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta ação registra a validação do lote e não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingBatchId(null)} disabled={isProcessing}>Cancelar</Button>
            <Button onClick={handleConfirmBatch} disabled={isProcessing} className="gap-2">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBatchId} onOpenChange={() => setDeletingBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de crachá</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro? Todos os itens do lote serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBatch}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailBatch} onOpenChange={() => setDetailBatch(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Lote</DialogTitle>
          </DialogHeader>
          {detailBatch && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Modelo', (detailBatch.badge_templates as any)?.name || 'N/A'],
                  ['Formato', detailBatch.export_format?.toUpperCase()],
                  ['Total', detailBatch.total_badges],
                  ['Processados', detailBatch.processed_badges],
                  ['Falhas', detailBatch.failed_badges],
                  ['Status', statusConfig[detailBatch.status as keyof typeof statusConfig]?.label || detailBatch.status],
                  ['Criado em', new Date(detailBatch.created_at).toLocaleString('pt-BR')],
                  ['Concluído em', detailBatch.completed_at ? new Date(detailBatch.completed_at).toLocaleString('pt-BR') : '—'],
                ].map(([label, value]) => (
                  <div key={label as string} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              {(detailBatch as any).confirmed_at && (
                <div className="p-3 rounded-xl bg-success/10 border border-success/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-success text-sm font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Emissão Confirmada
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por {(detailBatch as any).confirmed_by_name} em {new Date((detailBatch as any).confirmed_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Historico;
