import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Mail, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import {
  NIVEIS, avisarAgora, dataBr, excluirAprovador, lerConfigAvisos, salvarConfigAvisos, excluirTeto, formatarMoeda, hojeBr, listAlcadas, listAprovadores, listMateriais,
  listTetos, listUsuarios, rotuloNivel, salvarAlcada, salvarAprovador, salvarMaterial, salvarTeto, tetoNoMes,
  type Aprovador, type Material, type Nivel, type TetoPosto,
} from '../lib/pedidosService';

/** Configuração dos pedidos de material: catálogo, tetos, alçada e aprovadores. */
export default function ConfigPedidos() {
  const { can } = useAuth();
  const podeEditar = can('pedidos_material', 'edit');
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Configurações de Pedidos" eyebrow="Pedidos"
          description="Materiais que os líderes podem pedir, teto mensal de cada posto, valores da alçada e quem aprova." />
        {!podeEditar && <p className="text-sm text-muted-foreground">Você só pode consultar. Para alterar, precisa da permissão "editar" em Pedidos de Material.</p>}
        <Tabs defaultValue="materiais">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="materiais">Materiais</TabsTrigger>
            <TabsTrigger value="tetos">Teto por posto</TabsTrigger>
            <TabsTrigger value="alcada">Alçada</TabsTrigger>
            <TabsTrigger value="aprovadores">Aprovadores</TabsTrigger>
            <TabsTrigger value="avisos">Avisos por e-mail</TabsTrigger>
          </TabsList>
          <TabsContent value="materiais" className="mt-4"><Materiais podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="tetos" className="mt-4"><Tetos podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="alcada" className="mt-4"><Alcada podeEditar={podeEditar} /></TabsContent>
          <TabsContent value="aprovadores" className="mt-4"><Aprovadores podeEditar={podeEditar} /></TabsContent>
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

// ---------- Materiais ----------

function Materiais({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Material[]>([]);
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<{ id?: string; nome: string; unidade: string; categoria: string; preco: string; ativo: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => listMateriais().then(setLista).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    if (!edit?.nome.trim()) return toast.error('Informe o nome.');
    const preco = paraNumero(edit.preco);
    if (preco != null && !(preco >= 0)) return toast.error('Preço de referência inválido.');
    setSalvando(true);
    try {
      await salvarMaterial({ id: edit.id, nome: edit.nome, unidade: edit.unidade, categoria: edit.categoria, preco_referencia: preco, ativo: edit.ativo });
      toast.success('Material salvo.');
      setEdit(null);
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const termo = busca.trim().toLowerCase();
  const filtrada = lista.filter(m => !termo || m.nome.toLowerCase().includes(termo) || (m.categoria ?? '').toLowerCase().includes(termo));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Catálogo de materiais</CardTitle>
        <CardDescription>O preço de referência só é usado enquanto o material não tem nenhuma compra registrada; depois vale o preço da última nota.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar material" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
          {podeEditar && <Button className="gap-2" onClick={() => setEdit({ nome: '', unidade: 'un', categoria: '', preco: '', ativo: true })}><Plus className="h-4 w-4" /> Novo material</Button>}
        </div>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-6 items-end rounded-md border p-3">
            <div className="sm:col-span-2"><Label>Nome *</Label><Input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} placeholder="Ex.: Vassoura de pelo" /></div>
            <div><Label>Unidade</Label><Input value={edit.unidade} onChange={e => setEdit({ ...edit, unidade: e.target.value })} placeholder="un, fardo, litro" /></div>
            <div><Label>Categoria</Label><Input value={edit.categoria} onChange={e => setEdit({ ...edit, categoria: e.target.value })} placeholder="Limpeza" /></div>
            <div><Label>Preço ref. (R$)</Label><Input inputMode="decimal" value={edit.preco} onChange={e => setEdit({ ...edit, preco: e.target.value })} /></div>
            <div className="flex items-center gap-2 pb-2"><Switch checked={edit.ativo} onCheckedChange={v => setEdit({ ...edit, ativo: v })} id="ativo" /><Label htmlFor="ativo">Ativo</Label></div>
            <div className="sm:col-span-6 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
            </div>
          </div>
        )}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Material</TableHead><TableHead>Unidade</TableHead><TableHead>Categoria</TableHead>
            <TableHead className="text-right">Preço ref.</TableHead><TableHead>Situação</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {filtrada.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum material cadastrado.</TableCell></TableRow>}
            {filtrada.map(m => (
              <TableRow key={m.id} className={m.ativo ? '' : 'opacity-60'}>
                <TableCell>{m.nome}</TableCell><TableCell>{m.unidade}</TableCell><TableCell>{m.categoria ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(m.preco_referencia)}</TableCell>
                <TableCell>{m.ativo ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  {podeEditar && <Button variant="ghost" size="icon" aria-label={`Editar ${m.nome}`} onClick={() => setEdit({
                    id: m.id, nome: m.nome, unidade: m.unidade, categoria: m.categoria ?? '',
                    preco: m.preco_referencia == null ? '' : String(m.preco_referencia).replace('.', ','), ativo: m.ativo,
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
      setValores(x => { const n = { ...x }; delete n[posto.id]; return n; });
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

// ---------- Alçada ----------

function Alcada({ podeEditar }: { podeEditar: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    listAlcadas().then(l => {
      setValores(Object.fromEntries(l.map(a => [a.nivel, a.valor_acima_de == null ? '' : String(a.valor_acima_de).replace('.', ',')])));
      setCarregado(true);
    }).catch(e => toast.error(e.message));
  }, []);

  const salvar = async () => {
    setSalvando(true);
    try {
      for (const n of NIVEIS) {
        const v = paraNumero(valores[n.valor] ?? '');
        if (v != null && !(v >= 0)) throw new Error(`Valor inválido em ${n.rotulo}.`);
        await salvarAlcada(n.valor, v);
      }
      toast.success('Alçada salva. Vale para os próximos pedidos e para as próximas aprovações.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Alçada por valor</CardTitle>
        <CardDescription>
          O pedido passa pelos níveis em ordem. Cada nível só entra quando o total do pedido passa do valor dele (em branco = sempre).
          Pedido acima do teto do posto sempre passa pelo diretor e exige justificativa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!carregado ? <Loader2 className="h-5 w-5 animate-spin" /> : NIVEIS.map((n, i) => (
          <div key={n.valor} className="flex flex-wrap items-center gap-3">
            <span className="w-32 font-medium">{i + 1}. {n.rotulo}</span>
            <span className="text-sm text-muted-foreground">entra quando o pedido passa de R$</span>
            <Input className="w-40" inputMode="decimal" disabled={!podeEditar} placeholder="sempre" value={valores[n.valor] ?? ''}
              onChange={e => setValores(x => ({ ...x, [n.valor]: e.target.value.replace(/[^\d.,]/g, '') }))} />
          </div>
        ))}
        {podeEditar && <Button onClick={salvar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar alçada</Button>}
      </CardContent>
    </Card>
  );
}

// ---------- Aprovadores ----------

function Aprovadores({ podeEditar }: { podeEditar: boolean }) {
  const { estados } = useAuth();
  const [lista, setLista] = useState<Aprovador[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string | null }[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);
  const [novo, setNovo] = useState<{ user_id: string; nivel: Nivel | ''; uf: string; postos: string[] }>({ user_id: '', nivel: '', uf: estados[0] ?? '', postos: [] });
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => Promise.all([listAprovadores(), listUsuarios(), listPostos()])
    .then(([a, u, p]) => { setLista(a); setUsuarios(u); setPostos(p.filter(x => x.ativo)); }).catch(e => toast.error(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  const nomeUsuario = (id: string) => usuarios.find(u => u.id === id)?.nome ?? '(usuário removido)';
  const postosDoEstado = useMemo(() => postos.filter(p => p.uf === novo.uf), [postos, novo.uf]);

  const adicionar = async () => {
    if (!novo.user_id || !novo.nivel || !novo.uf) return toast.error('Escolha usuário, nível e estado.');
    setSalvando(true);
    try {
      await salvarAprovador({ user_id: novo.user_id, nivel: novo.nivel, uf: novo.uf, postos: novo.postos });
      toast.success('Aprovador salvo.');
      setNovo(n => ({ ...n, user_id: '', postos: [] }));
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const remover = async (id: string) => {
    if (!window.confirm('Tirar este aprovador?')) return;
    try { await excluirAprovador(id); await carregar(); } catch (e) { toast.error((e as Error).message); }
  };

  const ordenada = [...lista].sort((a, b) => a.uf.localeCompare(b.uf)
    || NIVEIS.findIndex(n => n.valor === a.nivel) - NIVEIS.findIndex(n => n.valor === b.nivel)
    || nomeUsuario(a.user_id).localeCompare(nomeUsuario(b.user_id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Quem aprova</CardTitle>
        <CardDescription>
          Cada usuário aprova um nível em um estado — em todos os postos do estado ou só nos postos marcados.
          O mesmo usuário pode ter mais de um nível. Compras também registra as notas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeEditar && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Usuário</Label>
                <Select value={novo.user_id || undefined} onValueChange={v => setNovo(n => ({ ...n, user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nível</Label>
                <Select value={novo.nivel || undefined} onValueChange={v => setNovo(n => ({ ...n, nivel: v as Nivel }))}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>{NIVEIS.map(n => <SelectItem key={n.valor} value={n.valor}>{n.rotulo}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <EstadoSelect value={novo.uf} onChange={uf => setNovo(n => ({ ...n, uf, postos: [] }))} />
              </div>
            </div>
            <div>
              <Label>Postos ({novo.postos.length === 0 ? 'todos do estado' : `${novo.postos.length} marcados`})</Label>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {postosDoEstado.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={novo.postos.includes(p.id)}
                      onCheckedChange={v => setNovo(n => ({ ...n, postos: v ? [...n.postos, p.id] : n.postos.filter(x => x !== p.id) }))} />
                    <span className="truncate">{p.nome}</span>
                  </label>
                ))}
                {postosDoEstado.length === 0 && <p className="text-sm text-muted-foreground">Nenhum posto neste estado.</p>}
              </div>
            </div>
            <Button onClick={adicionar} disabled={salvando} className="gap-2">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar aprovador</Button>
          </div>
        )}
        <Table>
          <TableHeader><TableRow>
            <TableHead>Estado</TableHead><TableHead>Nível</TableHead><TableHead>Usuário</TableHead><TableHead>Postos</TableHead><TableHead className="w-10" />
          </TableRow></TableHeader>
          <TableBody>
            {ordenada.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum aprovador cadastrado: sem isso os pedidos ficam parados (só o administrador aprova).</TableCell></TableRow>}
            {ordenada.map(a => (
              <TableRow key={a.id}>
                <TableCell>{a.uf}</TableCell>
                <TableCell>{rotuloNivel(a.nivel)}</TableCell>
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

function Avisos({ podeEditar }: { podeEditar: boolean }) {
  const [ligado, setLigado] = useState(true);
  const [link, setLink] = useState('');
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    lerConfigAvisos().then(c => {
      setLigado(c.avisar_email);
      setLink(c.link_sistema ?? '');
      setCarregado(true);
    }).catch(e => toast.error(e.message));
  }, []);

  const salvar = async () => {
    if (link.trim() && !/^https?:\/\/\S+$/.test(link.trim())) return toast.error('O link precisa começar com http:// ou https://');
    setSalvando(true);
    try {
      await salvarConfigAvisos({ avisar_email: ligado, link_sistema: link });
      toast.success('Avisos salvos.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const testar = async () => {
    setEnviando(true);
    try {
      const r = await avisarAgora();
      if (!r.enviado) toast.info(r.motivo ?? 'Nada para avisar agora.');
      else toast.success(`${r.emails} e-mail(s) enviado(s), ${r.pedidos} pedido(s) avisado(s).`);
      if (r.sem_aprovador?.length) toast.warning(`Sem aprovador com e-mail para: ${r.sem_aprovador.map(n => `PM-${String(n).padStart(6, '0')}`).join(', ')}`);
      if (r.falhas?.length) toast.error(`Falhou: ${r.falhas.join('; ')}`);
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Avisos por e-mail aos aprovadores</CardTitle>
        <CardDescription>
          Quando um pedido chega ao nível de alguém, essa pessoa recebe um e-mail (um só, com todos os pedidos novos dela).
          Sai pela conta Microsoft conectada em Configurações &gt; E-mail, a cada 5 minutos, depois de rodar
          <code className="mx-1">configurar-email.sh</code> na VM. O e-mail usado é o do cadastro do usuário.
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
