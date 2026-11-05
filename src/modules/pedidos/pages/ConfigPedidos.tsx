import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BellRing, FileSpreadsheet, HardHat, Loader2, Mail, MessageCircle, Pencil, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  PAPEIS, alertarPedidosWhatsApp, avisarAgora, definirDiaPedido, definirTeto, excluirAprovador, hojeBr, lerConfigAvisos, listAprovadores, listItensPorPosto, listMateriais, listUsuarios,
  materiaisPediveis, nomeMaterial, reais, rotuloPapel, salvarAprovador, salvarConfigAvisos, salvarListaDoPosto, salvarMaterial,
  type Aprovador, type Material, type Papel, type ResultadoAlerta,
} from '../lib/pedidosService';
import ImportarPlanilha from '../components/ImportarPlanilha';
import ImportarPrecos from '../components/ImportarPrecos';
import ContatosAlerta from '../components/ContatosAlerta';
import { DIAS_CONTATOS, proximaPrevista } from '../../../../supabase/functions/_shared/alertaPedido';

/** "12,90" / "1.234,5" -> 12.9; vazio -> null; inválido -> NaN. */
const lerValor = (t: string) => {
  const v = t.trim().replace(/R\$|\s/g, '');
  if (!v) return null;
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};
const valorTexto = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','));

