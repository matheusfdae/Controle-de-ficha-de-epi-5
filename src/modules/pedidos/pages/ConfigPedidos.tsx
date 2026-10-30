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
import { AlertTriangle, CalendarCheck, Copy, FlaskConical, HardHat, Loader2, Mail, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  PAPEIS, avisarAgora, dataBr, excluirAprovador, excluirTabela, excluirTeto, formatarMoeda, hojeBr, lerConfigAvisos,
  listAprovadores, listItensPorPosto, listMateriais, listTabelas, listTetos, listUsuarios, materiaisPediveis, nomeMaterial,
  novaTabela, precosDaTabela, publicarTabela, rotuloPapel, salvarAprovador, salvarConfigAvisos, salvarMaterial,
  salvarPostoSobDemanda, salvarPrecos, salvarTeto, simularTabela, tetoNoMes,
  type Aprovador, type Material, type Papel, type Simulacao, type TabelaPrecos, type TetoPosto,
} from '../lib/pedidosService';

/** Configuração dos pedidos: itens, tabela de preços, tetos, postos sob demanda, papéis e avisos. */
export default function ConfigPedidos() {
  const { can, user } = useAuth();
  const [souCompras, setSouCompras] = useState(false);
  useEffect(() => {
    listAprovadores().then(a => setSouCompras(a.some(x => x.user_id === user?.id && x.nivel === 'compras'))).catch(() => {});
  }, [user?.id]);
  const podeEditar = can('pedidos_material', 'edit');
  // Compras mantém itens, tabela de preços, tetos e itens por posto (como no banco: _pm_gestor).
  const gestor = podeEditar || souCompras;
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Configurações de Pedidos" eyebrow="Pedidos"
          description="Itens que os encarregados podem pedir, tabela de preços, teto mensal de cada posto, postos sob demanda, papéis e avisos." />
        {!gestor && <p className="text-sm text-muted-foreground">Você só pode consultar. Para alterar, é preciso ser de Compras ou ter a permissão "editar" em Pedidos de Material.</p>}
        <Tabs defaultValue="itens">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="itens">Itens</TabsTrigger>
            <TabsTrigger value="precos">Tabela de preços</TabsTrigger>
            <TabsTrigger value="tetos">Teto por posto</TabsTrigger>
            <TabsTrigger value="demanda">Postos sob demanda</TabsTrigger>
            <TabsTrigger value="papeis">Papéis</TabsTrigger>
            <TabsTrigger value="avisos">Avisos por e-mail</TabsTrigger>
          </TabsList>
          <TabsContent value="itens" className="mt-4"><Itens podeEditar={gestor} /></TabsContent>
          <TabsContent value="precos" className="mt-4"><Precos podeEditar={gestor} /></TabsContent>
          <TabsContent value="tetos" className="mt-4"><Tetos podeEditar={gestor} /></TabsContent>
          <TabsContent value="demanda" className="mt-4"><SobDemanda podeEditar={gestor && can('configuracoes', 'edit')} /></TabsContent>
          <TabsContent value="papeis" className="mt-4"><Papeis podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="avisos" className="mt-4"><Avisos podeEditar={podeEditar} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/** "100.000,50" ou "100000.50" -> 100000.5; vazio -> null. Com vírgula, os pontos são de milhar. */
const paraNumero = (v: string) => {
  const t = v.trim();
  if (t === '') return null;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};
const paraTexto = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

// ---------- Itens ----------

function Itens({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Material[]>([]);
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<{ id?: string; nome: string; item_pai_id: string; unidade: string; categoria: string; is_epi: boolean; ativo: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => listMateriais().then(setLista).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const pais = lista.filter(m => !m.item_pai_id && m.id !== edit?.id);
  const temFilhos = (id: string) => lista.some(f => f.item_pai_id === id);

  const salvar = async () => {
    if (!edit?.nome.trim()) return toast.error('Informe o nome.');
    setSalvando(true);
    try {
      await salvarMaterial({ ...edit, item_pai_id: edit.item_pai_id || null });
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
          Item marcado como EPI avisa na hora os e-mails da aba Avisos. O preço fica na tabela de preços.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar item" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
          {podeEditar && <Button className="gap-2" onClick={() => setEdit({ nome: '', item_pai_id: '', unidade: 'un', categoria: '', is_epi: false, ativo: true })}><Plus className="h-4 w-4" /> Novo item</Button>}
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
            <TableHead>Item</TableHead><TableHead>Unidade</TableHead><TableHead>Categoria</TableHead><TableHead>Situação</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {filtrada.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum item cadastrado.</TableCell></TableRow>}
            {filtrada.map(m => (
              <TableRow key={m.id} className={m.ativo ? '' : 'opacity-60'}>
                <TableCell className={m.item_pai_id ? 'pl-8' : 'font-medium'}>
                  {m.item_pai_id ? `↳ ${m.nome}` : m.nome}
                  {m.is_epi && <Badge variant="outline" className="ml-2 gap-1"><HardHat className="h-3 w-3" /> EPI</Badge>}
                  {temFilhos(m.id) && <span className="ml-2 text-xs text-muted-foreground">(agrupa variações)</span>}
                </TableCell>
                <TableCell>{m.unidade}</TableCell><TableCell>{m.categoria ?? '—'}</TableCell>
                <TableCell>{m.ativo ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  {podeEditar && <Button variant="ghost" size="icon" aria-label={`Editar ${m.nome}`} onClick={() => setEdit({
                    id: m.id, nome: m.nome, item_pai_id: m.item_pai_id ?? '', unidade: m.unidade, categoria: m.categoria ?? '', is_epi: m.is_epi, ativo: m.ativo,
                  })}><Pencil className="h-4 w-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Tabela de preços ----------

const ROTULO_TABELA: Record<TabelaPrecos['status'], string> = { rascunho: 'Rascunho', vigente: 'Vigente', encerrada: 'Encerrada' };

function Precos({ podeEditar }: { podeEditar: boolean }) {
  const [tabelas, setTabelas] = useState<TabelaPrecos[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [vigentes, setVigentes] = useState<Map<string, number>>(new Map());
  const [nomeNova, setNomeNova] = useState('');
  const [inicio, setInicio] = useState(hojeBr());
  const [simulacao, setSimulacao] = useState<Simulacao[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([listTabelas(), listMateriais()]);
      setTabelas(t); setMateriais(m);
      const vig = t.find(x => x.status === 'vigente');
      setVigentes(vig ? await precosDaTabela(vig.id) : new Map());
      setSelecionada(s => s ?? t.find(x => x.status === 'rascunho')?.id ?? vig?.id ?? null);
    } catch (e) { toast.error((e as Error).message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const tabela = tabelas.find(t => t.id === selecionada) ?? null;
  const editavel = podeEditar && tabela?.status === 'rascunho';
  useEffect(() => {
    setSimulacao(null);
    if (!selecionada) { setPrecos({}); return; }
    precosDaTabela(selecionada).then(m => setPrecos(Object.fromEntries([...m].map(([k, v]) => [k, paraTexto(v)])))).catch(e => toast.error(e.message));
  }, [selecionada]);

  const itens = materiaisPediveis(materiais);
  const tentar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  };

  const criar = () => tentar(async () => {
    const id = await novaTabela(nomeNova);
    setNomeNova('');
    toast.success('Rascunho criado com os preços da tabela vigente.');
    setSelecionada(id);
    await carregar();
  });

  const gravar = async () => {
    if (!tabela) return;
    const mapa = new Map<string, number | null>();
    for (const m of itens) {
      const v = paraNumero(precos[m.id] ?? '');
      if (v != null && !(v >= 0)) throw new Error(`Preço inválido em ${nomeMaterial(m, materiais)}.`);
      mapa.set(m.id, v);
    }
    await salvarPrecos(tabela.id, mapa);
  };

  const simular = () => tentar(async () => {
    await gravar();
    setSimulacao(await simularTabela(tabela!.id));
  });

  const publicar = () => tentar(async () => {
    if (!window.confirm(`Publicar "${tabela!.nome}" a partir de ${dataBr(inicio)}? A tabela vigente encerra na véspera.`)) return;
    await gravar();
    await publicarTabela(tabela!.id, inicio);
    toast.success('Tabela publicada.');
    await carregar();
  });

  const excedem = simulacao?.filter(s => s.excede).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tabela de preços</CardTitle>
        <CardDescription>
          O valor estimado de cada pedido usa a tabela vigente. Para atualizar (semestral), crie um rascunho, ajuste os preços,
          simule o impacto no teto dos postos e publique com a data de início. A tabela anterior fica guardada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-72">
            <Label>Tabela</Label>
            <Select value={selecionada ?? undefined} onValueChange={setSelecionada}>
              <SelectTrigger><SelectValue placeholder="Nenhuma tabela" /></SelectTrigger>
              <SelectContent>
                {tabelas.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} — {ROTULO_TABELA[t.status]}{t.vigencia_inicio ? ` (${dataBr(t.vigencia_inicio)}${t.vigencia_fim ? ` a ${dataBr(t.vigencia_fim)}` : ''})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {podeEditar && !tabelas.some(t => t.status === 'rascunho') && (
            <div className="flex gap-2 items-end">
              <div><Label htmlFor="nome-tab">Nova tabela</Label><Input id="nome-tab" value={nomeNova} onChange={e => setNomeNova(e.target.value)} placeholder="Ex.: 1º semestre 2027" /></div>
              <Button variant="outline" className="gap-2" disabled={ocupado || !nomeNova.trim()} onClick={criar}><Copy className="h-4 w-4" /> Criar rascunho</Button>
            </div>
          )}
        </div>

        {tabela && (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead><TableHead>Unidade</TableHead>
                {tabela.status === 'rascunho' && <TableHead className="text-right">Vigente</TableHead>}
                <TableHead className="text-right w-40">Preço (R$)</TableHead>
                {tabela.status === 'rascunho' && <TableHead className="text-right">Variação</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {itens.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cadastre os itens primeiro.</TableCell></TableRow>}
                {itens.map(m => {
                  const atual = vigentes.get(m.id);
                  const novo = paraNumero(precos[m.id] ?? '');
                  const varia = atual && novo != null ? Math.round(((novo - atual) / atual) * 10000) / 100 : null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{nomeMaterial(m, materiais)}</TableCell>
                      <TableCell>{m.unidade}</TableCell>
                      {tabela.status === 'rascunho' && <TableCell className="text-right tabular-nums">{formatarMoeda(atual)}</TableCell>}
                      <TableCell className="text-right">
                        {editavel ? (
                          <Input className="h-8 text-right" inputMode="decimal" placeholder="fora da tabela" value={precos[m.id] ?? ''}
                            onChange={e => setPrecos(p => ({ ...p, [m.id]: e.target.value.replace(/[^\d.,]/g, '') }))} />
                        ) : <span className="tabular-nums">{precos[m.id] ? formatarMoeda(paraNumero(precos[m.id])) : '—'}</span>}
                      </TableCell>
                      {tabela.status === 'rascunho' && (
                        <TableCell className={`text-right tabular-nums text-xs ${varia == null || varia === 0 ? 'text-muted-foreground' : varia > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                          {varia == null ? '—' : `${varia > 0 ? '+' : ''}${varia.toLocaleString('pt-BR')}%`}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {editavel && (
              <div className="flex flex-wrap gap-2 items-end justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2" disabled={ocupado} onClick={() => tentar(async () => { await gravar(); toast.success('Rascunho salvo.'); })}>
                    <Save className="h-4 w-4" /> Salvar rascunho
                  </Button>
                  <Button variant="outline" className="gap-2" disabled={ocupado} onClick={simular}><FlaskConical className="h-4 w-4" /> Simular impacto no teto</Button>
                  <Button variant="ghost" className="gap-2 text-destructive" disabled={ocupado}
                    onClick={() => window.confirm('Apagar este rascunho?') && tentar(async () => { await excluirTabela(tabela.id); setSelecionada(null); await carregar(); })}>
                    <Trash2 className="h-4 w-4" /> Apagar rascunho
                  </Button>
                </div>
                <div className="flex gap-2 items-end">
                  <div><Label htmlFor="ini-vig">Vale a partir de</Label><Input id="ini-vig" type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="w-44" /></div>
                  <Button className="gap-2" disabled={ocupado || !inicio} onClick={publicar}><CalendarCheck className="h-4 w-4" /> Publicar</Button>
                </div>
              </div>
            )}

            {simulacao && (
              <div className="space-y-2">
                <p className={`text-sm font-medium flex items-center gap-1 ${excedem ? 'text-destructive' : ''}`}>
                  {excedem ? <><AlertTriangle className="h-4 w-4" /> {excedem} posto(s) devem passar do teto com esta tabela.</> : 'Nenhum posto deve passar do teto com esta tabela.'}
                </p>
                <p className="text-xs text-muted-foreground">Consumo médio mensal dos últimos 90 dias (quantidades dos pedidos aprovados) com os preços de cada tabela.</p>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Posto</TableHead><TableHead className="text-right">Teto</TableHead>
                    <TableHead className="text-right">Média com a vigente</TableHead><TableHead className="text-right">Média com esta</TableHead><TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {simulacao.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sem consumo nos últimos 90 dias para simular.</TableCell></TableRow>}
                    {simulacao.map(s => (
                      <TableRow key={s.posto_id}>
                        <TableCell>{s.posto} <span className="text-xs text-muted-foreground">{s.uf}</span></TableCell>
                        <TableCell className="text-right tabular-nums">{s.teto == null ? 'Sem teto' : formatarMoeda(s.teto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(s.media_atual)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatarMoeda(s.media_nova)}</TableCell>
                        <TableCell>{s.excede && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Excede</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Tetos ----------

function Tetos({ podeEditar }: { podeEditar: boolean }) {
  const { user } = useAuth();
  const [postos, setPostos] = useState<Posto[]>([]);
  const [tetos, setTetos] = useState<(TetoPosto & { id: string })[]>([]);
  const [busca, setBusca] = useState('');
  const [mes, setMes] = useState(hojeBr().slice(0, 7));
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const carregar = useCallback(() => Promise.all([listPostos(), listTetos()])
    .then(([p, t]) => { setPostos(p.filter(x => x.ativo)); setTetos(t); }).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (posto: Posto) => {
    const v = paraNumero(valores[posto.id] ?? '');
    if (v == null || !(v >= 0)) return toast.error('Informe o valor do teto.');
    setSalvando(posto.id);
    try {
      await salvarTeto(posto.id, mes, v, user?.id ?? null);
      toast.success(`Teto de ${posto.nome} a partir de ${mes.split('-').reverse().join('/')}: ${formatarMoeda(v)}`);
      setValores(x => { const c = { ...x }; delete c[posto.id]; return c; });
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(null); }
  };

  const remover = async (id: string) => {
    if (!window.confirm('Apagar esta definição de teto?')) return;
    try { await excluirTeto(id); await carregar(); } catch (e) { toast.error((e as Error).message); }
  };

  const termo = busca.trim().toLowerCase();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Teto mensal por posto</CardTitle>
        <CardDescription>O valor vale do mês escolhido em diante, até uma nova definição. O histórico fica guardado para os relatórios dos meses anteriores.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div><Label htmlFor="mes-teto">Vale a partir de</Label><Input id="mes-teto" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className="w-44" /></div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar posto" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Posto</TableHead><TableHead className="text-right">Teto em {mes.split('-').reverse().join('/')}</TableHead>
            <TableHead>Histórico</TableHead>{podeEditar && <TableHead className="w-56">Novo valor (R$)</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {postos.filter(p => !termo || p.nome.toLowerCase().includes(termo)).map(p => {
              const historico = tetos.filter(t => t.posto_id === p.id).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde));
              const atual = tetoNoMes(tetos, p.id, `${mes}-01`);
              return (
                <TableRow key={p.id}>
                  <TableCell>{p.nome} <span className="text-xs text-muted-foreground">{p.uf}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{atual == null ? '—' : formatarMoeda(atual)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {historico.length === 0 ? 'Sem teto' : historico.map(t => (
                      <span key={t.id} className="inline-flex items-center gap-1 mr-2">
                        desde {dataBr(t.vigente_desde).slice(3)}: {formatarMoeda(t.valor)}
                        {podeEditar && <button type="button" aria-label="Apagar" className="hover:text-destructive" onClick={() => remover(t.id)}><Trash2 className="h-3 w-3" /></button>}
                      </span>
                    ))}
                  </TableCell>
                  {podeEditar && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Input className="h-8" inputMode="decimal" placeholder="100.000,00" value={valores[p.id] ?? ''}
                          onChange={e => setValores(x => ({ ...x, [p.id]: e.target.value.replace(/[^\d.,]/g, '') }))}
                          onKeyDown={e => e.key === 'Enter' && salvar(p)} />
                        <Button size="sm" variant="outline" disabled={salvando === p.id || !valores[p.id]} onClick={() => salvar(p)}>
                          {salvando === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Postos sob demanda ----------

function SobDemanda({ podeEditar }: { podeEditar: boolean }) {
  const [postos, setPostos] = useState<(Posto & { sob_demanda?: boolean })[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [liberados, setLiberados] = useState<{ posto_id: string; material_id: string }[]>([]);
  const [postoId, setPostoId] = useState('');
  const [marcado, setMarcado] = useState(false);
  const [itens, setItens] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => Promise.all([listPostos(), listMateriais(), listItensPorPosto()])
    .then(([p, m, l]) => { setPostos(p.filter(x => x.ativo)); setMateriais(m); setLiberados(l); }).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const escolher = (id: string) => {
    setPostoId(id);
    setMarcado(!!postos.find(p => p.id === id)?.sob_demanda);
    setItens(liberados.filter(l => l.posto_id === id).map(l => l.material_id));
  };

  const salvar = async () => {
    if (marcado && itens.length === 0) return toast.error('Marque os itens liberados para o posto.');
    setSalvando(true);
    try {
      await salvarPostoSobDemanda(postoId, marcado, itens);
      toast.success('Posto salvo.');
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const pediveis = materiaisPediveis(materiais);
  const sobDemanda = postos.filter(p => p.sob_demanda);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Postos sob demanda</CardTitle>
        <CardDescription>
          Posto sob demanda só vê, no link do encarregado, os itens liberados para ele. Os demais postos veem o catálogo inteiro.
          {sobDemanda.length > 0 && <> Hoje: {sobDemanda.map(p => p.nome).join(', ')}.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="w-full sm:w-80">
          <Label>Posto</Label>
          <Select value={postoId || undefined} onValueChange={escolher}>
            <SelectTrigger><SelectValue placeholder="Escolha o posto" /></SelectTrigger>
            <SelectContent>{postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.uf}){p.sob_demanda ? ' — sob demanda' : ''}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {postoId && (
          <>
            <div className="flex items-center gap-2">
              <Switch id="sob" checked={marcado} disabled={!podeEditar} onCheckedChange={setMarcado} />
              <Label htmlFor="sob">Posto sob demanda</Label>
            </div>
            {marcado && (
              <div className="max-h-72 overflow-y-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {pediveis.map(m => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={itens.includes(m.id)} disabled={!podeEditar}
                      onCheckedChange={v => setItens(x => (v ? [...x, m.id] : x.filter(i => i !== m.id)))} />
                    <span className="truncate">{nomeMaterial(m, materiais)}</span>
                  </label>
                ))}
              </div>
            )}
            {podeEditar
              ? <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
              : <p className="text-xs text-muted-foreground">Para mudar, é preciso ser de Compras e ter a permissão "editar" em Configurações (o cadastro do posto).</p>}
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
  const [link, setLink] = useState('');
  const [emailsEpi, setEmailsEpi] = useState('');
  const [diasCobertura, setDiasCobertura] = useState('30');
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    lerConfigAvisos().then(c => {
      setLigado(c.avisar_email);
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
      await salvarConfigAvisos({ avisar_email: ligado, link_sistema: link, emails_epi: [...new Set(lista)], dias_cobertura: dias });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Avisos por e-mail</CardTitle>
        <CardDescription>
          Quando um pedido chega a uma etapa, quem tem o papel dela recebe um e-mail (um só, com todos os pedidos novos):
          conferência → supervisor; orçamento e faturamento → compras; excesso de teto → comercial e gerência.
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
  );
}
