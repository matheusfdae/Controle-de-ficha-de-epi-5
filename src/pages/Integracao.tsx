import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSignature, Loader2, Mail, Save, Search, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect, { TODOS_ESTADOS, useEstadoLembrado } from '@/components/EstadoSelect';
import GerarFichasAdmissaoDialog, { PessoaAdmissao } from '@/components/GerarFichasAdmissaoDialog';
import EnviarIntegracaoDialog from '@/components/EnviarIntegracaoDialog';
import type { PessoaIntegracao } from '../../supabase/functions/_shared/emailIntegracao';
import { useConfirm } from '@/hooks/use-confirm';
import { EPI, Funcao, listEpis, listFuncoes } from '@/services/estoqueService';
import { getFichas } from '@/services/fichaService';
import { mapaTamanhos } from '@/services/entradaEstoqueService';
import { listPostos, Posto } from '@/services/postosService';
import { listModelosAtivos } from '@/services/modelosFichaService';
import { getConfig, loadConfig } from '@/services/configService';
import { ColaboradorLista, listarColaboradoresSenior } from '@/services/colaboradoresSeniorService';
import { admitidoDaSenior, postoCadastrado } from '@/services/integracaoService';
import { empresaDaSenior, empresaPelaMatricula } from '@/lib/empresaPelaMatricula';
import { formatarData } from '@/lib/convocacaoUniforme';
import { chaveSolta } from '@/lib/geoPlanilha';
import type { EPIFicha } from '@/types/epi';

interface Manual {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  matricula: string | null;
  posto: string | null;
  uf: string | null;
  funcao_id: string | null;
  funcao_nome: string | null;
  data_admissao: string | null;
  status: string;
}

