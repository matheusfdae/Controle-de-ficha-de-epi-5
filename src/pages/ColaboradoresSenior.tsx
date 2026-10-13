import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Download, FilePlus2, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import EstadoSelect, { TODOS_ESTADOS, useEstadoLembrado } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { getFichas } from '@/services/fichaService';
import { EPIFicha } from '@/types/epi';
import {
  ColaboradorLista, ResumoFichas, atualizarDaSenior, cruzarComFichas, listarColaboradoresSenior,
} from '@/services/colaboradoresSeniorService';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import FichasSenior from '@/components/FichasSenior';
import { formatCpf, nomePostoTrabalho } from '@/services/seniorService';
import { formatarData } from '@/lib/convocacaoUniforme';
import { chaveSolta } from '@/lib/geoPlanilha';

type FiltroFicha = 'todos' | 'sem' | 'com' | 'pendente';
const POR_PAGINA = 50;
const EMPRESA: Record<number, string> = { 1: 'MATRIZ', 3: 'APOIO' };
const SEM_FICHAS: ResumoFichas = { quantidade: 0, ultima: null, pendentes: 0 };

function corSituacao(s: string | null) {
  if (s === 'Trabalhando') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s === 'Férias') return 'bg-sky-100 text-sky-800 border-sky-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
}

