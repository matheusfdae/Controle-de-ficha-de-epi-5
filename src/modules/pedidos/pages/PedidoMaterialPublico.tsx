import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, ClipboardList, Loader2, LogOut, Pencil, Plus, Repeat, Send, ShoppingCart, Trash2, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { cpfValido, formatarCpf, formatarTelefone, matriculaValida, soDigitos } from '@/modules/crachas/lib/solicitacaoService';
import {
  FREQUENCIAS, STATUS_PEDIDO, cancelarPedidoPublico, catalogoDoPosto, dataBr, enviarPedido, formatarNumero, identificar,
  nomePublico, reenviarPedido, rotuloFrequencia,
  type Frequencia, type Identificado, type MaterialPublico, type PedidoDoSolicitante, type Solicitante,
} from '../lib/pedidosService';

/**
 * Link público do pedido de material (igual à solicitação de crachá): o
 * encarregado se identifica com a matrícula ou o CPF, escolhe o posto e os
 * itens. Em "Meus pedidos" ele acompanha o andamento e corrige o pedido que o
 * supervisor devolver.
 */

const LEMBRAR = 'pedido-material-solicitante';
const lembrado = (): { matricula?: string; telefone?: string } => {
  try { return JSON.parse(localStorage.getItem(LEMBRAR) || '{}'); } catch { return {}; }
};
const lembrar = (dados: { matricula?: string; telefone?: string }) => {
  try { localStorage.setItem(LEMBRAR, JSON.stringify({ ...lembrado(), ...dados })); } catch { /* sem armazenamento */ }
};

const COR_STATUS: Record<string, string> = {
  enviada: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  devolvida: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  em_orcamento: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  aguardando_aprovacao: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  a_faturar: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  faturada: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  reprovada: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  cancelada: 'bg-muted text-muted-foreground',
};
// O encarregado não precisa saber de teto: aprovação do excesso aparece como "em análise".
const STATUS_ENCARREGADO: Record<string, string> = {
  ...STATUS_PEDIDO, enviada: 'Com o supervisor', em_orcamento: 'Em análise (compras)', aguardando_aprovacao: 'Em análise (compras)',
  a_faturar: 'Aprovado — em compra', faturada: 'Comprado', devolvida: 'Devolvido para você corrigir',
};

interface Linha { material_id: string; quantidade: string }
const linhaVazia = (): Linha => ({ material_id: '', quantidade: '' });

