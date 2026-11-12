import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Copy, Download, Gauge, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import {
  dataBr, excluirMovimentacao, horaBr, listarMovimentacoes, type Movimentacao,
} from '../lib/movimentacaoService';

const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const chave = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Numero({ titulo, valor, detalhe, tom, ativo, onClick }: {
  titulo: string; valor: number | string; detalhe?: string; tom?: 'ok' | 'alerta'; ativo?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn('rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60', ativo && 'ring-2 ring-primary')}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn('text-2xl font-bold tabular-nums', tom === 'ok' && 'text-emerald-600 dark:text-emerald-400', tom === 'alerta' && 'text-amber-600 dark:text-amber-400')}>{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </button>
  );
}

const Movimentacoes = () => {
  const { can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const podeExcluir = can('movimentacao', 'delete');

  const hoje = hojeBr();
  // O Painel Gerencial abre esta lista já filtrada (?de=&ate=&busca=&status=).
  const [q] = useSearchParams();
  const dataQ = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(q.get(k) ?? '') ? q.get(k)! : null);
  const statusQ = q.get('status');
  const [de, setDe] = useState(dataQ('de') ?? hoje.slice(0, 8) + '01');
  const [ate, setAte] = useState(dataQ('ate') ?? hoje);
  const [status, setStatus] = useState<'todos' | 'ok' | 'divergente'>(statusQ === 'ok' || statusQ === 'divergente' ? statusQ : 'todos');
  const [empresa, setEmpresa] = useState('todas');
  const [busca, setBusca] = useState(q.get('busca') ?? '');
  const [linhas, setLinhas] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLinhas(await listarMovimentacoes(de, ate)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setCarregando(false); }
  }, [de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const t = chave(busca.trim());
    return linhas.filter(l => (status === 'todos' || l.status === status) && (empresa === 'todas' || l.empresa === empresa)
      && (!t || chave([l.fiscal_nome, l.falta_nome, l.falta_matricula, l.cobertura_nome ?? '', l.cobertura_matricula ?? '', l.posto_nome, l.codigo].join(' ')).includes(t)));
  }, [linhas, status, empresa, busca]);

  const total = linhas.length;
  const ok = linhas.filter(l => l.status === 'ok').length;
  const div = total - ok;
  const semAviso = linhas.filter(l => l.status === 'divergente' && !l.email_avisado_em).length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 1000) / 10}% do total` : '—');

  const linkPublico = `${window.location.origin}/movimentacao-diaria`;
  const copiarLink = () => navigator.clipboard.writeText(linkPublico).then(() => toast.success('Link copiado.'), () => toast.error('Não deu para copiar.'));

  const excluir = async (l: Movimentacao) => {
    if (!(await confirm({ title: 'Excluir lançamento', description: `Excluir o lançamento ${l.codigo} (${dataBr(l.data_movimentacao)}, ${l.falta_nome})?`, confirmLabel: 'Excluir' }))) return;
    try { await excluirMovimentacao(l.id); setLinhas(ls => ls.filter(x => x.id !== l.id)); toast.success('Lançamento excluído.'); }
    catch (e) { toast.error((e as Error).message); }
  };

  const baixarExcel = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimentação');
    ws.columns = [
      { header: 'Código', key: 'codigo', width: 14 }, { header: 'Empresa', key: 'empresa', width: 9 },
      { header: 'Data informada', key: 'data', width: 13 }, { header: 'Lançado em', key: 'lancado', width: 17 },
      { header: 'Status', key: 'status', width: 12 }, { header: 'Fiscal', key: 'fiscal', width: 30 },
      { header: 'Matrícula falta', key: 'fm', width: 13 }, { header: 'Nome falta', key: 'fn', width: 32 },
      { header: 'Matrícula cobertura', key: 'cm', width: 13 }, { header: 'Nome cobertura', key: 'cn', width: 32 },
      { header: 'Posto', key: 'posto', width: 28 }, { header: 'Motivo', key: 'motivo', width: 13 },
      { header: 'Justificativa', key: 'just', width: 30 }, { header: 'Horário', key: 'horario', width: 16 },
      { header: 'Turno', key: 'turno', width: 10 }, { header: 'Cobertura por extra', key: 'extra', width: 10 },
      { header: 'Ocorrências no plantão', key: 'oc', width: 10 }, { header: 'Aviso por e-mail', key: 'aviso', width: 17 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const l of filtradas) {
      ws.addRow({
        codigo: l.codigo, empresa: l.empresa, data: dataBr(l.data_movimentacao), lancado: horaBr(l.created_at),
        status: l.status === 'ok' ? (l.ok_pelo_plantao ? 'OK (plantão noturno)' : 'OK') : 'DIVERGENTE', fiscal: l.fiscal_nome, fm: l.falta_matricula, fn: l.falta_nome,
        cm: l.cobertura_matricula ?? '', cn: l.cobertura_nome ?? 'Ninguém cobriu', posto: l.posto_nome, motivo: l.motivo,
        just: l.justificativa ?? '', horario: l.horario, turno: l.turno, extra: l.cobertura_por_extra ? 'SIM' : 'NÃO',
        oc: l.ocorrencias_plantao ?? '', aviso: l.email_avisado_em ? horaBr(l.email_avisado_em) : '',
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `movimentacao-diaria-${de}-a-${ate}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Fiscalização" title="Movimentação diária"
        description="Faltas e coberturas lançadas pelos fiscais. Data informada diferente do dia do lançamento = DIVERGENTE."
        actions={<>
          {can('movimentacao', 'view') && <Button variant="outline" size="sm" className="gap-1.5" asChild><Link to="/movimentacao/gerencial"><Gauge className="h-4 w-4" /> Painel gerencial</Link></Button>}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copiarLink}><Copy className="h-4 w-4" /> Link do fiscal</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={baixarExcel} disabled={!filtradas.length}><Download className="h-4 w-4" /> Excel</Button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero titulo="Lançamentos" valor={total} detalhe={`${dataBr(de)} a ${dataBr(ate)}`} ativo={status === 'todos'} onClick={() => setStatus('todos')} />
        <Numero titulo="OK" valor={ok} detalhe={pct(ok)} tom="ok" ativo={status === 'ok'} onClick={() => setStatus('ok')} />
        <Numero titulo="Divergentes" valor={div} detalhe={pct(div)} tom="alerta" ativo={status === 'divergente'} onClick={() => setStatus('divergente')} />
        <Numero titulo="Divergentes sem aviso" valor={semAviso} detalhe="e-mail ainda não enviado" tom={semAviso ? 'alerta' : undefined} onClick={() => setStatus('divergente')} />
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div><Label className="text-xs">De (data informada)</Label><Input type="date" value={de} max={ate} onChange={e => e.target.value && setDe(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ate} min={de} onChange={e => e.target.value && setAte(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="MATRIZ">Matriz</SelectItem><SelectItem value="APOIO">Apoio</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="relative sm:col-span-1 lg:col-span-1">
            <Label className="text-xs">Buscar</Label>
            <Search className="absolute left-2.5 bottom-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Fiscal, colaborador, posto" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <Button variant="outline" className="gap-1.5" onClick={carregar} disabled={carregando}>
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Lançado em</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Fiscal</th>
                <th className="px-3 py-2 font-medium">Na falta</th>
                <th className="px-3 py-2 font-medium">Cobertura</th>
                <th className="px-3 py-2 font-medium">Posto</th>
                <th className="px-3 py-2 font-medium">Motivo</th>
                <th className="px-3 py-2 font-medium">Horário</th>
                <th className="px-3 py-2 font-medium">Extra</th>
                <th className="px-3 py-2 font-medium">Aviso</th>
                {podeExcluir && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {carregando && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
              {!carregando && filtradas.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Nenhum lançamento no período.</td></tr>}
              {!carregando && filtradas.map(l => (
                <tr key={l.id} className={cn('align-top', l.status === 'divergente' && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">{dataBr(l.data_movimentacao)}<div className="text-[11px] text-muted-foreground">{l.empresa}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{horaBr(l.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
                      l.status === 'ok' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
                      {l.status === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {l.status === 'ok' ? (l.ok_pelo_plantao ? 'OK · noturno' : 'OK') : 'DIVERGENTE'}
                    </span>
                  </td>
                  <td className="px-3 py-2 min-w-[140px]">{l.fiscal_nome}</td>
                  <td className="px-3 py-2 min-w-[150px]">{l.falta_nome}<div className="text-[11px] text-muted-foreground">{l.falta_matricula}</div></td>
                  <td className="px-3 py-2 min-w-[150px]">{l.cobertura_nome ?? <span className="text-muted-foreground italic">ninguém cobriu</span>}
                    {l.cobertura_matricula && <div className="text-[11px] text-muted-foreground">{l.cobertura_matricula}</div>}</td>
                  <td className="px-3 py-2 min-w-[120px]">{l.posto_nome}</td>
                  <td className="px-3 py-2">{l.motivo}{l.justificativa && <div className="text-[11px] text-muted-foreground max-w-[200px]">{l.justificativa}</div>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.horario}<div className="text-[11px] text-muted-foreground">{l.turno}</div></td>
                  <td className="px-3 py-2">{l.cobertura_por_extra ? 'SIM' : 'NÃO'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {l.status === 'ok' ? '—' : l.email_avisado_em
                      ? <span className="text-emerald-700 dark:text-emerald-400">enviado {horaBr(l.email_avisado_em)}</span>
                      : <span className="text-amber-700 dark:text-amber-400">pendente</span>}
                  </td>
                  {podeExcluir && (
                    <td className="px-2 py-1.5">
                      <Button variant="ghost" size="icon" aria-label={`Excluir ${l.codigo}`} onClick={() => excluir(l)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Quem recebe o e-mail dos lançamentos divergentes: <Link to="/configuracoes" className="text-primary underline">Configurações → E-mail</Link>.
      </p>
      <ConfirmDialog />
    </div>
  );
};

export default Movimentacoes;