/** Configuração dos pedidos: itens, lista de cada posto, papéis, avisos e importação da planilha. */
export default function ConfigPedidos() {
  const { can, user } = useAuth();
  const [souCompras, setSouCompras] = useState(false);
  useEffect(() => {
    listAprovadores().then(a => setSouCompras(a.some(x => x.user_id === user?.id && x.nivel === 'compras'))).catch(() => {});
  }, [user?.id]);
  const podeEditar = can('pedidos_material', 'edit');
  // Compras mantém itens e as listas dos postos (como no banco: _pm_gestor).
  const gestor = podeEditar || souCompras;
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Configurações de Pedidos" eyebrow="Pedidos"
          description="Itens que os encarregados podem pedir, a lista de cada posto, quem confere e quem atende, e os avisos." />
        {!gestor && <p className="text-sm text-muted-foreground">Você só pode consultar. Para alterar, é preciso ser de Compras ou ter a permissão "editar" em Pedidos de Material.</p>}
        <Tabs defaultValue="itens">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="demanda">Itens por posto</TabsTrigger>
            <TabsTrigger value="papeis">Papéis</TabsTrigger>
            <TabsTrigger value="avisos">Avisos por e-mail</TabsTrigger>
            <TabsTrigger value="importar">Importar planilha</TabsTrigger>
          </TabsList>
          <TabsContent value="itens" className="mt-4"><Itens podeEditar={gestor} /></TabsContent>
          <TabsContent value="demanda" className="mt-4"><ListaDoPosto podeEditar={gestor} /></TabsContent>
          <TabsContent value="papeis" className="mt-4"><Papeis podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="avisos" className="mt-4"><Avisos podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="importar" className="mt-4"><ImportarPlanilha podeEditar={gestor} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---------- Itens ----------

function Itens({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Material[]>([]);
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<{ id?: string; nome: string; item_pai_id: string; unidade: string; categoria: string; is_epi: boolean; ativo: boolean; preco: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [importandoPrecos, setImportandoPrecos] = useState(false);
  const carregar = useCallback(() => listMateriais().then(setLista).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const pais = lista.filter(m => !m.item_pai_id && m.id !== edit?.id);
  const temFilhos = (id: string) => lista.some(f => f.item_pai_id === id);

  const salvar = async () => {
    if (!edit?.nome.trim()) return toast.error('Informe o nome.');
    const preco = lerValor(edit.preco);
    if (Number.isNaN(preco)) return toast.error('Preço inválido. Use, por exemplo, 12,90.');
    setSalvando(true);
    try {
      await salvarMaterial({ ...edit, item_pai_id: edit.item_pai_id || null, preco });
      toast.success('Item salvo.');
      setEdit(null);
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  // Pai seguido das variações; busca pelo nome completo.
  const termo = busca.trim().toLowerCase();
  const ordenada = useMemo(() => {
    const raizes = lista.filter(m => !m.item_pai_id).sort((a, b) => a.nome.localeCompare(b.nome));
    return raizes.flatMap(r => [r, ...lista.filter(f => f.item_pai_id === r.id).sort((a, b) => a.nome.localeCompare(b.nome))]);
  }, [lista]);
  const filtrada = ordenada.filter(m => !termo || nomeMaterial(m, lista).toLowerCase().includes(termo) || (m.categoria ?? '').toLowerCase().includes(termo));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cadastro de itens</CardTitle>
        <CardDescription>
          Um item pode ter variações (ex.: Detergente → 500 ml, 5 L): o pai só agrupa, o encarregado pede a variação.
          Item marcado como EPI avisa na hora os e-mails da aba Avisos. O preço entra no valor dos pedidos (e no teto do posto);
          o pedido guarda o preço do dia em que foi feito.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar item" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setImportandoPrecos(true)}><FileSpreadsheet className="h-4 w-4" /> Importar preços</Button>
              <Button className="gap-2" onClick={() => setEdit({ nome: '', item_pai_id: '', unidade: 'un', categoria: '', is_epi: false, ativo: true, preco: '' })}><Plus className="h-4 w-4" /> Novo item</Button>
            </div>
          )}
        </div>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-6 items-end rounded-md border p-3">
            <div className="sm:col-span-2">
              <Label>Variação de</Label>
              <Select value={edit.item_pai_id || '__nenhum__'} onValueChange={v => setEdit({ ...edit, item_pai_id: v === '__nenhum__' ? '' : v })}
                disabled={!!edit.id && temFilhos(edit.id)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">— nenhum (item principal)</SelectItem>
                  {pais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Nome *</Label><Input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} placeholder={edit.item_pai_id ? 'Ex.: 500 ml' : 'Ex.: Vassoura de pelo'} /></div>
            <div><Label>Unidade</Label><Input value={edit.unidade} onChange={e => setEdit({ ...edit, unidade: e.target.value })} placeholder="un, fardo, litro" /></div>
            <div><Label>Categoria</Label><Input value={edit.categoria} onChange={e => setEdit({ ...edit, categoria: e.target.value })} placeholder="Limpeza" /></div>
            <div><Label>Preço (R$)</Label><Input inputMode="decimal" value={edit.preco} onChange={e => setEdit({ ...edit, preco: e.target.value })} placeholder="12,90" /></div>
            <div className="flex items-center gap-2 pb-2"><Switch checked={edit.is_epi} onCheckedChange={v => setEdit({ ...edit, is_epi: v })} id="epi" /><Label htmlFor="epi">É EPI</Label></div>
            <div className="flex items-center gap-2 pb-2"><Switch checked={edit.ativo} onCheckedChange={v => setEdit({ ...edit, ativo: v })} id="ativo" /><Label htmlFor="ativo">Ativo</Label></div>
            <div className="sm:col-span-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Item</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Preço</TableHead><TableHead>Categoria</TableHead><TableHead>Situação</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {filtrada.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum item cadastrado.</TableCell></TableRow>}
            {filtrada.map(m => (
              <TableRow key={m.id} className={m.ativo ? '' : 'opacity-60'}>
                <TableCell className={m.item_pai_id ? 'pl-8' : 'font-medium'}>
                  {m.item_pai_id ? `↳ ${m.nome}` : m.nome}
                  {m.is_epi && <Badge variant="outline" className="ml-2 gap-1"><HardHat className="h-3 w-3" /> EPI</Badge>}
                  {temFilhos(m.id) && <span className="ml-2 text-xs text-muted-foreground">(agrupa variações)</span>}
                </TableCell>
                <TableCell>{m.unidade}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{temFilhos(m.id) ? '' : m.preco == null ? <span className="text-amber-600 text-xs">sem preço</span> : reais(m.preco)}</TableCell>
                <TableCell>{m.categoria ?? '—'}</TableCell>
                <TableCell>{m.ativo ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  {podeEditar && <Button variant="ghost" size="icon" aria-label={`Editar ${m.nome}`} onClick={() => setEdit({
                    id: m.id, nome: m.nome, item_pai_id: m.item_pai_id ?? '', unidade: m.unidade, categoria: m.categoria ?? '', is_epi: m.is_epi, ativo: m.ativo,
                    preco: valorTexto(m.preco),
                  })}><Pencil className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <ImportarPrecos open={importandoPrecos} onOpenChange={setImportandoPrecos} materiais={lista.filter(m => !temFilhos(m.id))} onImportado={carregar} />
      </CardContent>
    </Card>
  );
}

// ---------- Itens por posto ----------

function ListaDoPosto({ podeEditar }: { podeEditar: boolean }) {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [listas, setListas] = useState<{ posto_id: string; material_id: string }[]>([]);
  const [postoId, setPostoId] = useState('');
  const [itens, setItens] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [teto, setTeto] = useState('');
  const [diaPedido, setDiaPedido] = useState('');
  const [salvandoDia, setSalvandoDia] = useState(false);
  const [salvandoTeto, setSalvandoTeto] = useState(false);
  const carregar = useCallback(() => Promise.all([listPostos(), listMateriais(), listItensPorPosto()])
    .then(([p, m, l]) => { setPostos(p.filter(x => x.ativo)); setMateriais(m); setListas(l); }).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const escolher = (id: string) => {
    setPostoId(id); setItens(listas.filter(l => l.posto_id === id).map(l => l.material_id));
    setTeto(valorTexto(postos.find(p => p.id === id)?.teto_material ?? null));
    setDiaPedido(String(postos.find(p => p.id === id)?.pedido_dia ?? ''));
  };
  const salvarDia = async () => {
    const t = diaPedido.trim();
    const v = t === '' ? null : Number(t);
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 31)) return toast.error('Dia do pedido: de 1 a 31 (ou em branco para sem data).');
    setSalvandoDia(true);
    try {
      await definirDiaPedido(postoId, v);
      toast.success(v == null ? 'Posto sem data prevista de pedido.' : `Pedido previsto todo dia ${v}. Próximo: ${proximaPrevista(v, hojeBr()).split('-').reverse().join('/')}.`);
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvandoDia(false); }
  };
  const salvarTeto = async () => {
    const v = lerValor(teto);
    if (Number.isNaN(v)) return toast.error('Teto inválido. Use, por exemplo, 22.438,77.');
    setSalvandoTeto(true);
    try { await definirTeto(postoId, v); toast.success(v == null ? 'Posto sem teto.' : `Teto do posto: ${reais(v)} por mês.`); await carregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setSalvandoTeto(false); }
  };
  const salvar = async () => {
    setSalvando(true);
    try { await salvarListaDoPosto(postoId, itens); toast.success('Lista do posto salva.'); await carregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const termo = busca.trim().toLowerCase();
  const pediveis = materiaisPediveis(materiais).filter(m => !termo || nomeMaterial(m, materiais).toLowerCase().includes(termo));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Itens por posto</CardTitle>
        <CardDescription>
          Posto com lista só vê, no link do encarregado, os itens da lista dele; posto sem lista vê o catálogo inteiro.
          O teto mensal é o limite de gasto de material do posto: passou, Comercial e Gerência recebem um e-mail (o pedido segue normal).
          Lista e teto também podem vir da aba Importar planilha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-96">
          <Label>Posto</Label>
          <Select value={postoId || undefined} onValueChange={escolher}>
            <SelectTrigger><SelectValue placeholder="Escolha o posto" /></SelectTrigger>
            <SelectContent>{postos.map(p => {
              const n = listas.filter(l => l.posto_id === p.id).length;
              return <SelectItem key={p.id} value={p.id}>{p.nome} ({p.uf}){n ? ` — ${n} itens` : ' — catálogo inteiro'}</SelectItem>;
            })}</SelectContent>
          </Select>
        </div>
        {postoId && (
          <div className="flex items-end gap-2">
            <div className="w-40">
              <Label htmlFor="teto-posto">Teto mensal (R$)</Label>
              <Input id="teto-posto" inputMode="decimal" value={teto} disabled={!podeEditar} onChange={e => setTeto(e.target.value)} placeholder="sem teto" />
            </div>
            {podeEditar && (
              <Button variant="outline" className="gap-2" disabled={salvandoTeto} onClick={salvarTeto}>
                {salvandoTeto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar teto
              </Button>
            )}
          </div>
        )}
        {postoId && (
          <div className="flex items-end gap-2">
            <div className="w-36">
              <Label htmlFor="dia-pedido">Dia do pedido (1–31)</Label>
              <Input id="dia-pedido" inputMode="numeric" value={diaPedido} disabled={!podeEditar} placeholder="sem data"
                onChange={e => setDiaPedido(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
            {podeEditar && (
              <Button variant="outline" className="gap-2" disabled={salvandoDia} onClick={salvarDia}>
                {salvandoDia ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Salvar dia
              </Button>
            )}
          </div>
        )}
        </div>
        {postoId && (
          <ContatosAlerta postoId={postoId} postoNome={postos.find(p => p.id === postoId)?.nome ?? ''}
            diaPedido={String(postos.find(p => p.id === postoId)?.pedido_dia ?? '')} podeEditar={podeEditar} />
        )}
        {postoId && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Lista do posto: {itens.length ? `${itens.length} item(ns) marcados` : 'vazia (o encarregado vê o catálogo inteiro)'}.</span>
              {itens.length > 0 && podeEditar && <button type="button" className="text-primary hover:underline" onClick={() => setItens([])}>Limpar lista</button>}
              <div className="relative w-full sm:w-64 ml-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar item" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-9" />
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {pediveis.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={itens.includes(m.id)} disabled={!podeEditar}
                    onCheckedChange={v => setItens(x => (v ? [...x, m.id] : x.filter(i => i !== m.id)))} />
                  <span className="truncate">{nomeMaterial(m, materiais)}</span>
                </label>
              ))}
            </div>
            {podeEditar
              ? <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
              : <p className="text-xs text-muted-foreground">Para mudar, é preciso ser de Compras ou ter a permissão "editar" em Pedidos de Material.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Papéis ----------

function Papeis({ podeEditar }: { podeEditar: boolean }) {
  const { estados } = useAuth();
  const [lista, setLista] = useState<Aprovador[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string | null }[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [novo, setNovo] = useState<{ user_id: string; nivel: Papel | ''; uf: string; postos: string[] }>({ user_id: '', nivel: '', uf: estados[0] ?? '', postos: [] });
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => Promise.all([listAprovadores(), listUsuarios(), listPostos()])
    .then(([a, u, p]) => { setLista(a); setUsuarios(u); setPostos(p.filter(x => x.ativo)); }).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeUsuario = (id: string) => usuarios.find(u => u.id === id)?.nome ?? '(usuário removido)';
  const postosDoEstado = useMemo(() => postos.filter(p => p.uf === novo.uf), [postos, novo.uf]);

  const adicionar = async () => {
    if (!novo.user_id || !novo.nivel || !novo.uf) return toast.error('Escolha usuário, papel e estado.');
    setSalvando(true);
    try {
      await salvarAprovador({ user_id: novo.user_id, nivel: novo.nivel, uf: novo.uf, postos: novo.postos });
      toast.success('Papel salvo.');
      setNovo(x => ({ ...x, user_id: '', postos: [] }));
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const remover = async (id: string) => {
    if (!window.confirm('Tirar este papel?')) return;
    try { await excluirAprovador(id); await carregar(); } catch (e) { toast.error((e as Error).message); }
  };

  const ordenada = [...lista].sort((a, b) => a.uf.localeCompare(b.uf)
    || PAPEIS.findIndex(x => x.valor === a.nivel) - PAPEIS.findIndex(x => x.valor === b.nivel)
    || nomeUsuario(a.user_id).localeCompare(nomeUsuario(b.user_id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Papéis no fluxo</CardTitle>
        <CardDescription>
          Cada usuário recebe um papel em um estado — em todos os postos do estado ou só nos marcados. O mesmo usuário pode ter mais de um papel.
          <span className="block mt-1">{PAPEIS.map(x => `${x.rotulo}: ${x.descricao}`).join(' · ')}.</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeEditar && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Usuário</Label>
                <Select value={novo.user_id || undefined} onValueChange={v => setNovo(x => ({ ...x, user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={novo.nivel || undefined} onValueChange={v => setNovo(x => ({ ...x, nivel: v as Papel }))}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{PAPEIS.map(x => <SelectItem key={x.valor} value={x.valor}>{x.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <EstadoSelect value={novo.uf} onChange={uf => setNovo(x => ({ ...x, uf, postos: [] }))} />
              </div>
            </div>
            <div>
              <Label>Postos ({novo.postos.length === 0 ? 'todos do estado' : `${novo.postos.length} marcados`})</Label>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {postosDoEstado.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={novo.postos.includes(p.id)}
                      onCheckedChange={v => setNovo(x => ({ ...x, postos: v ? [...x.postos, p.id] : x.postos.filter(i => i !== p.id) }))} />
                    <span className="truncate">{p.nome}</span>
                  </label>
                ))}
                {postosDoEstado.length === 0 && <p className="text-sm text-muted-foreground">Nenhum posto neste estado.</p>}
              </div>
            </div>
            <Button onClick={adicionar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar</Button>
          </div>
        )}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Estado</TableHead><TableHead>Papel</TableHead><TableHead>Usuário</TableHead><TableHead>Postos</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {ordenada.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Ninguém cadastrado: sem isso os pedidos ficam parados (só o administrador age).</TableCell></TableRow>}
            {ordenada.map(a => (
              <TableRow key={a.id}>
                <TableCell>{a.uf}</TableCell>
                <TableCell>{rotuloPapel(a.nivel)}</TableCell>
                <TableCell>{nomeUsuario(a.user_id)}</TableCell>
                <TableCell className="text-sm">{a.postos.length === 0 ? 'Todos' : a.postos.map(id => postos.find(p => p.id === id)?.nome ?? '?').join(', ')}</TableCell>
                <TableCell>{podeEditar && <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => remover(a.id)}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Avisos ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Avisos({ podeEditar }: { podeEditar: boolean }) {
  const [ligado, setLigado] = useState(true);
  const [whats, setWhats] = useState(true);
  const [alerta, setAlerta] = useState<ResultadoAlerta | null>(null);
  const [alertando, setAlertando] = useState<'simular' | 'agora' | null>(null);
  const [link, setLink] = useState('');
  const [emailsEpi, setEmailsEpi] = useState('');
  const [diasCobertura, setDiasCobertura] = useState('30');
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    lerConfigAvisos().then(c => {
      setLigado(c.avisar_email);
      setWhats(c.alerta_whatsapp);
      setLink(c.link_sistema ?? '');
      setEmailsEpi((c.emails_epi ?? []).join('\n'));
      setDiasCobertura(String(c.dias_cobertura ?? 30));
      setCarregado(true);
    }).catch(e => toast.error(e.message));
  }, []);

  const salvar = async () => {
    if (link.trim() && !/^https?:\/\/\S+$/.test(link.trim())) return toast.error('O link precisa começar com http:// ou https://');
    const lista = emailsEpi.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    const invalido = lista.find(e => !EMAIL.test(e));
    if (invalido) return toast.error(`E-mail inválido: ${invalido}`);
    const dias = Number(diasCobertura);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) return toast.error('Dias de cobertura: de 1 a 365.');
    setSalvando(true);
    try {
      await salvarConfigAvisos({ avisar_email: ligado, alerta_whatsapp: whats, link_sistema: link, emails_epi: [...new Set(lista)], dias_cobertura: dias });
      toast.success('Avisos salvos.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const testar = async () => {
    setEnviando(true);
    try {
      const r = await avisarAgora();
      if (!r.enviado) toast.info(r.motivo ?? 'Nada para avisar agora.');
      else toast.success(`${r.emails} e-mail(s) enviado(s), ${r.pedidos} pedido(s) avisado(s).`);
      if (r.sem_destinatario?.length) toast.warning(`Sem ninguém com e-mail no papel para: ${r.sem_destinatario.join(', ')}`);
      if (r.falhas?.length) toast.error(`Falhou: ${r.falhas.join('; ')}`);
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  const rodarAlerta = async (modo: 'simular' | 'agora') => {
    if (modo === 'agora' && !confirm('Enviar agora pelo WhatsApp os alertas de pedido de hoje?')) return;
    setAlertando(modo);
    try {
      const r = await alertarPedidosWhatsApp(modo);
      setAlerta(r);
      if (modo === 'agora') {
        if (r.enviado) toast.success(`${r.agendados} mensagem(ns) agendada(s) no WhatsApp.`);
        else toast.info(r.motivo ?? 'Nenhum alerta para enviar hoje.');
        if (r.sem_whatsapp?.length) toast.warning(`Sem WhatsApp: ${r.sem_whatsapp.join(', ')}`);
      }
    } catch (e) { toast.error((e as Error).message); } finally { setAlertando(null); }
  };

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Avisos por e-mail</CardTitle>
        <CardDescription>
          Quando um pedido chega a uma etapa, quem tem o papel dela recebe um e-mail (um só, com todos os pedidos novos):
          conferência → supervisor; atendimento → compras.
          Pedido com item de EPI avisa na hora os e-mails abaixo. Sai pela conta Microsoft conectada em Configurações &gt; E-mail,
          a cada 5 minutos, depois de rodar <code className="mx-1">configurar-email.sh</code> na VM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!carregado ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
          <div className="flex items-center gap-2">
            <Switch id="avisar" checked={ligado} disabled={!podeEditar} onCheckedChange={setLigado} />
            <Label htmlFor="avisar">Enviar avisos</Label>
          </div>
          <div className="max-w-lg">
            <Label htmlFor="link">Endereço do sistema (para o botão "Abrir os pedidos" do e-mail)</Label>
            <div className="flex gap-2">
              <Input id="link" value={link} disabled={!podeEditar} placeholder="https://..." onChange={e => setLink(e.target.value)} />
              {podeEditar && <Button type="button" variant="outline" onClick={() => setLink(window.location.origin)}>Usar este</Button>}
            </div>
          </div>
          <div className="max-w-lg">
            <Label htmlFor="epi-emails" className="flex items-center gap-1"><HardHat className="h-4 w-4" /> Quem recebe o aviso de pedido com EPI</Label>
            <Textarea id="epi-emails" rows={3} disabled={!podeEditar} value={emailsEpi} onChange={e => setEmailsEpi(e.target.value)}
              placeholder={'seguranca@empresa.com.br\ncompras@empresa.com.br'} />
            <p className="text-xs text-muted-foreground mt-1">Um por linha (ou separados por vírgula). Em branco, ninguém recebe.</p>
          </div>
          <div className="max-w-lg">
            <Label htmlFor="dias-cob">Alerta de pedido acima do consumo (dias)</Label>
            <Input id="dias-cob" type="number" min={1} max={365} className="w-28" disabled={!podeEditar} value={diasCobertura} onChange={e => setDiasCobertura(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Na conferência, o item ganha alerta quando o estoque do posto mais o pedido durariam mais que isso pelo consumo lançado nos plantões.
            </p>
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
              <Button variant="outline" onClick={testar} disabled={enviando} className="gap-2">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Avisar agora
              </Button>
            </div>
          )}
        </>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /> Alerta de pedido por WhatsApp</CardTitle>
        <CardDescription>
          Cada posto tem um dia do mês para pedir (Itens por posto → Dia do pedido). 2 dias antes e no dia, às 8h, quem pediu por aquele posto
          pelo link nos últimos {DIAS_CONTATOS} dias recebe um lembrete no WhatsApp com o link do pedido (o endereço do sistema acima).
          Não sai se o posto já pediu perto da data, nem duas vezes para o mesmo número. Sai pelo WhatsApp da empresa (WA-AKG da VM),
          uma mensagem por minuto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {carregado && <>
          <div className="flex items-center gap-2">
            <Switch id="alerta-whats" checked={whats} disabled={!podeEditar} onCheckedChange={setWhats} />
            <Label htmlFor="alerta-whats">Enviar o alerta automático (clique em Salvar, acima, para gravar)</Label>
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" disabled={!!alertando} onClick={() => rodarAlerta('simular')}>
                {alertando === 'simular' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ver quem recebe hoje
              </Button>
              <Button variant="outline" className="gap-2" disabled={!!alertando} onClick={() => rodarAlerta('agora')}>
                {alertando === 'agora' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar os alertas de hoje agora
              </Button>
            </div>
          )}
          {alerta && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              {alerta.motivo && <p className="text-muted-foreground">{alerta.motivo}.</p>}
              {(alerta.alertas ?? []).length > 0 && (
                <div>
                  <p className="font-medium">{alerta.simulacao ? 'Receberiam hoje' : 'Enviado'}:</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {alerta.alertas!.map(a => (
                      <li key={a.posto + a.momento}><b>{a.posto}</b> · pedido em {a.data.split('-').reverse().join('/')} ({a.momento === 'dia' ? 'hoje' : 'daqui a 2 dias'}): {a.pessoas.join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(alerta.pulados ?? []).length > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground">Sem envio hoje:</p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">{alerta.pulados!.map(x => <li key={x.posto}>{x.posto}: {x.motivo}</li>)}</ul>
                </div>
              )}
              {alerta.simulacao && !(alerta.alertas ?? []).length && !(alerta.pulados ?? []).length && !alerta.motivo && <p className="text-muted-foreground">Nenhum alerta hoje.</p>}
            </div>
          )}
        </>}
      </CardContent>
    </Card>
    </div>
  );
}