/** Linhas de itens (posto + materiais) usadas no pedido novo e na correção do devolvido. */
function ListaItens({ linhas, setLinhas, catalogo }: {
  linhas: Linha[]; setLinhas: (f: (ls: Linha[]) => Linha[]) => void; catalogo: MaterialPublico[];
}) {
  const grupos = useMemo(() => {
    const g = new Map<string, MaterialPublico[]>();
    for (const m of catalogo) {
      const c = m.categoria || 'Outros';
      if (!g.has(c)) g.set(c, []);
      g.get(c)!.push(m);
    }
    return [...g.entries()];
  }, [catalogo]);
  const unidade = (id: string) => catalogo.find(m => m.id === id)?.unidade ?? '';
  const mudar = (i: number, campo: keyof Linha, valor: string) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  return (
    <div className="space-y-2">
      {catalogo.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item liberado para este posto. Fale com o seu supervisor.</p>}
      {linhas.map((l, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <Select value={l.material_id || undefined} onValueChange={v => mudar(i, 'material_id', v)}>
              <SelectTrigger aria-label={`Item ${i + 1}`}><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>
                {grupos.map(([cat, itens]) => (
                  <SelectGroup key={cat}>
                    {grupos.length > 1 && <SelectLabel className="text-xs text-muted-foreground">{cat}</SelectLabel>}
                    {itens.map(m => (
                      <SelectItem key={m.id} value={m.id} disabled={linhas.some((o, j) => j !== i && o.material_id === m.id)}>
                        {nomePublico(m)} ({m.unidade})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 shrink-0">
            <Input inputMode="decimal" aria-label={`Quantidade ${i + 1}`} placeholder="Qtd."
              value={l.quantidade} onChange={e => mudar(i, 'quantidade', e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} />
            {l.material_id && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{unidade(l.material_id)}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Remover linha"
            disabled={linhas.length === 1} onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1"
        disabled={linhas.length >= 50 || catalogo.length === 0} onClick={() => setLinhas(ls => [...ls, linhaVazia()])}>
        <Plus className="h-4 w-4" /> Adicionar item
      </Button>
    </div>
  );
}

/** Converte as linhas; devolve a mensagem de erro em vez dos itens quando algo não confere. */
function converter(linhas: Linha[], catalogo: MaterialPublico[]): { material_id: string; quantidade: number }[] | string {
  const preenchidas = linhas.filter(l => l.material_id || l.quantidade);
  if (preenchidas.length === 0) return 'Adicione pelo menos um item.';
  const itens: { material_id: string; quantidade: number }[] = [];
  for (const l of preenchidas) {
    if (!l.material_id) return 'Escolha o item de todas as linhas.';
    if (!catalogo.some(m => m.id === l.material_id)) return 'Há item que não está liberado para este posto.';
    if (!/^\d+([.,]\d{1,2})?$/.test(l.quantidade) || !(Number(l.quantidade.replace(',', '.')) > 0)) return 'Quantidade inválida.';
    itens.push({ material_id: l.material_id, quantidade: Number(l.quantidade.replace(',', '.')) });
  }
  return itens;
}

const PedidoMaterialPublico = () => {
  const [identificarPor, setIdentificarPor] = useState<'matricula' | 'cpf'>('matricula');
  const [solMatricula, setSolMatricula] = useState(lembrado().matricula ?? '');
  const [solCpf, setSolCpf] = useState('');
  const [quem, setQuem] = useState<Solicitante | null>(null);
  const [dados, setDados] = useState<Identificado | null>(null);

  const [aba, setAba] = useState('novo');
  const [postoId, setPostoId] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [frequencia, setFrequencia] = useState<Frequencia>('unica');
  const [observacao, setObservacao] = useState('');
  const [telefone, setTelefone] = useState(lembrado().telefone ?? '');
  const [enviado, setEnviado] = useState<{ codigo: string; recorrente: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);

  const tentar = async (acao: () => Promise<void>) => {
    setCarregando(true);
    try { await acao(); } catch (e) { toast.error((e as Error).message || 'Algo deu errado. Tente de novo.'); }
    finally { setCarregando(false); }
  };

  const catalogo = useMemo(() => catalogoDoPosto(dados?.materiais ?? [], dados?.postos.find(p => p.id === postoId)), [dados, postoId]);

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
      if (r.pedidos.some(p => p.status === 'devolvida')) setAba('meus');
    });
  };

  const recarregar = async () => { if (quem) setDados(await identificar(quem)); };

  const sair = () => {
    setQuem(null); setDados(null); setSolCpf(''); setEnviado(null);
    setLinhas([linhaVazia()]); setFrequencia('unica'); setObservacao(''); setAba('novo');
  };

  const trocarPosto = (id: string) => {
    setPostoId(id);
    // Itens que o posto novo não tem saem da lista.
    const novo = catalogoDoPosto(dados?.materiais ?? [], dados?.postos.find(p => p.id === id));
    setLinhas(ls => { const f = ls.filter(l => !l.material_id || novo.some(m => m.id === l.material_id)); return f.length ? f : [linhaVazia()]; });
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quem) return;
    if (!postoId) return toast.error('Escolha o posto.');
    const itens = converter(linhas, catalogo);
    if (typeof itens === 'string') return toast.error(itens);
    const tel = soDigitos(telefone);
    if (tel.length < 10) return toast.error('Informe o seu telefone com DDD.');
    tentar(async () => {
      const r = await enviarPedido(quem, { telefone, postoId, itens, observacao, frequencia });
      lembrar({ telefone: tel });
      setEnviado({ codigo: r.codigo, recorrente: r.recorrente });
      setLinhas([linhaVazia()]); setFrequencia('unica'); setObservacao('');
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

  const reenviar = (p: PedidoDoSolicitante, novas: Linha[], obs: string) => {
    if (!quem || !dados) return false;
    const itens = converter(novas, catalogoDoPosto(dados.materiais, dados.postos.find(x => x.id === p.posto_id)));
    if (typeof itens === 'string') { toast.error(itens); return false; }
    tentar(async () => {
      await reenviarPedido(quem, p.id, itens, obs);
      await recarregar();
      toast.success(`Pedido ${p.codigo} reenviado ao supervisor.`);
    });
    return true;
  };

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
                      <h2 className="text-xl font-semibold">Pedido {enviado.codigo} enviado!</h2>
                      <p className="text-muted-foreground">
                        Ele foi para a conferência do supervisor.
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
                          <Select value={postoId || undefined} onValueChange={trocarPosto}>
                            <SelectTrigger><SelectValue placeholder="Selecione o posto" /></SelectTrigger>
                            <SelectContent>
                              {dados.postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {dados.postos.length === 0 && (
                            <p className="text-xs text-destructive mt-1">Nenhum posto cadastrado para o seu estado. Fale com o seu supervisor.</p>
                          )}
                        </div>

                        {postoId && (
                          <div>
                            <Label>Itens *</Label>
                            <ListaItens linhas={linhas} setLinhas={setLinhas} catalogo={catalogo} />
                          </div>
                        )}

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
                              Este pedido é feito hoje e repetido {rotuloFrequencia(frequencia).toLowerCase()}, sempre passando pela conferência.
                              Você pode encerrar a repetição em "Meus pedidos".
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="obs">Observação / justificativa</Label>
                          <Textarea id="obs" rows={2} maxLength={1000} value={observacao} onChange={e => setObservacao(e.target.value)}
                            placeholder="Ex.: material acabou, evento no posto..." />
                        </div>

                        <div>
                          <Label htmlFor="tel">Seu telefone *</Label>
                          <Input id="tel" inputMode="tel" value={formatarTelefone(telefone)} onChange={e => setTelefone(soDigitos(e.target.value))}
                            placeholder="(61) 99999-9999" />
                        </div>

                        <Button type="submit" size="lg" className="w-full gap-2" disabled={carregando || !postoId || catalogo.length === 0}>
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
                {dados.pedidos.map(p => (
                  <CartaoPedido key={p.id} p={p} carregando={carregando}
                    catalogo={catalogoDoPosto(dados.materiais, dados.postos.find(x => x.id === p.posto_id))}
                    onCancelar={() => cancelar({ pedidoId: p.id }, `Cancelar o pedido ${p.codigo}?`)}
                    onReenviar={(ls, obs) => reenviar(p, ls, obs)} />
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

function CartaoPedido({ p, carregando, catalogo, onCancelar, onReenviar }: {
  p: PedidoDoSolicitante; carregando: boolean; catalogo: MaterialPublico[];
  onCancelar: () => void; onReenviar: (linhas: Linha[], observacao: string) => boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [obs, setObs] = useState('');
  const motivo = [...(p.historico ?? [])].reverse().find(h => h.comentario && ['devolvida', 'reprovada', 'cancelada'].includes(h.status));

  const corrigir = () => {
    setLinhas((p.itens ?? []).map(i => ({ material_id: i.material_id, quantidade: String(i.quantidade).replace('.', ',') })));
    setObs('');
    setEditando(true);
  };

  return (
    <Card className={p.status === 'devolvida' ? 'border-orange-400' : ''}>
      <CardContent className="p-4 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{p.codigo} {p.recorrente && <Repeat className="inline h-3.5 w-3.5 text-muted-foreground" aria-label="recorrente" />}</p>
            <p className="text-xs text-muted-foreground">{p.posto} · {dataBr(p.data_pedido)}</p>
          </div>
          <Badge className={`${COR_STATUS[p.status] ?? ''} border-0 text-right`}>{STATUS_ENCARREGADO[p.status] ?? p.status}</Badge>
        </div>
        {!editando && (
          <ul className="text-muted-foreground">
            {(p.itens ?? []).map(i => (
              <li key={i.material_id}>
                {formatarNumero(i.quantidade)} {i.unidade} · {i.nome}
                {i.quantidade !== i.quantidade_pedida && <span className="text-xs"> (pedido: {formatarNumero(i.quantidade_pedida)})</span>}
              </li>
            ))}
          </ul>
        )}
        {motivo?.comentario && (
          <p className={`text-xs ${p.status === 'devolvida' ? 'text-orange-700 dark:text-orange-400' : 'text-destructive'}`}>
            {p.status === 'devolvida' ? 'O supervisor pediu: ' : 'Motivo: '}{motivo.comentario}
          </p>
        )}
        {editando ? (
          <div className="space-y-3 rounded-md border p-3">
            <ListaItens linhas={linhas} setLinhas={setLinhas} catalogo={catalogo} />
            <Textarea rows={2} maxLength={1000} placeholder="O que você corrigiu (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setEditando(false)}>Voltar</Button>
              <Button size="sm" className="gap-1" disabled={carregando} onClick={() => { if (onReenviar(linhas, obs)) setEditando(false); }}>
                <Send className="h-4 w-4" /> Reenviar ao supervisor
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.status === 'devolvida' && (
              <Button size="sm" className="gap-1" disabled={carregando} onClick={corrigir}><Pencil className="h-4 w-4" /> Corrigir e reenviar</Button>
            )}
            {['enviada', 'devolvida'].includes(p.status) && (
              <Button variant="outline" size="sm" className="gap-1" disabled={carregando} onClick={onCancelar}>
                <X className="h-4 w-4" /> Cancelar pedido
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PedidoMaterialPublico;