export default function ColaboradoresSenior() {
  const { can } = useAuth();
  const podeAtualizar = can('colaboradores', 'edit');
  const [colaboradores, setColaboradores] = useState<ColaboradorLista[]>([]);
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [busca, setBusca] = useState('');
  const [uf, setUf] = useEstadoLembrado('colaboradores', true);
  const [empresa, setEmpresa] = useState('todas');
  const [filtroFicha, setFiltroFicha] = useState<FiltroFicha>('todos');
  const [situacoes, setSituacoes] = useState<string[]>([]);
  const [admDe, setAdmDe] = useState('');
  const [admAte, setAdmAte] = useState('');
  const [mostrarDesligados, setMostrarDesligados] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [aba, setAba] = useState<'colaboradores' | 'postos' | 'fichas'>('colaboradores');
  const [postoSel, setPostoSel] = useState('');
  const [paginaPostos, setPaginaPostos] = useState(0);

  async function carregar() {
    setCarregando(true);
    try {
      const [c, f] = await Promise.all([listarColaboradoresSenior(), getFichas({ semAssinaturas: true })]);
      setColaboradores(c);
      setFichas(f);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function atualizar() {
    setAtualizando(true);
    const aviso = toast.loading('Atualizando da Senior… (leva uns 2 minutos)');
    try {
      const r = await atualizarDaSenior(texto => toast.loading(texto, { id: aviso }));
      toast.success(`${r.total} colaboradores atualizados${r.inativados ? `; ${r.inativados} saíram da Senior (desligados)` : ''}. `
        + `Nomes: ${r.postosRecebidos} postos vindos da Senior, ${r.postosGravados} colaboradores com o nome do posto atualizado, `
        + `${r.escalasGravadas} com a escala atualizada.`, { id: aviso, duration: 15000 });
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar', { id: aviso });
    } finally {
      setAtualizando(false);
    }
  }

  const comparacao = useMemo(() => cruzarComFichas(colaboradores, fichas), [colaboradores, fichas]);
  const resumo = comparacao.porColaborador;
  const [verSoltas, setVerSoltas] = useState(false);
  const ultimaSincronizacao = useMemo(
    () => colaboradores.reduce<string | null>((m, c) => (!m || c.sincronizado_em > m ? c.sincronizado_em : m), null),
    [colaboradores],
  );

  // Base para os contadores de situação: tudo menos o próprio filtro de situação.
  const base = useMemo(() => {
    const termo = chaveSolta(busca);
    const digitos = busca.replace(/\D/g, '');
    return colaboradores.filter(c => {
      if (!mostrarDesligados && !c.ativo) return false;
      if (uf && uf !== TODOS_ESTADOS && c.uf !== uf) return false;
      if (empresa !== 'todas' && String(c.num_emp) !== empresa) return false;
      if (admDe && (!c.data_admissao || c.data_admissao < admDe)) return false;
      if (admAte && (!c.data_admissao || c.data_admissao > admAte)) return false;
      const r = resumo.get(c.id) ?? SEM_FICHAS;
      if (filtroFicha === 'sem' && r.quantidade > 0) return false;
      if (filtroFicha === 'com' && r.quantidade === 0) return false;
      if (filtroFicha === 'pendente' && r.pendentes === 0) return false;
      if (termo || digitos) {
        const bate = (termo && (chaveSolta(c.nome).includes(termo) || chaveSolta(c.nome_local ?? '').includes(termo)
          || chaveSolta(c.cargo ?? '').includes(termo) || chaveSolta(c.centro_custo ?? '').includes(termo)
          || chaveSolta(c.posto_descricao ?? '').includes(termo) || chaveSolta(c.posto_codigo ?? '').includes(termo)))
          || (digitos && (String(c.num_cad).startsWith(digitos) || (c.cpf ?? '').includes(digitos)
            || c.cod_centro_custo === digitos));
        if (!bate) return false;
      }
      return true;
    });
  }, [colaboradores, resumo, busca, uf, empresa, admDe, admAte, filtroFicha, mostrarDesligados]);

  const contagemSituacao = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of base) m.set(c.situacao_descricao ?? '—', (m.get(c.situacao_descricao ?? '—') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);

  const listaSituacao = useMemo(
    () => (situacoes.length ? base.filter(c => situacoes.includes(c.situacao_descricao ?? '—')) : base),
    [base, situacoes],
  );
  // Postos de trabalho com os colaboradores alocados (respeita os outros filtros).
  const postos = useMemo(() => agruparPorPosto(listaSituacao, resumo), [listaSituacao, resumo]);
  const lista = useMemo(
    () => (postoSel ? listaSituacao.filter(c => chavePostoSenior(c) === postoSel) : listaSituacao),
    [listaSituacao, postoSel],
  );
  const postoSelecionado = postos.find(p => p.chave === postoSel);
  const semFicha = useMemo(() => lista.filter(c => (resumo.get(c.id) ?? SEM_FICHAS).quantidade === 0).length, [lista, resumo]);

  useEffect(() => { setPagina(0); setPaginaPostos(0); }, [busca, uf, empresa, admDe, admAte, filtroFicha, situacoes, mostrarDesligados, postoSel]);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visiveis = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const alternarSituacao = (s: string) =>
    setSituacoes(atual => (atual.includes(s) ? atual.filter(x => x !== s) : [...atual, s]));

  const limparFiltros = () => {
    setBusca(''); setEmpresa('todas'); setFiltroFicha('todos'); setSituacoes([]);
    setAdmDe(''); setAdmAte(''); setMostrarDesligados(false); setPostoSel('');
  };
  const verColaboradoresDoPosto = (chave: string) => { setPostoSel(chave); setAba('colaboradores'); };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <BackButton />
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Colaboradores Senior
            </h2>
            <p className="text-sm text-muted-foreground">
              Todos os colaboradores da Senior e se já têm ficha.
              {ultimaSincronizacao && ` Atualizado em ${new Date(ultimaSincronizacao).toLocaleString('pt-BR')}.`}
              {' '}Atualiza sozinho às 6h, 12h e 18h.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className={aba === 'fichas' ? 'hidden' : ''}
            disabled={aba === 'postos' ? !postos.length : !lista.length}
            onClick={() => (aba === 'postos' ? baixarExcelPostos(postos) : baixarExcel(lista, resumo))}>
            <Download className="h-4 w-4 mr-1" /> Baixar Excel
          </Button>
          {podeAtualizar && (
            <Button size="sm" onClick={atualizar} disabled={atualizando}>
              {atualizando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Atualizar da Senior
            </Button>
          )}
        </div>
      </div>

      {!carregando && colaboradores.length > 0 && (
        <Comparativo
          colaboradores={lista} resumo={resumo} totalFichas={fichas.length}
          fichasLigadas={fichas.length - comparacao.fichasSemColaborador.length}
          ligadasPor={comparacao.ligadasPor} soltas={comparacao.fichasSemColaborador.length}
          onVerSoltas={() => setVerSoltas(true)}
        />
      )}

      <FichasSemColaborador aberto={verSoltas} onFechar={() => setVerSoltas(false)} fichas={comparacao.fichasSemColaborador} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label htmlFor="busca" className="text-xs">Nome, matrícula, CPF, cargo, posto, local ou centro de custo</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="busca" className="pl-8" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <EstadoSelect value={uf} onChange={setUf} permitirTodos />
            </div>
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select value={empresa} onValueChange={setEmpresa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="1">MATRIZ</SelectItem>
                  <SelectItem value="3">APOIO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Admitido de</Label>
              <Input type="date" value={admDe} onChange={e => setAdmDe(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">até</Label>
              <Input type="date" value={admAte} onChange={e => setAdmAte(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Fichas</Label>
              <Select value={filtroFicha} onValueChange={v => setFiltroFicha(v as FiltroFicha)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sem">Sem nenhuma ficha</SelectItem>
                  <SelectItem value="com">Com ficha</SelectItem>
                  <SelectItem value="pendente">Com ficha pendente de assinatura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
              <input type="checkbox" className="h-4 w-4" checked={mostrarDesligados}
                onChange={e => setMostrarDesligados(e.target.checked)} />
              Mostrar quem saiu da Senior (desligados)
            </label>
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="mb-0.5">Limpar filtros</Button>
          </div>

          {postoSel && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Posto:</span>
              <Badge variant="secondary" className="gap-1">
                {postoSelecionado?.nome ?? 'Sem posto informado'}
                <button type="button" className="ml-1 opacity-70 hover:opacity-100" onClick={() => setPostoSel('')}
                  title="Tirar o filtro de posto">✕</button>
              </Badge>
            </div>
          )}

          <div>
            <Label className="text-xs">Situação na Senior {situacoes.length > 0 && '(clique de novo para tirar)'}</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {contagemSituacao.map(([s, n]) => (
                <button key={s} type="button" onClick={() => alternarSituacao(s)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${situacoes.includes(s)
                    ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
                  {s} <span className="opacity-70">({n})</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="inline-flex rounded-lg border bg-background/60 p-1">
        {([
          ['colaboradores', `Colaboradores (${lista.length})`],
          ['postos', `Postos (${postos.filter(p => p.codigo).length})`],
          ['fichas', `Fichas (${fichas.length})`],
        ] as const)
          .map(([id, rotulo]) => (
            <button key={id} type="button" onClick={() => setAba(id)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${aba === id
                ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {rotulo}
            </button>
          ))}
      </div>

      {aba === 'fichas' && <FichasSenior fichas={fichas} porFicha={comparacao.porFicha} carregando={carregando} />}

      {aba === 'postos' && (
        <TabelaPostos postos={postos} pagina={paginaPostos} setPagina={setPaginaPostos}
          onVer={verColaboradoresDoPosto} carregando={carregando} />
      )}

      <Card className={aba === 'colaboradores' ? '' : 'hidden'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {lista.length} colaborador(es)
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {semFicha} sem nenhuma ficha</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {carregando ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
          ) : colaboradores.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum colaborador carregado ainda.
              {podeAtualizar ? ' Clique em "Atualizar da Senior".' : ' Peça a quem tem permissão para atualizar da Senior.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Cargo / Local / Posto / Escala</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Admissão</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Fichas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map(c => {
                    const r = resumo.get(c.id) ?? SEM_FICHAS;
                    return (
                      <TableRow key={c.id} className={c.ativo ? '' : 'opacity-60'}>
                        <TableCell>
                          <div className="font-medium">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">{formatCpf(c.cpf)}{!c.ativo && ' · desligado'}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {c.num_cad}
                          <div className="text-xs text-muted-foreground">{EMPRESA[c.num_emp] ?? `Empresa ${c.num_emp}`}</div>
                        </TableCell>
                        <TableCell className="max-w-[18rem]">
                          <div className="truncate" title={c.cargo ?? ''}>{c.cargo}</div>
                          <div className="text-xs text-muted-foreground truncate" title={c.nome_local ?? ''}>{c.nome_local}</div>
                          {c.centro_custo && (
                            <div className="text-xs text-muted-foreground truncate" title={c.centro_custo}>
                              CC {c.cod_centro_custo} · {c.centro_custo}
                            </div>
                          )}
                          {(c.posto_descricao || c.posto_codigo) && (
                            <div className="text-xs font-medium text-foreground/80 truncate" title={c.posto_descricao ?? ''}>
                              Posto {c.posto_codigo} · {nomePostoTrabalho(c.posto_descricao) || '—'}
                            </div>
                          )}
                          {c.escala_nome && (
                            <div className="text-xs text-muted-foreground truncate" title={c.escala_nome}>Escala {c.escala_nome}</div>
                          )}
                        </TableCell>
                        <TableCell>{c.uf}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.data_admissao ? formatarData(c.data_admissao) : '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={corSituacao(c.situacao_descricao)}>{c.situacao_descricao ?? '—'}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.quantidade === 0 ? (
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Sem ficha</Badge>
                          ) : (
                            <div>
                              <span className="font-medium">{r.quantidade}</span>
                              <span className="text-xs text-muted-foreground"> · última {r.ultima ? formatarData(r.ultima) : '—'}</span>
                              {r.pendentes > 0 && <div className="text-xs text-amber-700">{r.pendentes} pendente(s)</div>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.ativo && (
                            <Button asChild variant="ghost" size="sm" title="Nova ficha EPI com os dados da Senior">
                              <Link to={`/nova-ficha?tipo=epi&senior_emp=${c.num_emp}&senior_cad=${c.num_cad}`}>
                                <FilePlus2 className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {lista.length > POR_PAGINA && (
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Comparativo({ colaboradores, resumo, totalFichas, fichasLigadas, ligadasPor, soltas, onVerSoltas }: {
  colaboradores: ColaboradorLista[];
  resumo: Map<string, ResumoFichas>;
  totalFichas: number;
  fichasLigadas: number;
  ligadasPor: Record<'cpf' | 'matricula' | 'nome', number>;
  soltas: number;
  onVerSoltas: () => void;
}) {
  const total = colaboradores.length;
  const comFicha = colaboradores.filter(c => (resumo.get(c.id) ?? SEM_FICHAS).quantidade > 0).length;
  const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
  const blocos = [
    { titulo: 'Colaboradores na lista', valor: total, detalhe: 'com os filtros abaixo', cor: '' },
    { titulo: 'Com ficha', valor: comFicha, detalhe: `${pct(comFicha, total)}% dos colaboradores`, cor: 'text-emerald-700' },
    { titulo: 'Sem nenhuma ficha', valor: total - comFicha, detalhe: `${pct(total - comFicha, total)}% dos colaboradores`, cor: 'text-red-700' },
    {
      titulo: 'Fichas ligadas à Senior', valor: fichasLigadas,
      detalhe: `de ${totalFichas} · ${ligadasPor.cpf} pelo CPF, ${ligadasPor.matricula} pela matrícula, ${ligadasPor.nome} pelo nome`, cor: '',
    },
  ];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Comparação: fichas × colaboradores da Senior</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {blocos.map(b => (
            <div key={b.titulo} className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">{b.titulo}</div>
              <div className={`text-2xl font-bold tabular-nums ${b.cor}`}>{b.valor.toLocaleString('pt-BR')}</div>
              <div className="text-xs text-muted-foreground">{b.detalhe}</div>
            </div>
          ))}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-red-200" title={`${pct(comFicha, total)}% com ficha`}>
          <div className="h-full bg-emerald-500" style={{ width: `${pct(comFicha, total)}%` }} />
        </div>
        {soltas > 0 && (
          <p className="text-sm">
            <span className="font-medium text-amber-700">{soltas} ficha(s)</span> não batem com nenhum colaborador ativo da Senior
            (desligados antes da lista, terceiros, ou CPF/matrícula/nome digitados diferente).{' '}
            <Button variant="link" className="h-auto p-0" onClick={onVerSoltas}>Ver quais</Button>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FichasSemColaborador({ aberto, onFechar, fichas }: { aberto: boolean; onFechar: () => void; fichas: EPIFicha[] }) {
  const ordenadas = [...fichas].sort((a, b) => a.nomeFuncionario.localeCompare(b.nomeFuncionario));
  return (
    <Dialog open={aberto} onOpenChange={v => !v && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fichas sem colaborador na Senior ({fichas.length})</DialogTitle>
          <DialogDescription>
            Não bateram pelo CPF, pela matrícula nem pelo nome com a lista de colaboradores ativos da Senior.
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador na ficha</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>Posto</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map(f => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.nomeFuncionario || '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{f.cpf || '—'}</TableCell>
                <TableCell>{f.matricula || '—'}</TableCell>
                <TableCell className="max-w-[14rem] truncate" title={f.posto}>{f.posto || '—'}</TableCell>
                <TableCell>{f.uf}</TableCell>
                <TableCell className="whitespace-nowrap">{f.dataEntrega ? formatarData(f.dataEntrega) : '—'}</TableCell>
                <TableCell>
                  <Button asChild variant="ghost" size="sm"><Link to={`/ficha/${f.id}`}>Abrir</Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

/** Chave do posto de trabalho de um colaborador ("103|PO0175"); sem posto = "__sem__". */
function chavePostoSenior(c: ColaboradorLista) {
  return c.posto_codigo ? `${c.posto_estrutura ?? ''}|${c.posto_codigo}` : '__sem__';
}

interface PostoAgrupado {
  chave: string;
  codigo: string | null;
  descricao: string | null;
  nome: string;
  ufs: string[];
  /** Escalas dos colaboradores do posto (nome, ou o código se o nome não veio), com quantos em cada. */
  escalas: { nome: string; colaboradores: number }[];
  colaboradores: number;
  comFicha: number;
  semFicha: number;
}

function agruparPorPosto(colaboradores: ColaboradorLista[], resumo: Map<string, ResumoFichas>): PostoAgrupado[] {
  const grupos = new Map<string, PostoAgrupado & { _ufs: Set<string>; _escalas: Map<string, number> }>();
  for (const c of colaboradores) {
    const chave = chavePostoSenior(c);
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave, codigo: c.posto_codigo, descricao: c.posto_descricao,
        nome: c.posto_codigo ? nomePostoTrabalho(c.posto_descricao) || c.posto_codigo : 'Sem posto informado',
        ufs: [], escalas: [], colaboradores: 0, comFicha: 0, semFicha: 0, _ufs: new Set(), _escalas: new Map(),
      };
      grupos.set(chave, g);
    }
    g.colaboradores++;
    if (c.uf) g._ufs.add(c.uf);
    if (c.escala_codigo) {
      const nome = c.escala_nome || `Escala ${c.escala_codigo}`;
      g._escalas.set(nome, (g._escalas.get(nome) ?? 0) + 1);
    }
    if (!g.descricao && c.posto_descricao) {
      g.descricao = c.posto_descricao;
      g.nome = nomePostoTrabalho(c.posto_descricao) || g.nome;
    }
    if ((resumo.get(c.id) ?? SEM_FICHAS).quantidade > 0) g.comFicha++; else g.semFicha++;
  }
  return [...grupos.values()]
    .map(({ _ufs, _escalas, ...g }) => ({ ...g, ufs: [..._ufs].sort(), escalas: [..._escalas]
      .map(([nome, colaboradores]) => ({ nome, colaboradores }))
      .sort((a, b) => b.colaboradores - a.colaboradores || a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => (a.codigo ? 0 : 1) - (b.codigo ? 0 : 1) || b.colaboradores - a.colaboradores || a.nome.localeCompare(b.nome));
}

function TabelaPostos({ postos, pagina, setPagina, onVer, carregando }: {
  postos: PostoAgrupado[];
  pagina: number;
  setPagina: (fn: (p: number) => number) => void;
  onVer: (chave: string) => void;
  carregando: boolean;
}) {
  const comPosto = postos.filter(p => p.codigo);
  const alocados = comPosto.reduce((n, p) => n + p.colaboradores, 0);
  const semPosto = postos.find(p => !p.codigo)?.colaboradores ?? 0;
  const postosSemFicha = comPosto.filter(p => p.semFicha > 0).length;
  const totalPaginas = Math.max(1, Math.ceil(postos.length / POR_PAGINA));
  const visiveis = postos.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {comPosto.length.toLocaleString('pt-BR')} posto(s) de trabalho
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            · {alocados.toLocaleString('pt-BR')} colaborador(es) alocados
            {semPosto > 0 && ` · ${semPosto} sem posto informado`}
            {` · ${postosSemFicha} posto(s) com alguém sem ficha`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {carregando ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
        ) : comPosto.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum posto carregado ainda. Clique em "Atualizar da Senior" para trazer os postos de trabalho.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posto de trabalho</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead className="text-right">Escalas</TableHead>
                  <TableHead className="text-right">Colaboradores</TableHead>
                  <TableHead className="text-right">Com ficha</TableHead>
                  <TableHead className="text-right">Sem ficha</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(p => (
                  <TableRow key={p.chave} className="cursor-pointer" onClick={() => onVer(p.chave)}>
                    <TableCell className="max-w-[28rem]">
                      <div className="font-medium truncate" title={p.descricao ?? ''}>{p.nome}</div>
                      {p.codigo && (
                        <div className="text-xs text-muted-foreground truncate" title={p.descricao ?? ''}>
                          {p.codigo} · {p.descricao}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{p.ufs.join(', ') || '—'}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      {p.escalas.length === 0 ? <span className="text-muted-foreground">0</span> : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 px-2.5 tabular-nums" title="Ver as escalas">
                              {p.escalas.length}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-96">
                            <div className="text-sm font-medium mb-2">{p.escalas.length} escala(s) em {p.nome}</div>
                            <ul className="max-h-64 overflow-y-auto text-sm">
                              {p.escalas.map(e => (
                                <li key={e.nome} className="flex justify-between gap-3 border-b last:border-0 py-1">
                                  <span>{e.nome}</span>
                                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">{e.colaboradores} colab.</span>
                                </li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{p.colaboradores}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{p.comFicha}</TableCell>
                    <TableCell className={`text-right tabular-nums ${p.semFicha ? 'text-red-700 font-medium' : 'text-muted-foreground'}`}>
                      {p.semFicha}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onVer(p.chave); }}>
                        Ver colaboradores
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {postos.length > POR_PAGINA && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(x => x - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(x => x + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function baixarExcelPostos(postos: PostoAgrupado[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Postos');
  ws.columns = [
    { header: 'Posto', key: 'nome', width: 40 },
    { header: 'Código', key: 'codigo', width: 11 },
    { header: 'Descrição na Senior', key: 'descricao', width: 60 },
    { header: 'Estado', key: 'ufs', width: 10 },
    { header: 'Qtd. escalas', key: 'qtdEscalas', width: 12 },
    { header: 'Escalas', key: 'escalasTexto', width: 60 },
    { header: 'Colaboradores', key: 'colaboradores', width: 14 },
    { header: 'Com ficha', key: 'comFicha', width: 11 },
    { header: 'Sem ficha', key: 'semFicha', width: 11 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const p of postos) {
    ws.addRow({
      ...p, ufs: p.ufs.join(', '), qtdEscalas: p.escalas.length,
      escalasTexto: p.escalas.map(e => `${e.nome} (${e.colaboradores})`).join(' | '),
    });
  }
  ws.autoFilter = { from: 'A1', to: 'I1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Uma linha por posto × escala, para filtrar e montar tabela dinâmica.
  const det = wb.addWorksheet('Postos x Escalas');
  det.columns = [
    { header: 'Posto', key: 'posto', width: 40 },
    { header: 'Código do posto', key: 'codigo', width: 15 },
    { header: 'Descrição na Senior', key: 'descricao', width: 60 },
    { header: 'Estado', key: 'ufs', width: 10 },
    { header: 'Escala', key: 'escala', width: 40 },
    { header: 'Colaboradores na escala', key: 'colaboradores', width: 22 },
  ];
  det.getRow(1).font = { bold: true };
  for (const p of postos) {
    const linhas = p.escalas.length ? p.escalas : [{ nome: '(sem escala informada)', colaboradores: p.colaboradores }];
    for (const e of linhas) {
      det.addRow({ posto: p.nome, codigo: p.codigo, descricao: p.descricao, ufs: p.ufs.join(', '), escala: e.nome, colaboradores: e.colaboradores });
    }
  }
  det.autoFilter = { from: 'A1', to: 'F1' };
  det.views = [{ state: 'frozen', ySplit: 1 }];

  // Resumo por escala: em quantos postos aparece e quantos colaboradores tem.
  const porEscala = new Map<string, { postos: number; colaboradores: number }>();
  for (const p of postos) {
    for (const e of p.escalas) {
      const t = porEscala.get(e.nome) ?? { postos: 0, colaboradores: 0 };
      t.postos++;
      t.colaboradores += e.colaboradores;
      porEscala.set(e.nome, t);
    }
  }
  const esc = wb.addWorksheet('Escalas');
  esc.columns = [
    { header: 'Escala', key: 'escala', width: 45 },
    { header: 'Postos', key: 'postos', width: 10 },
    { header: 'Colaboradores', key: 'colaboradores', width: 14 },
  ];
  esc.getRow(1).font = { bold: true };
  [...porEscala].sort((a, b) => b[1].colaboradores - a[1].colaboradores)
    .forEach(([escala, t]) => esc.addRow({ escala, ...t }));
  esc.autoFilter = { from: 'A1', to: 'C1' };
  esc.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `postos-senior-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

async function baixarExcel(lista: ColaboradorLista[], resumo: Map<string, ResumoFichas>) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Colaboradores');
  ws.columns = [
    { header: 'Colaborador', key: 'nome', width: 36 },
    { header: 'CPF', key: 'cpf', width: 16 },
    { header: 'Matrícula', key: 'matricula', width: 11 },
    { header: 'Empresa', key: 'empresa', width: 10 },
    { header: 'Cargo', key: 'cargo', width: 26 },
    { header: 'Local', key: 'local', width: 38 },
    { header: 'Cód. posto', key: 'postoCod', width: 11 },
    { header: 'Posto de trabalho', key: 'posto', width: 44 },
    { header: 'Escala', key: 'escala', width: 30 },
    { header: 'Cód. centro de custo', key: 'ccCod', width: 12 },
    { header: 'Centro de custo', key: 'cc', width: 34 },
    { header: 'Estado', key: 'uf', width: 8 },
    { header: 'Admissão', key: 'admissao', width: 12 },
    { header: 'Situação', key: 'situacao', width: 20 },
    { header: 'Fichas', key: 'fichas', width: 8 },
    { header: 'Última ficha', key: 'ultima', width: 12 },
    { header: 'Pendentes', key: 'pendentes', width: 10 },
    { header: 'Na Senior', key: 'ativo', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of lista) {
    const r = resumo.get(c.id) ?? SEM_FICHAS;
    ws.addRow({
      nome: c.nome, cpf: formatCpf(c.cpf), matricula: c.num_cad, empresa: EMPRESA[c.num_emp] ?? c.num_emp,
      cargo: c.cargo, local: c.nome_local, ccCod: c.cod_centro_custo, cc: c.centro_custo,
      postoCod: c.posto_codigo, posto: nomePostoTrabalho(c.posto_descricao), escala: c.escala_nome, uf: c.uf, admissao: c.data_admissao ? formatarData(c.data_admissao) : '',
      situacao: c.situacao_descricao, fichas: r.quantidade, ultima: r.ultima ? formatarData(r.ultima) : '',
      pendentes: r.pendentes, ativo: c.ativo ? 'Sim' : 'Desligado',
    });
  }
  ws.autoFilter = { from: 'A1', to: 'R1' };
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `colaboradores-senior-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
