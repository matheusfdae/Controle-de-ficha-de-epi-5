import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Package, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  EPI, EPITamanho, listEpis, upsertEpi, deleteEpi,
  listTamanhos, upsertTamanho, deleteTamanho,
} from '@/services/estoqueService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

export default function Estoque() {
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

  const load = async () => {
    try { setEpis(await listEpis()); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => { load(); }, []);

  const loadTamanhos = async (epiId: string) => {
    setTamanhos(await listTamanhos(epiId));
  };

  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    (e.codigo || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalEstoque = (e: EPI) => e.estoque_atual;
  const status = (e: EPI) =>
    e.estoque_atual === 0 ? { label: 'Sem estoque', tone: 'destructive' as const }
    : e.estoque_atual <= e.estoque_minimo ? { label: 'Crítico', tone: 'destructive' as const }
    : { label: 'OK', tone: 'default' as const };

  const handleCreate = async () => {
    if (!novoNome.trim()) return toast.error('Informe o nome');
    try {
      await upsertEpi({ nome: novoNome, codigo: novoCodigo || null, ca_numero: novoCa || null, categoria: 'protecao_cabeca' as any });
      setOpenNovo(false); setNovoNome(''); setNovoCodigo(''); setNovoCa('');
      load();
      toast.success('EPI cadastrado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleAddTamanho = async () => {
    if (!editing || !novoTam.trim()) return;
    try {
      await upsertTamanho({ epi_id: editing.id, tamanho: novoTam.trim(), estoque: novoQtd });
      setNovoTam(''); setNovoQtd(0);
      await loadTamanhos(editing.id);
      load();
      toast.success('Tamanho atualizado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateTam = async (t: EPITamanho, estoque: number) => {
    try {
      await upsertTamanho({ ...t, estoque });
      await loadTamanhos(t.epi_id);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Catálogo de EPIs</p>
            <h1 className="text-3xl font-bold tracking-tight">Estoque</h1>
          </div>
          <Dialog open={openNovo} onOpenChange={setOpenNovo}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Cadastrar EPI</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo EPI</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label><Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex.: Capacete de Segurança" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Código</Label><Input value={novoCodigo} onChange={e => setNovoCodigo(e.target.value)} placeholder="EPI-001" /></div>
                  <div><Label>Nº CA</Label><Input value={novoCa} onChange={e => setNovoCa(e.target.value)} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={handleCreate}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Input placeholder="Buscar EPI..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(epi => {
            const st = status(epi);
            return (
              <Card key={epi.id} className="hover:border-primary/50 cursor-pointer transition-colors"
                    onClick={() => { setEditing(epi); loadTamanhos(epi.id); }}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{epi.codigo || '—'}</p>
                      <h3 className="font-bold text-lg leading-tight">{epi.nome}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">CA {epi.ca_numero || '—'}</p>
                    </div>
                    <Badge variant={st.tone === 'destructive' ? 'destructive' : 'secondary'}>{st.label}</Badge>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estoque total</p>
                    </div>
                    <p className="text-3xl font-bold">{totalEstoque(epi)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-12 col-span-full">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum EPI cadastrado.
            </p>
          )}
        </div>

        {/* Editor de tamanhos */}
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing?.nome} — Estoque por tamanho</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {tamanhos.map(t => (
                <div key={t.id} className="flex gap-2 items-center p-2 rounded border">
                  <Badge variant="outline" className="font-mono">{t.tamanho}</Badge>
                  <Input
                    type="number" min={0} value={t.estoque}
                    onChange={e => handleUpdateTam(t, parseInt(e.target.value) || 0)}
                    className="w-28"
                  />
                  <span className="text-xs text-muted-foreground">unidades</span>
                  <Button size="icon" variant="ghost" className="ml-auto text-destructive"
                          onClick={async () => { await deleteTamanho(t.id); loadTamanhos(editing!.id); load(); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 items-end pt-2 border-t">
                <div className="flex-1"><Label className="text-xs">Tamanho</Label>
                  <Input value={novoTam} onChange={e => setNovoTam(e.target.value)} placeholder="P, M, G, 40..." />
                </div>
                <div><Label className="text-xs">Quantidade</Label>
                  <Input type="number" min={0} value={novoQtd} onChange={e => setNovoQtd(parseInt(e.target.value) || 0)} className="w-28" />
                </div>
                <Button onClick={handleAddTamanho}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <Button variant="destructive" onClick={async () => {
                if (!editing) return;
                if (!confirm('Excluir este EPI?')) return;
                await deleteEpi(editing.id); setEditing(null); load();
              }}>Excluir EPI</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
