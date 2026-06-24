import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Briefcase, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BackButton from '@/components/BackButton';
import {
  Funcao, EPI, FuncaoEPI,
  listFuncoes, upsertFuncao, deleteFuncao, listEpis,
  listFuncaoEpis, addFuncaoEpi, removeFuncaoEpi,
} from '@/services/estoqueService';

export default function Funcoes() {
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [openNova, setOpenNova] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [editing, setEditing] = useState<Funcao | null>(null);
  const [vinculos, setVinculos] = useState<FuncaoEPI[]>([]);
  const [addEpiId, setAddEpiId] = useState('');
  const [addQtd, setAddQtd] = useState(1);
  const [addTam, setAddTam] = useState('');

  const load = async () => {
    try {
      const [f, e] = await Promise.all([listFuncoes(), listEpis()]);
      setFuncoes(f); setEpis(e);
    } catch (err: any) { toast.error(err.message); }
  };
  useEffect(() => { load(); }, []);

  const loadVinc = async (id: string) => setVinculos(await listFuncaoEpis(id));

  const handleCreate = async () => {
    if (!novoNome.trim()) return;
    await upsertFuncao({ nome: novoNome });
    setOpenNova(false); setNovoNome(''); load();
    toast.success('Função criada');
  };

  const handleAddVinc = async () => {
    if (!editing || !addEpiId) return;
    await addFuncaoEpi({ funcao_id: editing.id, epi_id: addEpiId, quantidade: addQtd, tamanho: addTam || null });
    setAddEpiId(''); setAddQtd(1); setAddTam('');
    loadVinc(editing.id);
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Cargos & EPIs padrão</p>
            <h1 className="text-3xl font-bold tracking-tight">Funções</h1>
          </div>
          <Dialog open={openNova} onOpenChange={setOpenNova}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Nova função</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova Função</DialogTitle></DialogHeader>
              <div><Label>Nome *</Label><Input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex.: Operador, ASG..." /></div>
              <DialogFooter><Button onClick={handleCreate}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {funcoes.map(f => (
            <Card key={f.id} className="hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => { setEditing(f); loadVinc(f.id); }}>
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{f.nome}</h3>
                  {f.descricao && <p className="text-xs text-muted-foreground">{f.descricao}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
          {funcoes.length === 0 && (
            <p className="text-center text-muted-foreground py-12 col-span-full">Nenhuma função cadastrada.</p>
          )}
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing?.nome} — EPIs vinculados</DialogTitle></DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {vinculos.map(v => {
                const epi = epis.find(e => e.id === v.epi_id);
                return (
                  <div key={v.id} className="flex items-center gap-2 p-2 rounded border">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{epi?.nome || '?'}</p>
                      <p className="text-xs text-muted-foreground">Qtd: {v.quantidade} {v.tamanho && `• Tam: ${v.tamanho}`}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive"
                            onClick={async () => { await removeFuncaoEpi(v.id); loadVinc(editing!.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {vinculos.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhum EPI vinculado.</p>}
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Adicionar EPI</Label>
              <Select value={addEpiId} onValueChange={setAddEpiId}>
                <SelectTrigger><SelectValue placeholder="Selecione um EPI" /></SelectTrigger>
                <SelectContent>
                  {epis.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <div className="flex-1"><Label className="text-xs">Tamanho</Label>
                  <Input value={addTam} onChange={e => setAddTam(e.target.value)} placeholder="opcional" />
                </div>
                <div><Label className="text-xs">Qtd</Label>
                  <Input type="number" min={1} value={addQtd} onChange={e => setAddQtd(parseInt(e.target.value) || 1)} className="w-24" />
                </div>
                <Button className="self-end" onClick={handleAddVinc}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <Button variant="destructive" onClick={async () => {
                if (!editing || !confirm('Excluir esta função?')) return;
                await deleteFuncao(editing.id); setEditing(null); load();
              }}>Excluir</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
