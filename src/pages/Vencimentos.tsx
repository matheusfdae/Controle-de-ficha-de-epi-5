import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, CheckCircle2, Shirt, HardHat, Download, Printer } from 'lucide-react';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichas } from '@/services/fichaService';
import { getConfig } from '@/services/configService';
import { getItemValidade } from '@/lib/validade';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import EstadoSelect, { TODOS_ESTADOS, useEstadoLembrado } from '@/components/EstadoSelect';
import { listEpis } from '@/services/estoqueService';
import {
  ConvocacaoUniforme, DIAS_AVISO, MESES_TROCA, calcularTrocasUniforme, criarClassificador, formatarData, situacaoTexto,
} from '@/lib/convocacaoUniforme';
import BackButton from '@/components/BackButton';

interface VencimentoItem {
  fichaId: string;
  nomeFuncionario: string;
  item: EPIItem;
  diasRestantes: number;
}

function StatusBadge({ dias }: { dias: number }) {
  return (
    <Badge
      variant="secondary"
      className={
        dias <= 0
          ? 'bg-destructive/10 text-destructive border-destructive/20'
          : dias <= 30
          ? 'bg-warning/10 text-warning border-warning/20'
          : 'bg-success/10 text-success border-success/20'
      }
    >
      {dias <= 0 ? `Vencido há ${Math.abs(dias)}d` : `${dias}d restantes`}
    </Badge>
  );
}

function SummaryCards({
  vencidos, proximos, emDia, filtro, setFiltro,
}: {
  vencidos: number; proximos: number; emDia: number;
  filtro: string; setFiltro: (f: any) => void;
}) {
  return (
    <div className="grid gap-3 grid-cols-3">
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'vencidos' ? 'todos' : 'vencidos')}>
        <CardContent className="p-4 text-center">
          <AlertTriangle className={`h-6 w-6 mx-auto mb-1 ${filtro === 'vencidos' ? 'text-destructive' : 'text-destructive/50'}`} />
          <p className="text-2xl font-bold text-foreground">{vencidos}</p>
          <p className="text-xs text-muted-foreground">Vencidos</p>
        </CardContent>
      </Card>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'proximos' ? 'todos' : 'proximos')}>
        <CardContent className="p-4 text-center">
          <Clock className={`h-6 w-6 mx-auto mb-1 ${filtro === 'proximos' ? 'text-warning' : 'text-warning/50'}`} />
          <p className="text-2xl font-bold text-foreground">{proximos}</p>
          <p className="text-xs text-muted-foreground">Próximos (30d)</p>
        </CardContent>
      </Card>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'ok' ? 'todos' : 'ok')}>
        <CardContent className="p-4 text-center">
          <CheckCircle2 className={`h-6 w-6 mx-auto mb-1 ${filtro === 'ok' ? 'text-success' : 'text-success/50'}`} />
          <p className="text-2xl font-bold text-foreground">{emDia}</p>
          <p className="text-xs text-muted-foreground">Em Dia</p>
        </CardContent>
      </Card>
    </div>
  );
}

