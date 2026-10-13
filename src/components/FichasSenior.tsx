import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, UserSearch } from 'lucide-react';
import { toast } from 'sonner';
import type { EPIFicha } from '@/types/epi';
import type { ColaboradorLista, FormaLigacao } from '@/services/colaboradoresSeniorService';
import { ColaboradorSenior, consultarColaboradorSeniorPorCpf, formatCpf } from '@/services/seniorService';
import { formatarData } from '@/lib/convocacaoUniforme';
import { chaveSolta } from '@/lib/geoPlanilha';

const POR_PAGINA = 50;
const EMPRESA: Record<number, string> = { 1: 'MATRIZ', 3: 'APOIO' };
const ROTULO_FORMA: Record<FormaLigacao, string> = { cpf: 'CPF', matricula: 'Matrícula', nome: 'Nome' };

type Filtro = 'todas' | 'identificadas' | 'nao' | 'nome_diferente';

/** Resultado da procura na Senior pelo CPF, para fichas sem colaborador na lista. */
type Procura = { colaborador: ColaboradorSenior } | { erro: string };

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const cpfValido = (v: string) => soDigitos(v).length >= 9 && soDigitos(v).length <= 11;
const nomesBatem = (a: string, b: string) => chaveSolta(a) === chaveSolta(b);

/**
 * Cada ficha do sistema e de quem ela é na Senior. As que não batem com a lista
 * de ativos podem ser procuradas pelo CPF (acha também demitidos).
 */
