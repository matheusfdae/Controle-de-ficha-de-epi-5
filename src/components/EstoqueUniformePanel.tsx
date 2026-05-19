import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Shirt, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Uniforme, listUniformes, upsertUniforme, deleteUniforme,
  ajustarEstoqueUniforme, resetarEstoqueUniforme,
} from '@/services/uniformesService';
import { supabase } from '@/integrations/supabase/client';

export default function EstoqueUniformePanel() {
  const [items, setItems] = useState<Uniforme[]>([]);
  const [search, setSearch] = useState('');
  const [openNovo, setOpenNovo] = useState(false);
  const [editing, setEditing] = useState<Uniforme | null>(null);

  const [form, setForm] = useState<Partial<Uniforme>>({
    nome: '', codigo: '', categoria: 'camisa', genero: 'unissex',
    tamanhos_disponiveis: [], estoque_atual: 0, estoque_minimo: 5,
  });

  const load = async () => {
    try { setItems(await listUniformes()); } catch (e: any) { toast.error(e.message); }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('uniformes-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'uniformes' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = items.filter(i =>
    i.nome.toLowerCase().includes(search.toLowerCase()) ||
    (i.codigo || '').toLowerCase().includes(search.toLowerCase())
  );

  const status = (i: Uniforme) =>
    i.estoque_atual === 0 ? { label: 'Sem estoque', tone: 'destructive' as const }
    : i.estoque_atual <= i.estoque_minimo ? { label: 'Crítico', tone: 'destructive' as const }
    : { label: 'OK', tone: 'default' as const };

  const handleSave = async () => {
    if (!form.nome?.trim()) return toast.error('Informe o nome');
    try {
      await upsertUniforme(form);
      setOpenNovo(false); setEditing(null);
      setForm({ nome: '', codigo: '', categoria: 'camisa', genero: 'unissex', tamanhos_disponiveis: [], estoque_atual: 0, estoque_minimo: 5 });
      load();
      toast.success('Uniforme salvo');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReset = async (id: string) => {
    if (!confirm('Zerar o estoque deste uniforme? Será registrada uma saída.')) return;
    try { await resetarEstoqueUniforme(id); toast.success('Estoque resetado'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleAdjust = async (i: Uniforme, novo: number) => {
    try { await ajustarEstoqueUniforme(i.id, novo, 'Ajuste manual'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (u: Uniforme) => { setEditing(u); setForm(u); setOpenNovo(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input placeholder="Buscar uniforme..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Dialog open={openNovo} onOpenChange={(o) => { setOpenNovo(o); if (!o) { setEditing(null); setForm({ nome: '', codigo: '', categoria: 'camisa', genero: 'unissex', tamanhos_disponiveis: [], estoque_atual: 0, estoque_minimo: 5 }); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Cadastrar Uniforme</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Uniforme' : 'Novo Uniforme'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.nome || ''} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código</Label><Input value={form.codigo || ''} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
                <div><Label>Categoria</Label><Input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="camisa, calça..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gênero</Label>
                  <Select value={form.genero || 'unissex'} onValueChange={(v: any) => setForm({ ...form, genero: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unissex">Unissex</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tamanhos (separe por vírgula)</Label>
                  <Input
                    value={(form.tamanhos_disponiveis || []).join(', ')}
                    onChange={e => setForm({ ...form, tamanhos_disponiveis: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="P, M, G, GG"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Estoque atual</Label><Input type="number" min={0} value={form.estoque_atual ?? 0} onChange={e => setForm({ ...form, estoque_atual: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Estoque mínimo</Label><Input type="number" min={0} value={form.estoque_minimo ?? 5} onChange={e => setForm({ ...form, estoque_minimo: parseInt(e.target.value) || 0 })} /></div>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              {editing && (
                <Button variant="destructive" onClick={async () => {
                  if (!confirm('Excluir este uniforme?')) return;
                  await deleteUniforme(editing.id); setOpenNovo(false); setEditing(null); load();
                }}>Excluir</Button>
              )}
              <Button onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(u => {
          const st = status(u);
          return (
            <Card key={u.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="cursor-pointer" onClick={() => openEdit(u)}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{u.codigo || '—'}</p>
                    <h3 className="font-bold text-lg leading-tight">{u.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{u.categoria} · {u.genero}</p>
                    {u.tamanhos_disponiveis?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">Tamanhos: {u.tamanhos_disponiveis.join(', ')}</p>
                    )}
                  </div>
                  <Badge variant={st.tone === 'destructive' ? 'destructive' : 'secondary'}>{st.label}</Badge>
                </div>
                <div className="flex justify-between items-end gap-3">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Estoque</Label>
                      <Input type="number" min={0} value={u.estoque_atual}
                        onChange={e => handleAdjust(u, parseInt(e.target.value) || 0)}
                        className="w-24" />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleReset(u.id)} title="Resetar">
                      <RotateCcw className="h-3 w-3 mr-1" /> Reset
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive"
                    onClick={async () => { if (confirm('Excluir?')) { await deleteUniforme(u.id); load(); } }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12 col-span-full">
            <Shirt className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum uniforme cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}
