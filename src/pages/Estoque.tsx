import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Package, Shirt, Save, RotateCcw, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  EPI, EPITamanho, ItemTipo, listEpis, upsertEpi, deleteEpi,
  listTamanhos, upsertTamanho, deleteTamanho,
  resetarEstoqueEpi, ajustarEstoqueTamanho,
} from '@/services/estoqueService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import EstoqueChart from '@/components/EstoqueChart';
import FornecedoresPanel from '@/components/FornecedoresPanel';
import RelatorioMovimentacoes from '@/components/RelatorioMovimentacoes';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstoqueInput from '@/components/EstoqueInput';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/hooks/use-confirm';

// EPIs e uniformes são a mesma tabela (epis.tipo), a mesma que as fichas usam.
const ROTULO: Record<ItemTipo, { item: string; Icone: typeof Package }> = {
  epi: { item: 'EPI', Icone: Package },
  uniforme: { item: 'Uniforme', Icone: Shirt },
};

function ItemPanel({ tipo }: { tipo: ItemTipo }) {
  const r = ROTULO[tipo];
  const [epis, setEpis] = useState<EPI[]>([]);
  const [search, setSearch] = useState('');
  const [openNovo, setOpenNovo] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoCa, setNovoCa] = useState('');
  const [editing, setEditing] = useState<EPI | null>(null);
  const [tamanhos, setTamanhos] = useState<EPITamanho[]>([]);
  const [novoTam, setNovoTam] = useState('');
  const [novoQtd, setNovoQtd] = useState<number>(0);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = async () => {
    try { setEpis(await listEpis(tipo)); } catch (e: any) { toast.error(e.message); }
  };

  useEffect(() => {
    load();
    const channel = supabase.channel(`estoque-changes-${tipo}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'epis' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'epi_tamanhos' }, (payload: any) => {
        load();
        const epiId = (payload.new?.epi_id) || (payload.old?.epi_id);
        if (editing && epiId === editing.id) loadTamanhos(editing.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const loadTamanhos = async (epiId: string) => setTamanhos(await listTamanhos(epiId));

  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    (e.codigo || '').toLowerCase().includes(search.toLowerCase())
  );

  const status = (e: EPI) =>
    e.estoque_atual === 0 ? { label: 'Sem estoque', tone: 'destructive' as const }
    : e.estoque_atual <= e.estoque_minimo ? { label: 'Crítico', tone: 'destructive' as const }
    : { label: 'OK', tone: 'default' as const };

  const handleCreate = async () => {
    if (!novoNome.trim()) return toast.error('Informe o nome');
    try {
      await upsertEpi({ nome: novoNome, codigo: novoCodigo || null, ca_numero: novoCa || null, categoria: 'protecao_cabeca', tipo });
      setOpenNovo(false); setNovoNome(''); setNovoCodigo(''); setNovoCa('');
      load();
      toast.success(`${r.item} cadastrado`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddTamanho = async () => {
    if (!editing || !novoTam.trim()) return;
    try {
      await upsertTamanho({ epi_id: editing.id, tamanho: novoTam.trim(), estoque: novoQtd });
      setNovoTam(''); setNovoQtd(0);
      await loadTamanhos(editing.id); load();
      toast.success('Tamanho atualizado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateTam = async (t: EPITamanho, estoque: number) => {
    try { await ajustarEstoqueTamanho(t, estoque, tipo); await loadTamanhos(t.epi_id); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleReset = async (epiId: string) => {
    if (!(await confirm(`Zerar o estoque deste ${r.item} (todos os tamanhos)? Será registrada uma saída.`))) return;
    try {
      await resetarEstoqueEpi(epiId, tipo);
      toast.success('Estoque resetado'); load();
      if (editing?.id === epiId) loadTamanhos(epiId);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input placeholder={`Buscar ${r.item.toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Dialog open={openNovo} onOpenChange={setOpenNovo}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Cadastrar {r.item}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo {r.item}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label htmlFor="epi-nome">Nome *</Label><Input id="epi-nome" value={novoNome} onChange={e => setNovoNome(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="epi-codigo">Código</Label><Input id="epi-codigo" value={novoCodigo} onChange={e => setNovoCodigo(e.target.value)} /></div>
                <div><Label htmlFor="epi-ca">Nº CA</Label><Input id="epi-ca" value={novoCa} onChange={e => setNovoCa(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={handleCreate}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{r.item}</TableHead>
                <TableHead className="hidden sm:table-cell">Código</TableHead>
                <TableHead className="hidden sm:table-cell">CA</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(epi => {
                const st = status(epi);
                return (
                  <TableRow key={epi.id} className="cursor-pointer"
                    onClick={() => { setEditing(epi); loadTamanhos(epi.id); }}>
                    <TableCell className="font-medium">{epi.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{epi.codigo || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{epi.ca_numero || '—'}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{epi.estoque_atual}</TableCell>
                    <TableCell>
                      <Badge variant={st.tone === 'destructive' ? 'destructive' : 'secondary'}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm"
                        onClick={(ev) => { ev.stopPropagation(); handleReset(epi.id); }}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    <r.Icone className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum {r.item} cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.nome} — Estoque por tamanho</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {tamanhos.map(t => (
              <div key={t.id} className="flex gap-2 items-center p-2 rounded border">
                <Badge variant="outline" className="font-mono">{t.tamanho}</Badge>
                <EstoqueInput value={t.estoque} onCommit={n => handleUpdateTam(t, n)} />
                <span className="text-xs text-muted-foreground">unidades</span>
                <Button size="icon" variant="ghost" className="ml-auto text-destructive"
                  onClick={async () => { await deleteTamanho(t.id); loadTamanhos(editing!.id); load(); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 items-end pt-2 border-t">
              <div className="flex-1"><Label htmlFor="tam-novo" className="text-xs">Tamanho</Label>
                <Input id="tam-novo" value={novoTam} onChange={e => setNovoTam(e.target.value)} placeholder="P, M, G..." /></div>
              <div><Label htmlFor="tam-qtd" className="text-xs">Quantidade</Label>
                <Input id="tam-qtd" type="number" min={0} value={novoQtd} onChange={e => setNovoQtd(parseInt(e.target.value) || 0)} className="w-28" /></div>
              <Button onClick={handleAddTamanho}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" onClick={async () => {
              if (!editing) return;
              if (!(await confirm(`Excluir este ${r.item}?`))) return;
              await deleteEpi(editing.id); setEditing(null); load();
            }}>Excluir {r.item}</Button>
            <Button variant="outline" onClick={() => editing && handleReset(editing.id)}>
              <RotateCcw className="h-4 w-4 mr-1" /> Resetar estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}

export default function Estoque() {
  const { can } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader eyebrow="Gestão" title="Estoque"
          actions={can('estoque', 'create') && (
            <Button onClick={() => navigate('/estoque/entrada')}>
              <PackagePlus className="h-4 w-4 mr-1" /> Registrar entrada
            </Button>
          )} />

        <EstoqueChart />

        <Tabs defaultValue="epis" className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="epis">EPIs</TabsTrigger>
            <TabsTrigger value="uniformes">Uniformes</TabsTrigger>
            <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
            <TabsTrigger value="relatorio">Relatório</TabsTrigger>
          </TabsList>
          <TabsContent value="epis" className="mt-6"><ItemPanel tipo="epi" /></TabsContent>
          <TabsContent value="uniformes" className="mt-6"><ItemPanel tipo="uniforme" /></TabsContent>
          <TabsContent value="fornecedores" className="mt-6"><FornecedoresPanel /></TabsContent>
          <TabsContent value="relatorio" className="mt-6"><RelatorioMovimentacoes /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