export default function FichasSenior({ fichas, porFicha, carregando }: {
  fichas: EPIFicha[];
  porFicha: Map<string, { colaborador: ColaboradorLista; forma: FormaLigacao }>;
  carregando: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [procuras, setProcuras] = useState<Map<string, Procura>>(new Map());
  const [procurando, setProcurando] = useState<{ feitos: number; total: number } | null>(null);

  const ordenadas = useMemo(
    () => [...fichas].sort((a, b) => (b.dataEntrega ?? '').localeCompare(a.dataEntrega ?? '')),
    [fichas],
  );
  const identificadas = ordenadas.filter(f => porFicha.has(f.id)).length;
  const nomeDiferente = (f: EPIFicha) => {
    const l = porFicha.get(f.id);
    return !!l && l.forma !== 'nome' && !!f.nomeFuncionario && !nomesBatem(f.nomeFuncionario, l.colaborador.nome);
  };

  const lista = useMemo(() => {
    const termo = chaveSolta(busca);
    const dig = soDigitos(busca);
    return ordenadas.filter(f => {
      const l = porFicha.get(f.id);
      if (filtro === 'identificadas' && !l) return false;
      if (filtro === 'nao' && l) return false;
      if (filtro === 'nome_diferente' && !nomeDiferente(f)) return false;
      if (!termo && !dig) return true;
      return (termo && (chaveSolta(f.nomeFuncionario ?? '').includes(termo) || chaveSolta(l?.colaborador.nome ?? '').includes(termo)
        || chaveSolta(f.posto ?? '').includes(termo)))
        || (dig && (soDigitos(f.cpf).includes(dig) || soDigitos(f.matricula).startsWith(dig) || String(f.numero ?? '') === dig
          || String(l?.colaborador.num_cad ?? '').startsWith(dig)));
    });
  }, [ordenadas, porFicha, filtro, busca]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visiveis = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const naoIdentificadasComCpf = ordenadas.filter(f => !porFicha.has(f.id) && cpfValido(f.cpf));

  async function procurarPeloCpf() {
    const cpfs = [...new Set(naoIdentificadasComCpf.map(f => soDigitos(f.cpf).padStart(11, '0')))]
      .filter(c => !procuras.has(c));
    if (!cpfs.length) return toast.info('Nenhuma ficha sem dono com CPF para procurar.');
    setProcurando({ feitos: 0, total: cpfs.length });
    const novas = new Map(procuras);
    for (const [i, cpf] of cpfs.entries()) {
      try {
        novas.set(cpf, { colaborador: await consultarColaboradorSeniorPorCpf(cpf, { semPosto: true }) });
      } catch (e) {
        novas.set(cpf, { erro: e instanceof Error ? e.message : 'Falha ao consultar' });
      }
      setProcurando({ feitos: i + 1, total: cpfs.length });
      if ((i + 1) % 5 === 0) setProcuras(new Map(novas));
    }
    setProcuras(novas);
    setProcurando(null);
    const achados = [...novas.values()].filter(p => 'colaborador' in p).length;
    toast.success(`Procura concluída: ${achados} de ${novas.size} CPF(s) encontrados na Senior.`);
  }

  const procuraDe = (f: EPIFicha) => (cpfValido(f.cpf) ? procuras.get(soDigitos(f.cpf).padStart(11, '0')) : undefined);

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <CardTitle className="text-base">
          {ordenadas.length} ficha(s)
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            · {identificadas} identificadas na Senior · {ordenadas.length - identificadas} sem colaborador na lista
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            {([['todas', 'Todas'], ['identificadas', 'Identificadas'], ['nao', 'Não identificadas'], ['nome_diferente', 'Nome diferente']] as const)
              .map(([id, rotulo]) => (
                <button key={id} type="button" onClick={() => { setFiltro(id); setPagina(0); }}
                  className={`px-3 py-1 text-xs rounded ${filtro === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {rotulo}
                </button>
              ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 w-64" value={busca} placeholder="Nome, CPF, matrícula ou nº da ficha"
              onChange={e => { setBusca(e.target.value); setPagina(0); }} />
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={!!procurando || !naoIdentificadasComCpf.length} onClick={procurarPeloCpf}
              title="Consulta na Senior o CPF das fichas sem colaborador na lista (acha também demitidos)">
              {procurando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserSearch className="h-4 w-4 mr-1" />}
              {procurando ? `Procurando ${procurando.feitos}/${procurando.total}…` : `Procurar as não identificadas na Senior (${naoIdentificadasComCpf.length})`}
            </Button>
            <Button variant="outline" size="sm" disabled={!lista.length} onClick={() => baixarExcel(lista, porFicha, procuraDe)}>
              <Download className="h-4 w-4 mr-1" /> Baixar Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {carregando ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ficha</TableHead>
                  <TableHead>Colaborador na ficha</TableHead>
                  <TableHead>Colaborador na Senior</TableHead>
                  <TableHead>Ligado por</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(f => {
                  const l = porFicha.get(f.id);
                  const p = procuraDe(f);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{f.numero ? `Nº ${f.numero}` : '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.dataEntrega ? formatarData(f.dataEntrega) : '—'} · {f.uf} · {f.status === 'assinada' ? 'assinada' : 'pendente'}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <div className="truncate">{f.nomeFuncionario || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.cpf ? formatCpf(soDigitos(f.cpf).padStart(11, '0')) : 'sem CPF'} · mat. {f.matricula || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[20rem]">
                        {l ? (
                          <>
                            <div className="truncate font-medium">{l.colaborador.nome}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              mat. {l.colaborador.num_cad} · {EMPRESA[l.colaborador.num_emp] ?? `Emp. ${l.colaborador.num_emp}`}
                              {' · '}{l.colaborador.ativo ? (l.colaborador.situacao_descricao ?? '—') : 'desligado'}
                              {l.colaborador.cargo && ` · ${l.colaborador.cargo}`}
                            </div>
                          </>
                        ) : p && 'colaborador' in p ? (
                          <>
                            <div className="truncate font-medium">{p.colaborador.nome}</div>
                            <div className="text-xs text-amber-700 truncate">
                              achado pelo CPF: mat. {p.colaborador.numCad} · {EMPRESA[p.colaborador.numEmp] ?? `Emp. ${p.colaborador.numEmp}`}
                              {' · '}{p.colaborador.situacaoDescricao ?? '—'}
                            </div>
                          </>
                        ) : p && 'erro' in p ? (
                          <span className="text-xs text-red-700">{p.erro}</span>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Não identificada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l && <Badge variant="secondary">{ROTULO_FORMA[l.forma]}</Badge>}
                        {nomeDiferente(f) && (
                          <Badge variant="outline" className="ml-1 bg-amber-100 text-amber-800 border-amber-200" title="O nome digitado na ficha é diferente do nome na Senior">
                            Nome diferente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm"><Link to={`/ficha/${f.id}`}>Abrir</Link></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!visiveis.length && (
                  <TableRow><TableCell colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma ficha.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {lista.length > POR_PAGINA && (
          <div className="flex items-center justify-between border-t p-3 text-sm">
            <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas} · {lista.length} ficha(s)</span>
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

async function baixarExcel(
  fichas: EPIFicha[],
  porFicha: Map<string, { colaborador: ColaboradorLista; forma: FormaLigacao }>,
  procuraDe: (f: EPIFicha) => Procura | undefined,
) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fichas x Senior');
  ws.columns = [
    { header: 'Nº ficha', key: 'numero', width: 9 },
    { header: 'Entrega', key: 'entrega', width: 11 },
    { header: 'Estado', key: 'uf', width: 7 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Nome na ficha', key: 'nomeFicha', width: 34 },
    { header: 'CPF na ficha', key: 'cpfFicha', width: 15 },
    { header: 'Matrícula na ficha', key: 'matFicha', width: 14 },
    { header: 'Posto na ficha', key: 'posto', width: 28 },
    { header: 'Resultado', key: 'resultado', width: 22 },
    { header: 'Ligado por', key: 'forma', width: 11 },
    { header: 'Nome na Senior', key: 'nomeSenior', width: 34 },
    { header: 'Matrícula Senior', key: 'matSenior', width: 14 },
    { header: 'Empresa', key: 'empresa', width: 9 },
    { header: 'Situação na Senior', key: 'situacao', width: 20 },
    { header: 'Cargo', key: 'cargo', width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const f of fichas) {
    const l = porFicha.get(f.id);
    const p = procuraDe(f);
    const achado = p && 'colaborador' in p ? p.colaborador : null;
    ws.addRow({
      numero: f.numero ?? '', entrega: f.dataEntrega ? formatarData(f.dataEntrega) : '', uf: f.uf,
      status: f.status === 'assinada' ? 'assinada' : 'pendente', nomeFicha: f.nomeFuncionario, cpfFicha: f.cpf,
      matFicha: f.matricula, posto: f.posto,
      resultado: l ? (nomesBatem(f.nomeFuncionario ?? '', l.colaborador.nome) || l.forma === 'nome' ? 'Identificada' : 'Identificada (nome diferente)')
        : achado ? 'Achada pelo CPF (fora da lista)' : p && 'erro' in p ? `Não achada: ${p.erro}` : 'Não identificada',
      forma: l ? ROTULO_FORMA[l.forma] : achado ? 'CPF' : '',
      nomeSenior: l?.colaborador.nome ?? achado?.nome ?? '',
      matSenior: l?.colaborador.num_cad ?? achado?.numCad ?? '',
      empresa: l ? EMPRESA[l.colaborador.num_emp] ?? l.colaborador.num_emp : achado ? EMPRESA[achado.numEmp] ?? achado.numEmp : '',
      situacao: l ? (l.colaborador.ativo ? l.colaborador.situacao_descricao : 'Desligado') : achado?.situacaoDescricao ?? '',
      cargo: l?.colaborador.cargo ?? achado?.cargo ?? '',
    });
  }
  ws.autoFilter = { from: 'A1', to: 'O1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `fichas-x-senior-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
