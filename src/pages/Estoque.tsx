import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Package, Shirt, Save, RotateCcw, PackagePlus, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  EPI, EPITamanho, ItemTipo, TAMANHO_UNICO, listEpis, upsertEpi, deleteEpi,
  listTamanhos, totaisPorItem, deleteTamanho, ajustarEstoque, resetarEstoqueEpi, transferirEstoque,
} from '@/services/estoqueService';
import { listEstados } from '@/services/estadosService';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import EstadoSelect, { useEstadoLembrado } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/hooks/use-confirm';

// EPIs e uniformes são a mesma tabela (epis.tipo), a mesma que as fichas usam.
const ROTULO: Record<ItemTipo, { item: string; Icone: typeof Package }> = {
  epi: { item: 'EPI', Icone: Package },
  uniforme: { item: 'Uniforme', Icone: Shirt },
};

function TransferirDialog({ epi, uf, tamanhos, onDone }: {
  epi: EPI; uf: string; tamanhos: EPITamanho[]; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [destinos, setDestinos] = useState<string[]>([]);
  const [tamanho, setTamanho] = useState('');
  const [destino, setDestino] = useState('');
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const comSaldo = tamanhos.filter(t => t.estoque > 0);
  const disponivel = comSaldo.find(t => t.tamanho === tamanho)?.estoque ?? 0;

  useEffect(() => {
    if (!open) return;
    // Destino pode ser um estado que o usuário não acessa: quem manda é quem tem o estoque.
    listEstados().then(l => setDestinos(l.map(e => e.uf))).catch(() => {});
    setTamanho(comSaldo.length === 1 ? comSaldo[0].tamanho : '');
    setDestino(''); setQtd(''); setObs('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const enviar = async () => {
    const n = Number(qtd);
    if (!tamanho || !destino) return toast.error('Escolha o tamanho e o estado de destino');
    if (!Number.isInteger(n) || n <= 0) return toast.error('Quantidade inválida');
    if (n > disponivel) return toast.error(`Só há ${disponivel} em ${uf}`);
    setSalvando(true);
    try {
      await transferirEstoque({ epiId: epi.id, tamanho, ufOrigem: uf, ufDestino: destino, quantidade: n, observacao: obs });
      toast.success(`${n} × ${epi.nome} (${tamanho}) transferido de ${uf} para ${destino}`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro na transferência');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={comSaldo.length === 0}
          title={comSaldo.length === 0 ? `Sem saldo em ${uf}` : undefined}>
          <ArrowRightLeft className="h-4 w-4 mr-1" /> Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir {epi.nome}</DialogTitle>
          <DialogDescription>Sai do estoque de {uf} e entra no estado de destino.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tr-tam">Tamanho</Label>
            <Select value={tamanho} onValueChange={setTamanho}>
              <SelectTrigger id="tr-tam"><SelectValue placeholder="Tamanho" /></SelectTrigger>
              <SelectContent>
                {comSaldo.map(t => <SelectItem key={t.id} value={t.tamanho}>{t.tamanho} ({t.estoque} un.)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-dest">Para o estado</Label>
            <EstadoSelect id="tr-dest" value={destino} onChange={setDestino} opcoes={destinos} excluir={[uf]} placeholder="Destino" />
          </div>
          <div>
            <Label htmlFor="tr-qtd">Quantidade</Label>
            <Input id="tr-qtd" inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)}
              placeholder={tamanho ? `até ${disponivel}` : ''} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="tr-obs">Observação</Label>
            <Input id="tr-obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: enviado pela transportadora X" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={enviar} disabled={salvando}><ArrowRightLeft className="h-4 w-4 mr-1" /> Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemPanel({ tipo, uf }: { tipo: ItemTipo; uf: string }) {
  const r = ROTULO[tipo];
  const [epis, setEpis] = useState<EPI[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
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

  const load = useCallback(async () => {
    if (!uf) return;
    try {
      const [lista, t] = await Promise.all([listEpis(tipo), totaisPorItem(uf)]);
      setEpis(lista); setTotais(t);
    } catch (e: any) { toast.error(e.message); }
  }, [tipo, uf]);

  const loadTamanhos = useCallback(async (epiId: string) => setTamanhos(await listTamanhos(epiId, uf)), [uf]);

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
  }, [editing, load, loadTamanhos, tipo]);

  // Trocou o estado com o detalhe aberto: recarrega os tamanhos do novo estado.
  useEffect(() => { if (editing) loadTamanhos(editing.id); }, [uf]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    (e.codigo || '').toLowerCase().includes(search.toLowerCase())
  );

  const saldo = (e: EPI) => totais[e.id] ?? 0;
  const status = (e: EPI) =>
    saldo(e) === 0 ? { label: 'Sem estoque', tone: 'destructive' as const }
    : saldo(e) <= e.estoque_minimo ? { label: 'Crítico', tone: 'destructive' as const }
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
    if (!editing) return;
    try {
      await ajustarEstoque(editing.id, uf, novoTam.trim() || TAMANHO_UNICO, novoQtd, 'Cadastro de tamanho');
      setNovoTam(''); setNovoQtd(0);
      await loadTamanhos(editing.id); load();
      toast.success('Tamanho atualizado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUpdateTam = async (t: EPITamanho, estoque: number) => {
    try { await ajustarEstoque(t.epi_id, t.uf, t.tamanho, estoque); await loadTamanhos(t.epi_id); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const handleReset = async (epiId: string) => {
    if (!(await confirm(`Zerar o estoque deste ${r.item} em ${uf} (todos os tamanhos)? Será registrada uma saída.`))) return;
    try {
      await resetarEstoqueEpi(epiId, uf);
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
              <p className="text-xs text-muted-foreground">O cadastro vale para todos os estados; o estoque é separado por estado.</p>
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
                <TableHead className="text-right">Estoque {uf}</TableHead>
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
                    <TableCell className="text-right font-bold tabular-nums">{saldo(epi)}</TableCell>
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
          <DialogHeader>
            <DialogTitle>{editing?.nome} — Estoque em {uf}</DialogTitle>
            <DialogDescription>Saldo por tamanho neste estado. Item sem tamanho fica como "{TAMANHO_UNICO}".</DialogDescription>
          </DialogHeader>
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
            {tamanhos.length === 0 && <p className="text-sm text-muted-foreground">Sem estoque em {uf}.</p>}
            <div className="flex gap-2 items-end pt-2 border-t">
              <div className="flex-1"><Label htmlFor="tam-novo" className="text-xs">Tamanho</Label>
                <Input id="tam-novo" value={novoTam} onChange={e => setNovoTam(e.target.value)} placeholder={`P, M, G... (vazio = ${TAMANHO_UNICO})`} /></div>
              <div><Label htmlFor="tam-qtd" className="text-xs">Quantidade</Label>
                <Input id="tam-qtd" type="number" min={0} value={novoQtd} onChange={e => setNovoQtd(parseInt(e.target.value) || 0)} className="w-28" /></div>
              <Button onClick={handleAddTamanho} aria-label="Adicionar tamanho"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <DialogFooter className="flex flex-wrap justify-between gap-2">
            <Button variant="destructive" onClick={async () => {
              if (!editing) return;
              if (!(await confirm(`Excluir este ${r.item}? Ele some do cadastro de TODOS os estados.`))) return;
              await deleteEpi(editing.id); setEditing(null); load();
            }}>Excluir {r.item}</Button>
            <div className="flex gap-2">
              {editing && (
                <TransferirDialog epi={editing} uf={uf} tamanhos={tamanhos}
                  onDone={() => { loadTamanhos(editing.id); load(); }} />
              )}
              <Button variant="outline" onClick={() => editing && handleReset(editing.id)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Resetar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}

export default function Estoque() {
  const { can, estados } = useAuth();
  const navigate = useNavigate();
  const [uf, setUf] = useEstadoLembrado('estoque');
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader eyebrow="Gestão" title="Estoque"
          actions={
            <div className="flex items-center gap-2">
              <EstadoSelect value={uf} onChange={setUf} className="w-28" />
              {can('estoque', 'create') && (
                <Button onClick={() => navigate('/estoque/entrada')}>
                  <PackagePlus className="h-4 w-4 mr-1" /> Registrar entrada
                </Button>
              )}
            </div>
          } />

        {estados.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            Nenhum estado liberado para o seu usuário. Peça ao administrador para liberar em Usuários.
          </CardContent></Card>
        ) : uf && (
          <>
            <EstoqueChart uf={uf} />

            <Tabs defaultValue="epis" className="w-full">
              <TabsList className="grid w-full max-w-lg grid-cols-4">
                <TabsTrigger value="epis">EPIs</TabsTrigger>
                <TabsTrigger value="uniformes">Uniformes</TabsTrigger>
                <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
                <TabsTrigger value="relatorio">Relatório</TabsTrigger>
              </TabsList>
              <TabsContent value="epis" className="mt-6"><ItemPanel tipo="epi" uf={uf} /></TabsContent>
              <TabsContent value="uniformes" className="mt-6"><ItemPanel tipo="uniforme" uf={uf} /></TabsContent>
              <TabsContent value="fornecedores" className="mt-6"><FornecedoresPanel /></TabsContent>
              <TabsContent value="relatorio" className="mt-6"><RelatorioMovimentacoes uf={uf} /></TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