function EpisPanel() {
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'vencidos' | 'proximos' | 'ok'>('todos');

  const [ehUniforme, setEhUniforme] = useState<(i: EPIItem) => boolean>(() => () => false);
  useEffect(() => {
    getFichas({ semAssinaturas: true }).then(setFichas);
    // Item de uniforme não tem validade de EPI: fica na aba Uniformes.
    listEpis()
      .then(cat => { const tipo = criarClassificador(cat); setEhUniforme(() => (i: EPIItem) => tipo(i) === 'uniforme'); })
      .catch(() => {});
  }, []);

  const hoje = new Date();
  const cfg = getConfig();
  const vencimentos: VencimentoItem[] = [];
  fichas.forEach(ficha => {
    ficha.itens.forEach(item => {
      if (ehUniforme(item)) return;
      const validadeStr = getItemValidade(item, ficha, cfg.diasValidadeEpi);
      if (validadeStr) {
        const validade = new Date(validadeStr);
        const diff = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        vencimentos.push({
          fichaId: ficha.id, nomeFuncionario: ficha.nomeFuncionario,
          item: { ...item, dataValidade: validadeStr }, diasRestantes: diff,
        });
      }
    });
  });

  const vencidos = vencimentos.filter(v => v.diasRestantes <= 0);
  const proximos = vencimentos.filter(v => v.diasRestantes > 0 && v.diasRestantes <= 30);
  const emDia = vencimentos.filter(v => v.diasRestantes > 30);
  const filtrados = filtro === 'vencidos' ? vencidos
    : filtro === 'proximos' ? proximos
    : filtro === 'ok' ? emDia
    : vencimentos;
  const sorted = [...filtrados].sort((a, b) => a.diasRestantes - b.diasRestantes);

  return (
    <div className="space-y-6">
      <SummaryCards vencidos={vencidos.length} proximos={proximos.length} emDia={emDia.length} filtro={filtro} setFiltro={setFiltro} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Itens de EPI <span className="text-muted-foreground font-normal ml-2">({sorted.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum item com data de validade.</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((v, i) => (
                <Link key={i} to={`/ficha/${v.fichaId}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    {v.diasRestantes <= 0 ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                      : v.diasRestantes <= 30 ? <Clock className="h-5 w-5 text-warning shrink-0" />
                      : <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{v.item.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.nomeFuncionario} · CA: {v.item.ca || '—'} · Validade: {v.item.dataValidade}
                      </p>
                    </div>
                    <StatusBadge dias={v.diasRestantes} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UniformesPanel() {
  const [trocas, setTrocas] = useState<ConvocacaoUniforme[]>([]);
  // 'convocacao' (padrão) = vencidos + próximos; os demais vêm dos cartões.
  const [filtro, setFiltro] = useState<FiltroUniforme>('convocacao');
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useEstadoLembrado('vencimentos-uniforme', true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getFichas({ semAssinaturas: true }), listEpis()])
      .then(([fichas, catalogo]) => setTrocas(calcularTrocasUniforme(fichas, catalogo)))
      .catch(e => toast.error(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, []);

  const doEstado = trocas.filter(t => uf === TODOS_ESTADOS || t.uf === uf);
  const vencidos = doEstado.filter(t => t.situacao === 'vencido');
  const proximos = doEstado.filter(t => t.situacao === 'proximo');
  const emDia = doEstado.filter(t => t.situacao === 'em_dia');
  const base = filtro === 'vencidos' ? vencidos : filtro === 'proximos' ? proximos : filtro === 'ok' ? emDia
    : filtro === 'todos' ? doEstado : [...vencidos, ...proximos];
  const termo = busca.trim().toLowerCase();
  const lista = base.filter(t => !termo || [t.nome, t.cpf, t.matricula, t.posto, t.funcao]
    .some(v => (v || '').toLowerCase().includes(termo)));
  const titulo = filtro === 'vencidos' ? 'Trocas vencidas' : filtro === 'proximos' ? `Vencem em até ${DIAS_AVISO} dias`
    : filtro === 'ok' ? 'Em dia' : filtro === 'todos' ? 'Todos os colaboradores' : 'Lista de convocação';

  return (
    <div className="space-y-6">
      <SummaryCards vencidos={vencidos.length} proximos={proximos.length} emDia={emDia.length}
        filtro={filtro} setFiltro={(f: FiltroUniforme) => setFiltro(f === 'todos' ? 'convocacao' : f)} />
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {titulo} <span className="text-muted-foreground font-normal ml-1">({lista.length})</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Troca a cada {MESES_TROCA} meses, contados da assinatura da última ficha de uniforme do colaborador.
                {filtro === 'convocacao' && ` Mostra os vencidos e quem vence em até ${DIAS_AVISO} dias.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!lista.length} onClick={() => baixarExcelConvocacao(lista, titulo)}>
                <Download className="h-4 w-4 mr-1" /> Baixar Excel
              </Button>
              <Button variant="outline" size="sm" disabled={!lista.length} onClick={() => imprimirConvocacao(lista, titulo)}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar colaborador, CPF, posto..." value={busca} onChange={e => setBusca(e.target.value)}
              className="max-w-xs" />
            <EstadoSelect value={uf} onChange={setUf} permitirTodos className="w-44" />
            {filtro !== 'convocacao' && (
              <Button variant="ghost" size="sm" onClick={() => setFiltro('convocacao')}>Voltar à convocação</Button>
            )}
            {filtro !== 'todos' && (
              <Button variant="ghost" size="sm" onClick={() => setFiltro('todos')}>Ver todos</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {trocas.length === 0 ? 'Nenhuma ficha de uniforme assinada.' : 'Ninguém nesta lista.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="hidden md:table-cell">Posto</TableHead>
                  <TableHead className="hidden lg:table-cell">Função</TableHead>
                  <TableHead>Assinada em</TableHead>
                  <TableHead>Troca em</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map(t => (
                  <TableRow key={t.chave}>
                    <TableCell>
                      <Link to={`/ficha/${t.fichaId}`} className="font-medium hover:underline">{t.nome}</Link>
                      <div className="text-xs text-muted-foreground">
                        {[t.cpf && `CPF ${t.cpf}`, t.matricula && `Mat. ${t.matricula}`, t.fichaNumero && `Ficha #${t.fichaNumero}`]
                          .filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {t.posto || '—'} <Badge variant="outline" className="ml-1 font-mono">{t.uf}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{t.funcao || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(t.dataAssinatura)}
                      {t.semDataAssinatura && <div className="text-[10px] text-muted-foreground">(data de entrega)</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatarData(t.dataTroca)}</TableCell>
                    <TableCell><StatusBadge dias={t.diasRestantes} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type FiltroUniforme = 'convocacao' | 'todos' | 'vencidos' | 'proximos' | 'ok';


async function baixarExcelConvocacao(lista: ConvocacaoUniforme[], titulo: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Convocação');
  ws.columns = [
    { header: 'Colaborador', key: 'nome', width: 36 },
    { header: 'CPF', key: 'cpf', width: 16 },
    { header: 'Matrícula', key: 'matricula', width: 12 },
    { header: 'Função', key: 'funcao', width: 22 },
    { header: 'Posto', key: 'posto', width: 30 },
    { header: 'Estado', key: 'uf', width: 8 },
    { header: 'Ficha', key: 'ficha', width: 8 },
    { header: 'Assinada em', key: 'assinatura', width: 13 },
    { header: 'Troca em', key: 'troca', width: 13 },
    { header: 'Situação', key: 'situacao', width: 22 },
    { header: 'Itens de uniforme', key: 'itens', width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const t of lista) {
    ws.addRow({
      nome: t.nome, cpf: t.cpf, matricula: t.matricula, funcao: t.funcao, posto: t.posto, uf: t.uf,
      ficha: t.fichaNumero ?? '', assinatura: formatarData(t.dataAssinatura), troca: formatarData(t.dataTroca),
      situacao: situacaoTexto(t), itens: t.itens.join(', '),
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function imprimirConvocacao(lista: ConvocacaoUniforme[], titulo: string) {
  const esc = (v: string | number | undefined) =>
    String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const linhas = lista.map(t => `<tr>
    <td>${esc(t.nome)}</td><td>${esc(t.cpf)}</td><td>${esc(t.matricula)}</td><td>${esc(t.funcao)}</td>
    <td>${esc(t.posto)} (${esc(t.uf)})</td><td>${esc(formatarData(t.dataAssinatura))}</td>
    <td>${esc(formatarData(t.dataTroca))}</td><td>${esc(situacaoTexto(t))}</td><td class="ass"></td></tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) { toast.error('O navegador bloqueou a janela de impressão.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <style>
      body { font: 12px system-ui, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 12px; color: #555; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #e8eef9; } td.ass { width: 140px; }
      @page { size: A4 landscape; margin: 12mm; }
    </style></head><body>
    <h1>Convocação para troca de uniforme — ${esc(titulo)}</h1>
    <p>Gerado em ${new Date().toLocaleString('pt-BR')} · ${lista.length} colaborador(es) · troca a cada ${MESES_TROCA} meses da assinatura.</p>
    <table><thead><tr><th>Colaborador</th><th>CPF</th><th>Matrícula</th><th>Função</th><th>Posto</th>
    <th>Assinada em</th><th>Troca em</th><th>Situação</th><th>Assinatura</th></tr></thead>
    <tbody>${linhas}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export default function Vencimentos() {
  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Controle de Vencimentos</h2>
          <p className="text-sm text-muted-foreground">Acompanhe validades de EPIs e trocas programadas de uniforme.</p>
        </div>

        <Tabs defaultValue="epis" className="w-full">
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="epis"><HardHat className="h-4 w-4 mr-1" /> EPIs</TabsTrigger>
            <TabsTrigger value="uniformes"><Shirt className="h-4 w-4 mr-1" /> Uniformes</TabsTrigger>
          </TabsList>
          <TabsContent value="epis" className="mt-6"><EpisPanel /></TabsContent>
          <TabsContent value="uniformes" className="mt-6"><UniformesPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
