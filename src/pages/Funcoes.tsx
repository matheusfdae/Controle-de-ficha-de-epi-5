import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Briefcase, Save, Copy, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useConfirm } from '@/hooks/use-confirm';
import EstadoSelect, { useEstadoLembrado } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import {
  Funcao, EPI, FuncaoEPI,
  listFuncoes, upsertFuncao, deleteFuncao, listEpis, copiarFuncoesEstado, renomearFuncao,
  listFuncaoEpis, addFuncaoEpi, removeFuncaoEpi,
} from '@/services/estoqueService';

export default function Funcoes() {
  // Cada estado tem as suas funções: a tela mostra e edita só as do estado escolhido.
  const { estados } = useAuth();
  const [uf, setUf] = useEstadoLembrado('funcoes');
  const [copiarDe, setCopiarDe] = useState('');
  const [copiando, setCopiando] = useState(false);
  const [openCopiar, setOpenCopiar] = useState(false);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [openNova, setOpenNova] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [editing, setEditing] = useState<Funcao | null>(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [renomeando, setRenomeando] = useState(false);
  const [vinculos, setVinculos] = useState<FuncaoEPI[]>([]);
  const [addEpiId, setAddEpiId] = useState('');
  const [addQtd, setAddQtd] = useState(1);
  const [addTam, setAddTam] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  const load = async () => {
    if (!uf) { setFuncoes([]); return; }
    try {
      const [f, e] = await Promise.all([listFuncoes(uf), listEpis()]);
      setFuncoes(f); setEpis(e);
    } catch (err: any) { toast.error(err.message); }
  };
  useEffect(() => { load(); }, [uf]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopiar = async () => {
    if (!copiarDe || !uf) return;
    setCopiando(true);
    try {
      const n = await copiarFuncoesEstado(copiarDe, uf);
      toast.success(n
        ? `${n} função(ões) copiada(s) de ${copiarDe} para ${uf}, com os EPIs padrão.`
        : `Nada a copiar: ${uf} já tem todas as funções de ${copiarDe}.`);
      setOpenCopiar(false); setCopiarDe(''); load();
    } catch (err: any) { toast.error(err.message); }
    finally { setCopiando(false); }
  };

  const loadVinc = async (id: string) => setVinculos(await listFuncaoEpis(id));

  const handleCreate = async () => {
    if (!novoNome.trim() || !uf) return;
    try {
      await upsertFuncao({ nome: novoNome.trim(), uf });
      setOpenNova(false); setNovoNome(''); load();
      toast.success(`Função criada em ${uf}`);
    } catch (err: any) {
      toast.error(/duplicate|unique/i.test(err.message) ? `Já existe uma função com esse nome em ${uf}` : err.message);
    }
  };

  const abrir = (f: Funcao) => { setEditing(f); setNomeEdit(f.nome); loadVinc(f.id); };

  const handleRenomear = async () => {
    const nome = nomeEdit.trim();
    if (!editing || !nome || nome === editing.nome) return;
    setRenomeando(true);
    try {
      await renomearFuncao(editing.id, nome);
      setEditing({ ...editing, nome });
      load();
      toast.success(`Função renomeada para "${nome}" em ${editing.uf}`);
    } catch (err: any) {
      toast.error(/duplicate|unique/i.test(err.message) ? `Já existe uma função com esse nome em ${editing.uf}` : err.message);
    } finally { setRenomeando(false); }
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
        <PageHeader
          eyebrow="Cargos & EPIs padrão"
          title="Funções"
          actions={
            <div className="flex flex-wrap items-center gap-2">
            <EstadoSelect value={uf} onChange={setUf} className="w-28" />
            {estados.length > 1 && (
              <Dialog open={openCopiar} onOpenChange={o => { setOpenCopiar(o); if (!o) setCopiarDe(''); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!uf}><Copy className="h-4 w-4 mr-1" /> Copiar de outro estado</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Copiar funções para {uf}</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Cria em <b>{uf}</b> uma cópia das funções do estado escolhido, com os EPIs padrão. As cópias são
                    independentes: editar em {uf} não muda o outro estado. Funções que já existem em {uf} (mesmo nome) ficam como estão.
                  </p>
                  <div>
                    <Label htmlFor="copiar-de">Copiar de</Label>
                    <EstadoSelect id="copiar-de" value={copiarDe} onChange={setCopiarDe} excluir={[uf]} placeholder="Estado de origem" />
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCopiar} disabled={!copiarDe || copiando}>
                      {copiando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />} Copiar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={openNova} onOpenChange={setOpenNova}>
              <DialogTrigger asChild>
                <Button disabled={!uf}><Plus className="h-4 w-4 mr-1" /> Nova função</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova Função em {uf}</DialogTitle></DialogHeader>
                <div><Label htmlFor="funcao-nome">Nome *</Label><Input id="funcao-nome" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex.: Operador, ASG..." /></div>
                <DialogFooter><Button onClick={handleCreate}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          {funcoes.map(f => (
            <Card key={f.id} className="hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => abrir(f)}>
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{f.nome}</h3>
                  {f.descricao && <p className="text-xs text-muted-foreground">{f.descricao}</p>}
                </div>
                <Pencil className="h-4 w-4 text-muted-foreground" aria-label="Editar" />
              </CardContent>
            </Card>
          ))}
          {funcoes.length === 0 && (
            <p className="text-center text-muted-foreground py-12 col-span-full">
              {uf ? `Nenhuma função cadastrada em ${uf}.${estados.length > 1 ? ' Use "Copiar de outro estado" para começar.' : ''}` : 'Escolha o estado.'}
            </p>
          )}
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing?.nome} ({editing?.uf}) — EPIs vinculados</DialogTitle></DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="funcao-renomear" className="text-xs">Nome da função</Label>
              <div className="flex gap-2">
                <Input id="funcao-renomear" value={nomeEdit} onChange={e => setNomeEdit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenomear(); }} />
                <Button variant="outline" onClick={handleRenomear}
                  disabled={renomeando || !nomeEdit.trim() || nomeEdit.trim() === editing?.nome}>
                  {renomeando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Salvar nome
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Muda só em {editing?.uf}; as fichas já feitas continuam com o nome antigo. Mantenha igual ao cargo da Senior
                para a ficha nova escolher os EPIs padrão sozinha.
              </p>
            </div>
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
              <Label htmlFor="funcao-add-epi" className="text-xs">Adicionar EPI</Label>
              <Select value={addEpiId} onValueChange={setAddEpiId}>
                <SelectTrigger id="funcao-add-epi"><SelectValue placeholder="Selecione um EPI" /></SelectTrigger>
                <SelectContent>
                  {epis.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <div className="flex-1"><Label htmlFor="funcao-add-tam" className="text-xs">Tamanho</Label>
                  <Input id="funcao-add-tam" value={addTam} onChange={e => setAddTam(e.target.value)} placeholder="opcional" />
                </div>
                <div><Label htmlFor="funcao-add-qtd" className="text-xs">Qtd</Label>
                  <Input id="funcao-add-qtd" type="number" min={1} value={addQtd} onChange={e => setAddQtd(parseInt(e.target.value) || 1)} className="w-24" />
                </div>
                <Button className="self-end" onClick={handleAddVinc}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <Button variant="destructive" onClick={async () => {
                if (!editing || !(await confirm('Excluir esta função?'))) return;
                await deleteFuncao(editing.id); setEditing(null); load();
              }}>Excluir</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmDialog />
    </div>
  );
}
