import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, ClipboardList, Loader2, LogOut, Plus, Repeat, ShoppingCart, Trash2, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { cpfValido, formatarCpf, formatarTelefone, matriculaValida, soDigitos } from '@/modules/crachas/lib/solicitacaoService';
import {
  FREQUENCIAS, cancelarPedidoPublico, dataBr, enviarPedido, formatarNumero, identificar, numeroPedido,
  rotuloFrequencia, rotuloNivel, statusComNivel,
  type Frequencia, type Identificado, type PedidoDoSolicitante, type Solicitante,
} from '../lib/pedidosService';

/**
 * Link público do pedido de material (igual à solicitação de crachá): o líder
 * se identifica com a matrícula ou o CPF, escolhe o posto e os materiais. Os
 * pedidos dele ficam salvos e aparecem em "Meus pedidos" com o andamento.
 */

const LEMBRAR = 'pedido-material-solicitante';
const lembrado = (): { matricula?: string; telefone?: string } => {
  try { return JSON.parse(localStorage.getItem(LEMBRAR) || '{}'); } catch { return {}; }
};
const lembrar = (dados: { matricula?: string; telefone?: string }) => {
  try { localStorage.setItem(LEMBRAR, JSON.stringify({ ...lembrado(), ...dados })); } catch { /* sem armazenamento */ }
};

const COR_STATUS: Record<string, string> = {
  em_aprovacao: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  aprovado: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  comprado: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  reprovado: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  cancelado: 'bg-muted text-muted-foreground',
};

interface Linha { material_id: string; quantidade: string }