type SituacaoFicha = 'sem' | 'pendente' | 'assinada';
const SITUACAO: Record<SituacaoFicha, { rotulo: string; classe: string }> = {
  sem: { rotulo: 'Sem ficha', classe: 'bg-red-100 text-red-800 border-red-200' },
  pendente: { rotulo: 'Aguardando assinatura', classe: 'bg-amber-100 text-amber-800 border-amber-200' },
  assinada: { rotulo: 'Assinada', classe: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};
const EMPRESA: Record<number, string> = { 1: 'MATRIZ', 3: 'APOIO' };
const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Fichas da admissão de uma pessoa: mesmo CPF, matrícula ou nome, entregues a partir de 15 dias antes da admissão. */
function situacaoDaAdmissao(
  fichas: EPIFicha[], p: { cpf?: string | null; matricula?: string | null; nome: string; admissao?: string | null },
): SituacaoFicha {
  const cpf = soDigitos(p.cpf).padStart(11, '0');
  const mat = soDigitos(p.matricula);
  const nome = chaveSolta(p.nome);
  const desde = p.admissao ? new Date(new Date(`${p.admissao}T12:00:00`).getTime() - 15 * 86400000).toISOString().slice(0, 10) : '';
  const dela = fichas.filter(f => (f.dataEntrega ?? '') >= desde && (
    (soDigitos(f.cpf) && soDigitos(f.cpf).padStart(11, '0') === cpf)
    || (mat && soDigitos(f.matricula) === mat)
    || chaveSolta(f.nomeFuncionario ?? '') === nome));
  if (!dela.length) return 'sem';
  return dela.some(f => f.status === 'pendente') ? 'pendente' : 'assinada';
}

export default function Integracao() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [aba, setAba] = useState<'senior' | 'manual'>('senior');
  const [colaboradores, setColaboradores] = useState<ColaboradorLista[]>([]);
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [manuais, setManuais] = useState<Manual[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [catalogo, setCatalogo] = useState<EPI[]>([]);
  const [tamanhos, setTamanhos] = useState<Record<string, string[]>>({});
  const [postos, setPostos] = useState<Posto[]>([]);
  const [modeloId, setModeloId] = useState<string>();
  const [empresaPadrao, setEmpresaPadrao] = useState(getConfig().empresaNome);
  const [carregando, setCarregando] = useState(true);

  const [dias, setDias] = useState('30');
  const [uf, setUf] = useEstadoLembrado('integracao', true);
  const [busca, setBusca] = useState('');
  const [soSemFicha, setSoSemFicha] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gerarPara, setGerarPara] = useState<PessoaAdmissao[] | null>(null);
  const [emailPara, setEmailPara] = useState<PessoaIntegracao[] | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [c, f, m] = await Promise.all([
        listarColaboradoresSenior().catch(() => [] as ColaboradorLista[]),
        getFichas({ semAssinaturas: true }),
        supabase.from('colaboradores_integracao').select('*').neq('status', 'cancelado').order('created_at', { ascending: false }),
      ]);
      setColaboradores(c);
      setFichas(f);
      setManuais((m.data ?? []) as Manual[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
    listFuncoes().then(setFuncoes).catch(() => {});
    listEpis().then(setCatalogo).catch(() => {});
    mapaTamanhos().then(setTamanhos).catch(() => {});
    listPostos().then(setPostos).catch(() => {});
    listModelosAtivos().then(l => setModeloId((l.find(x => x.padrao) ?? l[0])?.id)).catch(() => {});
    loadConfig().then(cfg => setEmpresaPadrao(cfg.empresaNome)).catch(() => {});
  }, []);

  // ---------- Admitidos na Senior ----------
  const admitidos = useMemo(() => {
    const desde = new Date(Date.now() - Number(dias) * 86400000).toISOString().slice(0, 10);
    const termo = chaveSolta(busca);
    return colaboradores
      .filter(c => c.ativo && c.data_admissao && c.data_admissao >= desde)
      .filter(c => !uf || uf === TODOS_ESTADOS || c.uf === uf)
      .filter(c => !termo || chaveSolta(`${c.nome} ${c.cargo ?? ''} ${c.posto_descricao ?? ''} ${c.nome_local ?? ''}`).includes(termo)
        || String(c.num_cad).startsWith(busca.trim()))
      .map(c => ({
        c,
        situacao: situacaoDaAdmissao(fichas, { cpf: c.cpf, matricula: String(c.num_cad), nome: c.nome, admissao: c.data_admissao }),
      }))
      .sort((a, b) => (b.c.data_admissao ?? '').localeCompare(a.c.data_admissao ?? ''));
  }, [colaboradores, fichas, dias, uf, busca]);
  const visiveis = soSemFicha ? admitidos.filter(a => a.situacao === 'sem') : admitidos;
  const contagem = (s: SituacaoFicha) => admitidos.filter(a => a.situacao === s).length;
  const chaveDe = (c: ColaboradorLista) => `${c.num_emp}-${c.num_cad}`;

  const alternar = (chave: string) => setSelecionados(s => {
    const n = new Set(s);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    return n;
  });
  const selecionarTodosSemFicha = () =>
    setSelecionados(new Set(visiveis.filter(a => a.situacao === 'sem').map(a => chaveDe(a.c))));

  const selecionarTodosVisiveis = () => setSelecionados(new Set(visiveis.map(a => chaveDe(a.c))));

  /** Lista para o e-mail da integração (quem foi selecionado). */
  const abrirEmail = () => setEmailPara(admitidos.filter(a => selecionados.has(chaveDe(a.c))).map(({ c, situacao }) => ({
    nome: c.nome, matricula: String(c.num_cad), empresa: empresaDaSenior(c.empresa_nome, c.razao_social) ?? EMPRESA[c.num_emp] ?? `Empresa ${c.num_emp}`,
    cargo: c.cargo, posto: c.posto_descricao ? c.posto_descricao.replace(/^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*/, '') : c.nome_local,
    uf: c.uf, admissao: c.data_admissao, fichas: SITUACAO[situacao].rotulo,
  })));

  const abrirGerarSenior = (lista: ColaboradorLista[]) => setGerarPara(lista.map(c => ({
    chave: chaveDe(c), dados: admitidoDaSenior(c, postos, empresaPadrao),
  })));

  // ---------- Cadastro manual ----------
  const abrirGerarManual = (m: Manual) => {
    const posto = postoCadastrado(postos, m.posto);
    setGerarPara([{
      chave: `manual-${m.id}`,
      kitId: m.funcao_id ?? undefined,
      dados: {
        nome: m.nome, cpf: m.cpf ?? '', telefone: m.telefone ?? '', matricula: m.matricula ?? '',
        funcao: m.funcao_nome ?? '', empresa: empresaPelaMatricula(m.matricula ?? '') ?? empresaPadrao,
        posto: posto?.nome ?? m.posto ?? '', uf: m.uf ?? '', turno: 'diurno',
      },
    }]);
  };

  async function aposGerar(chaves: string[]) {
    const manuaisGerados = chaves.filter(c => c.startsWith('manual-')).map(c => c.slice('manual-'.length));
    if (manuaisGerados.length) {
      await supabase.from('colaboradores_integracao').update({ status: 'fichas_geradas' }).in('id', manuaisGerados);
    }
    setGerarPara(null);
    setSelecionados(new Set());
    carregar();
  }

  async function excluirManual(m: Manual) {
    if (!(await confirm(`Excluir ${m.nome} do cadastro manual? As fichas já geradas continuam.`))) return;
    const { error } = await supabase.from('colaboradores_integracao').update({ status: 'cancelado' }).eq('id', m.id);
    if (error) return toast.error(error.message);
    carregar();
  }

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader
          eyebrow="RH • Admissão"
          title="Integração"
          description="Novos colaboradores: gere as fichas de EPI e de uniforme da admissão, prontas para assinar no tablet ou pelo link."
          actions={<NovoManualDialog funcoes={funcoes} onSalvo={() => { setAba('manual'); carregar(); }} />}
        />

        <div className="inline-flex rounded-lg border bg-background/60 p-1">
          {([['senior', `Admitidos na Senior (${admitidos.length})`], ['manual', `Cadastro manual (${manuais.length})`]] as const).map(([id, rotulo]) => (
            <button key={id} type="button" onClick={() => setAba(id)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${aba === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {rotulo}
            </button>
          ))}
        </div>

        {aba === 'senior' && (
          <Card>
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="text-base">
                Admitidos nos últimos {dias} dias
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {contagem('sem')} sem ficha · {contagem('pendente')} aguardando assinatura · {contagem('assinada')} assinadas
                </span>
              </CardTitle>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">Admitidos nos últimos</Label>
                  <Select value={dias} onValueChange={setDias}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['7', '15', '30', '60', '90', '180'].map(d => <SelectItem key={d} value={d}>{d} dias</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32"><Label className="text-xs">Estado</Label><EstadoSelect value={uf} onChange={setUf} permitirTodos /></div>
                <div className="relative">
                  <Label className="text-xs">Busca</Label>
                  <Search className="absolute left-2.5 top-[1.85rem] h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 w-64" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, matrícula, cargo ou posto" />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={soSemFicha} onChange={e => setSoSemFicha(e.target.checked)} />
                  Só quem ainda não tem ficha
                </label>
                <div className="ml-auto flex gap-2 pb-0.5">
                  <Button variant="outline" size="sm" onClick={selecionarTodosVisiveis} disabled={!visiveis.length}>
                    Selecionar todos da lista
                  </Button>
                  <Button variant="outline" size="sm" onClick={selecionarTodosSemFicha} disabled={!contagem('sem')}>
                    Selecionar todos sem ficha
                  </Button>
                  {selecionados.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
                  )}
                  <Button variant="outline" size="sm" disabled={!selecionados.size} onClick={abrirEmail} data-guia="btn-integracao-email"
                    title="Envia por e-mail a lista dos selecionados (participantes da integração)">
                    <Mail className="h-4 w-4 mr-1" /> Enviar por e-mail ({selecionados.size})
                  </Button>
                  <Button size="sm" disabled={!selecionados.size} data-guia="btn-integracao-gerar"
                    onClick={() => abrirGerarSenior(colaboradores.filter(c => selecionados.has(chaveDe(c))))}>
                    <FileSignature className="h-4 w-4 mr-1" /> Gerar fichas ({selecionados.size})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {carregando ? (
                <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
              ) : !colaboradores.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  A lista da Senior ainda não foi carregada (ou você não tem acesso a ela). Ela atualiza sozinha às 6h, 12h e 18h.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Cargo / Posto de trabalho</TableHead>
                        <TableHead>UF</TableHead>
                        <TableHead>Admissão</TableHead>
                        <TableHead>Fichas</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveis.map(({ c, situacao }) => (
                        <TableRow key={chaveDe(c)}>
                          <TableCell>
                            <input type="checkbox" className="h-4 w-4" checked={selecionados.has(chaveDe(c))} onChange={() => alternar(chaveDe(c))} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{c.nome}</div>
                            <div className="text-xs text-muted-foreground">mat. {c.num_cad} · {EMPRESA[c.num_emp] ?? `Emp. ${c.num_emp}`} · {c.situacao_descricao}</div>
                          </TableCell>
                          <TableCell className="max-w-[20rem]">
                            <div className="truncate">{c.cargo}</div>
                            <div className="text-xs text-muted-foreground truncate" title={c.posto_descricao ?? ''}>
                              {c.posto_descricao ? c.posto_descricao.replace(/^\s*\d{3,4}\s*-\s*\d{3,4}\s*-\s*/, '') : c.nome_local}
                            </div>
                          </TableCell>
                          <TableCell>{c.uf}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.data_admissao ? formatarData(c.data_admissao) : '—'}</TableCell>
                          <TableCell><Badge variant="outline" className={SITUACAO[situacao].classe}>{SITUACAO[situacao].rotulo}</Badge></TableCell>
                          <TableCell className="text-right">
                            {situacao === 'sem' && (
                              <Button variant="ghost" size="sm" onClick={() => abrirGerarSenior([c])}>Gerar fichas</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!visiveis.length && (
                        <TableRow><TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                          {soSemFicha ? 'Todos os admitidos do período já têm ficha.' : 'Ninguém admitido no período.'}
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {aba === 'manual' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cadastro manual
                <span className="ml-2 text-sm font-normal text-muted-foreground">· para quem ainda não foi lançado na Senior</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo de uniforme / Posto</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Admissão prevista</TableHead>
                    <TableHead>Fichas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manuais.map(m => {
                    const s = situacaoDaAdmissao(fichas, { cpf: m.cpf, matricula: m.matricula, nome: m.nome, admissao: m.data_admissao });
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.nome}</div>
                          <div className="text-xs text-muted-foreground">{m.cpf || 'sem CPF'} · mat. {m.matricula || '—'}</div>
                        </TableCell>
                        <TableCell>
                          <div>{m.funcao_nome || '—'}</div>
                          <div className="text-xs text-muted-foreground">{m.posto || '—'}</div>
                        </TableCell>
                        <TableCell>{m.uf || '—'}</TableCell>
                        <TableCell>{m.data_admissao ? formatarData(m.data_admissao) : '—'}</TableCell>
                        <TableCell><Badge variant="outline" className={SITUACAO[s].classe}>{SITUACAO[s].rotulo}</Badge></TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {s === 'sem' && <Button variant="ghost" size="sm" onClick={() => abrirGerarManual(m)}>Gerar fichas</Button>}
                          <Button variant="ghost" size="icon" className="text-destructive" title="Excluir" onClick={() => excluirManual(m)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!manuais.length && (
                    <TableRow><TableCell colSpan={6} className="p-6 text-center text-muted-foreground">
                      Ninguém no cadastro manual. Use "Novo colaborador" para quem ainda não está na Senior.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Depois de gerar, as fichas aparecem em <Link to="/pendentes" className="underline">Assinar (Tablet)</Link> e em Consultar Fichas.
        </p>
      </div>

      <GerarFichasAdmissaoDialog
        pessoas={gerarPara ?? []} aberto={!!gerarPara} onFechar={() => setGerarPara(null)}
        funcoes={funcoes} catalogo={catalogo} tamanhos={tamanhos} modeloId={modeloId} onGeradas={aposGerar}
      />
      <EnviarIntegracaoDialog pessoas={emailPara ?? []} aberto={!!emailPara} onFechar={() => setEmailPara(null)} />
      <ConfirmDialog />
    </div>
  );
}

function NovoManualDialog({ funcoes, onSalvo }: { funcoes: Funcao[]; onSalvo: () => void }) {
  const vazio = { nome: '', cpf: '', telefone: '', matricula: '', posto: '', uf: '', funcao_id: '', data_admissao: '' };
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(vazio);
  const campo = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function salvar() {
    if (!form.nome.trim()) return toast.error('Informe o nome');
    if (!form.uf) return toast.error('Escolha o estado');
    const f = funcoes.find(x => x.id === form.funcao_id);
    const { error } = await supabase.from('colaboradores_integracao').insert({
      nome: form.nome.trim(), cpf: form.cpf || null, telefone: form.telefone || null, matricula: form.matricula || null,
      posto: form.posto || null, uf: form.uf, funcao_id: form.funcao_id || null, funcao_nome: f?.nome || null,
      data_admissao: form.data_admissao || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Colaborador cadastrado');
    setAberto(false);
    setForm(vazio);
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild><Button variant="outline"><UserPlus className="h-4 w-4 mr-1" /> Novo colaborador (manual)</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo colaborador (ainda não está na Senior)</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="m-nome">Nome *</Label><Input id="m-nome" value={form.nome} onChange={campo('nome')} /></div>
          <div><Label htmlFor="m-cpf">CPF</Label><Input id="m-cpf" value={form.cpf} onChange={campo('cpf')} placeholder="000.000.000-00" /></div>
          <div><Label htmlFor="m-tel">Telefone</Label><Input id="m-tel" value={form.telefone} onChange={campo('telefone')} /></div>
          <div><Label htmlFor="m-mat">Matrícula</Label><Input id="m-mat" value={form.matricula} onChange={campo('matricula')} /></div>
          <div><Label>Estado *</Label><EstadoSelect value={form.uf} onChange={v => setForm(f => ({ ...f, uf: v, funcao_id: '' }))} placeholder="Escolha" /></div>
          <div className="sm:col-span-2"><Label htmlFor="m-posto">Posto</Label><Input id="m-posto" value={form.posto} onChange={campo('posto')} placeholder="Ex.: Parkshopping" /></div>
          <div><Label>Tipo de uniforme</Label>
            <Select value={form.funcao_id} onValueChange={v => setForm(f => ({ ...f, funcao_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{funcoes.filter(f => f.uf === form.uf).map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="m-adm">Admissão prevista</Label><Input id="m-adm" type="date" value={form.data_admissao} onChange={campo('data_admissao')} /></div>
        </div>
        <DialogFooter><Button onClick={salvar}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