const PedidoMaterialPublico = () => {
  const [identificarPor, setIdentificarPor] = useState<'matricula' | 'cpf'>('matricula');
  const [solMatricula, setSolMatricula] = useState(lembrado().matricula ?? '');
  const [solCpf, setSolCpf] = useState('');
  const [quem, setQuem] = useState<Solicitante | null>(null);
  const [dados, setDados] = useState<Identificado | null>(null);

  const [aba, setAba] = useState('novo');
  const [postoId, setPostoId] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ material_id: '', quantidade: '' }]);
  const [frequencia, setFrequencia] = useState<Frequencia>('unica');
  const [observacao, setObservacao] = useState('');
  const [telefone, setTelefone] = useState(lembrado().telefone ?? '');
  const [enviado, setEnviado] = useState<{ numero: number; recorrente: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);

  const tentar = async (acao: () => Promise<void>) => {
    setCarregando(true);
    try { await acao(); } catch (e) { toast.error((e as Error).message || 'Algo deu errado. Tente de novo.'); }
    finally { setCarregando(false); }
  };

  const materiais = useMemo(() => dados?.materiais ?? [], [dados]);
  const unidade = (id: string) => materiais.find(m => m.id === id)?.unidade ?? '';

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    let s: Solicitante;
    if (identificarPor === 'matricula') {
      const matricula = matriculaValida(solMatricula);
      if (!matricula) return toast.error('Informe a sua matrícula (só números).');
      s = { matricula };
    } else {
      if (!cpfValido(solCpf)) return toast.error('CPF inválido.');
      s = { cpf: solCpf };
    }
    tentar(async () => {
      const r = await identificar(s);
      setQuem(s);
      setDados(r);
      setPostoId(r.posto_sugerido ?? (r.postos.length === 1 ? r.postos[0].id : ''));
      if (s.matricula) lembrar({ matricula: String(s.matricula) });
    });
  };

  const recarregar = async () => { if (quem) setDados(await identificar(quem)); };

  const limparPedido = () => {
    setLinhas([{ material_id: '', quantidade: '' }]);
    setFrequencia('unica');
    setObservacao('');
  };

  const sair = () => { setQuem(null); setDados(null); setSolCpf(''); setEnviado(null); limparPedido(); setAba('novo'); };

  const mudarLinha = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quem) return;
    if (!postoId) return toast.error('Escolha o posto.');
    const itens = linhas.filter(l => l.material_id || l.quantidade);
    if (itens.length === 0) return toast.error('Adicione pelo menos um material.');
    const convertidos: { material_id: string; quantidade: number }[] = [];
    for (const l of itens) {
      const q = Number(l.quantidade.replace(',', '.'));
      if (!l.material_id) return toast.error('Escolha o material de todas as linhas.');
      if (!(q > 0) || !/^\d+([.,]\d{1,2})?$/.test(l.quantidade)) return toast.error('Quantidade inválida.');
      convertidos.push({ material_id: l.material_id, quantidade: q });
    }
    const tel = soDigitos(telefone);
    if (tel.length < 10) return toast.error('Informe o seu telefone com DDD.');
    tentar(async () => {
      const r = await enviarPedido(quem, { telefone, postoId, itens: convertidos, observacao, frequencia });
      lembrar({ telefone: tel });
      setEnviado({ numero: r.numero, recorrente: r.recorrente });
      limparPedido();
      await recarregar();
    });
  };

  const cancelar = (alvo: { pedidoId?: string; recorrenciaId?: string }, texto: string) => {
    if (!quem || !window.confirm(texto)) return;
    tentar(async () => {
      await cancelarPedidoPublico(quem, alvo);
      await recarregar();
      toast.success(alvo.pedidoId ? 'Pedido cancelado.' : 'Pedido recorrente encerrado.');
    });
  };

  const categorias = useMemo(() => {
    const grupos = new Map<string, typeof materiais>();
    for (const m of materiais) {
      const c = m.categoria || 'Outros';
      if (!grupos.has(c)) grupos.set(c, []);
      grupos.get(c)!.push(m);
    }
    return [...grupos.entries()];
  }, [materiais]);

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" /> Pedido de material
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identifique-se para pedir material para o seu posto e acompanhar os seus pedidos.
          </p>
        </div>

        {!quem || !dados ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quem está pedindo</CardTitle>
              <CardDescription>Informe a <strong>sua</strong> matrícula ou o <strong>seu</strong> CPF.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={entrar} className="space-y-3">
                <div className="inline-flex rounded-md border p-0.5 text-sm">
                  {(['matricula', 'cpf'] as const).map(op => (
                    <button key={op} type="button" onClick={() => setIdentificarPor(op)}
                      className={`px-3 py-1 rounded ${identificarPor === op ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {op === 'matricula' ? 'Matrícula' : 'CPF'}
                    </button>
                  ))}
                </div>
                {identificarPor === 'matricula' ? (
                  <div>
                    <Label htmlFor="sol-mat">Sua matrícula</Label>
                    <Input id="sol-mat" inputMode="numeric" autoComplete="off" value={solMatricula}
                      onChange={e => setSolMatricula(soDigitos(e.target.value).slice(0, 9))} />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="sol-cpf">Seu CPF</Label>
                    <Input id="sol-cpf" inputMode="numeric" autoComplete="off" value={formatarCpf(solCpf)}
                      onChange={e => setSolCpf(soDigitos(e.target.value))} placeholder="000.000.000-00" />
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={carregando}>
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  Continuar
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Solicitante</p>
                <p className="font-medium truncate">{dados.nome}</p>
                <p className="text-xs text-muted-foreground truncate">{dados.cargo}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={sair} className="gap-1 shrink-0">
                <LogOut className="h-4 w-4" /> Sair
              </Button>
            </div>

            <Tabs value={aba} onValueChange={v => { setAba(v); setEnviado(null); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="novo" className="gap-1"><Plus className="h-4 w-4" /> Novo pedido</TabsTrigger>
                <TabsTrigger value="meus" className="gap-1">
                  <ClipboardList className="h-4 w-4" /> Meus pedidos{dados.pedidos.length ? ` (${dados.pedidos.length})` : ''}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="novo" className="mt-4">
                {enviado ? (
                  <Card>
                    <CardContent className="pt-8 pb-6 text-center space-y-3">
                      <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
                      <h2 className="text-xl font-semibold">Pedido {numeroPedido(enviado.numero)} enviado!</h2>
                      <p className="text-muted-foreground">
                        Ele foi para a aprovação do supervisor.
                        {enviado.recorrente && ' Como é recorrente, o próximo pedido será criado automaticamente na data certa.'}
                        {' '}Acompanhe em "Meus pedidos".
                      </p>
                      <div className="flex justify-center gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => { setEnviado(null); setAba('meus'); }}>Ver meus pedidos</Button>
                        <Button onClick={() => setEnviado(null)}>Fazer outro pedido</Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <form onSubmit={enviar} className="space-y-4">
                        <div>
                          <Label>Posto *</Label>
                          <Select value={postoId || undefined} onValueChange={setPostoId}>
                            <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                            <SelectContent>
                              {dados.postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {dados.postos.length === 0 && (
                            <p className="text-xs text-destructive mt-1">Nenhum posto cadastrado para o seu estado. Fale com o seu supervisor.</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Materiais *</Label>
                          {materiais.length === 0 && (
                            <p className="text-sm text-muted-foreground">O catálogo de materiais ainda está vazio. Fale com o seu supervisor.</p>
                          )}
                          {linhas.map((l, i) => (
                            <div key={i} className="flex gap-2 items-start">
                              <div className="flex-1 min-w-0">
                                <Select value={l.material_id || undefined} onValueChange={v => mudarLinha(i, 'material_id', v)}>
                                  <SelectTrigger aria-label={`Material ${i + 1}`}><SelectValue placeholder="Material" /></SelectTrigger>
                                  <SelectContent>
                                    {categorias.map(([cat, itens]) => (
                                      <SelectGroup key={cat}>
                                        {categorias.length > 1 && <SelectLabel className="text-xs text-muted-foreground">{cat}</SelectLabel>}
                                        {itens.map(m => (
                                          <SelectItem key={m.id} value={m.id}
                                            disabled={linhas.some((o, j) => j !== i && o.material_id === m.id)}>
                                            {m.nome} ({m.unidade})
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="w-28 shrink-0">
                                <Input inputMode="decimal" aria-label={`Quantidade ${i + 1}`} placeholder="Qtd."
                                  value={l.quantidade} onChange={e => mudarLinha(i, 'quantidade', e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} />
                                {l.material_id && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{unidade(l.material_id)}</p>}
                              </div>
                              <Button type="button" variant="ghost" size="icon" aria-label="Remover linha"
                                disabled={linhas.length === 1} onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" className="gap-1"
                            disabled={linhas.length >= 50} onClick={() => setLinhas(ls => [...ls, { material_id: '', quantidade: '' }])}>
                            <Plus className="h-4 w-4" /> Adicionar material
                          </Button>
                        </div>

                        <div>
                          <Label>Com que frequência?</Label>
                          <Select value={frequencia} onValueChange={v => setFrequencia(v as Frequencia)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FREQUENCIAS.map(f => <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {frequencia !== 'unica' && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Este pedido é feito hoje e repetido {rotuloFrequencia(frequencia).toLowerCase()}, sempre passando pela aprovação.
                              Você pode encerrar a repetição em "Meus pedidos".
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="obs">Observação</Label>
                          <Textarea id="obs" rows={2} maxLength={1000} value={observacao} onChange={e => setObservacao(e.target.value)}
                            placeholder="Ex.: material acabou, evento no posto..." />
                        </div>

                        <div>
                          <Label htmlFor="tel">Seu telefone *</Label>
                          <Input id="tel" inputMode="tel" value={formatarTelefone(telefone)} onChange={e => setTelefone(soDigitos(e.target.value))}
                            placeholder="(61) 99999-9999" />
                        </div>

                        <Button type="submit" size="lg" className="w-full gap-2" disabled={carregando || materiais.length === 0}>
                          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                          {carregando ? 'Enviando...' : 'Enviar pedido'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="meus" className="mt-4 space-y-3">
                {dados.recorrencias.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4" /> Pedidos que se repetem</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dados.recorrencias.map(r => (
                        <div key={r.id} className="rounded-md border p-3 text-sm flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{rotuloFrequencia(r.frequencia)} · {r.posto}</p>
                            <p className="text-muted-foreground">
                              {(r.itens ?? []).map(i => `${formatarNumero(i.quantidade)} ${i.unidade} ${i.nome}`).join(', ')}
                            </p>
                            <p className="text-xs text-muted-foreground">Próximo: {dataBr(r.proxima_data)}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 gap-1" disabled={carregando}
                            onClick={() => cancelar({ recorrenciaId: r.id }, 'Parar de repetir este pedido?')}>
                            <X className="h-4 w-4" /> Encerrar
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {dados.pedidos.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Você ainda não fez nenhum pedido.</p>
                )}
                {dados.pedidos.map(p => <CartaoPedido key={p.id} p={p} carregando={carregando}
                  onCancelar={() => cancelar({ pedidoId: p.id }, `Cancelar o pedido ${numeroPedido(p.numero)}?`)} />)}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

function CartaoPedido({ p, carregando, onCancelar }: { p: PedidoDoSolicitante; carregando: boolean; onCancelar: () => void }) {
  const reprovacao = p.andamento?.find(a => a.decisao === 'reprovado');
  return (
    <Card>
      <CardContent className="p-4 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{numeroPedido(p.numero)} {p.recorrente && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" aria-label="recorrente" />}</p>
            <p className="text-xs text-muted-foreground">{p.posto} · {dataBr(p.data_pedido)}</p>
          </div>
          <Badge className={`${COR_STATUS[p.status] ?? ''} border-0 text-right`}>{statusComNivel(p.status, p.nivel_atual)}</Badge>
        </div>
        <ul className="text-muted-foreground">
          {(p.itens ?? []).map(i => (
            <li key={i.nome}>
              {formatarNumero(i.quantidade)} {i.unidade} · {i.nome}
              {i.quantidade !== i.quantidade_pedida && <span className="text-xs"> (pedido: {formatarNumero(i.quantidade_pedida)})</span>}
            </li>
          ))}
        </ul>
        {(p.andamento?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            {p.andamento!.map(a => `${rotuloNivel(a.nivel)}: ${a.decisao} em ${dataBr(a.em)}`).join(' → ')}
          </p>
        )}
        {reprovacao?.comentario && <p className="text-xs text-destructive">Motivo: {reprovacao.comentario}</p>}
        {p.status === 'em_aprovacao' && (
          <Button variant="outline" size="sm" className="gap-1" disabled={carregando} onClick={onCancelar}>
            <X className="h-4 w-4" /> Cancelar pedido
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default PedidoMaterialPublico;
