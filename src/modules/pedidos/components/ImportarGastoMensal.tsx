import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos } from '@/services/postosService';
import { reais } from '../lib/pedidosService';
import { acharPosto, type AbaPosto, type PostoCadastrado } from '../lib/planilhaPostos';
import { acumulado, lerAbaGasto, valorCelula, type Celula, type PlanilhaGasto } from '../lib/planilhaGasto';
import { importarGastoMensal } from '../lib/gastoMensalService';

/**
 * Importa a planilha "Controle de gasto mensal ... Por posto" (uma aba por posto)
 * para a tela Controle de gasto mensal. Lê no navegador, mostra cada aba com o
 * posto do sistema que ela vai usar e só grava ao confirmar.
 */

const SEM_POSTO = '__sem__';
interface Linha { planilha: PlanilhaGasto; incluir: boolean; posto: string; uf: string }

/** Ano mais comum nas datas de faturamento (a planilha é de um ano só). */
function anoDaPlanilha(abas: PlanilhaGasto[]): number {
  const cont = new Map<number, number>();
  for (const a of abas) for (const m of a.meses) for (const f of m.faturamento) {
    const ano = Number(f.slice(0, 4));
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) cont.set(ano, (cont.get(ano) ?? 0) + 1);
  }
  return [...cont].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getFullYear();
}

export default function ImportarGastoMensal({ onImportado, rotulo = 'Importar planilha' }: { onImportado: (ano: number) => void; rotulo?: string }) {
  const { estados } = useAuth();
  const arquivo = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [postos, setPostos] = useState<PostoCadastrado[]>([]);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  const ler = async (f: File) => {
    setLendo(true);
    try {
      const [ExcelJS, po] = await Promise.all([import('exceljs').then(x => x.default), listPostos()]);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const abas: PlanilhaGasto[] = [];
      wb.eachSheet(ws => {
        const grade: Celula[][] = [];
        const formulas: (string | null)[][] = [];
        ws.eachRow({ includeEmpty: true }, (row, r) => {
          grade[r - 1] = [];
          formulas[r - 1] = [];
          row.eachCell({ includeEmpty: true }, (c, col) => {
            grade[r - 1][col - 1] = valorCelula(c.value);
            const v = c.value as { formula?: string } | null;
            formulas[r - 1][col - 1] = v && typeof v === 'object' && typeof v.formula === 'string' ? `=${v.formula}` : null;
          });
        });
        const a = lerAbaGasto(ws.name, grade, formulas);
        if (a && a.secoes.some(s => s.itens.length)) abas.push(a);
      });
      if (!abas.length) { toast.error('Nenhuma aba de posto encontrada (POSTO:, ITEM e os meses JAN–DEZ).'); return; }
      const cad = po.filter(p => p.ativo).map(p => ({ id: p.id, nome: p.nome, uf: p.uf }));
      setPostos(cad);
      setLinhas(abas.map(a => {
        const achado = acharPosto(a as unknown as AbaPosto, cad);
        const uf = achado?.uf ?? a.uf;
        return { planilha: a, incluir: estados.includes(uf), posto: achado?.id ?? SEM_POSTO, uf };
      }));
      setAno(anoDaPlanilha(abas));
      setNomeArquivo(f.name);
      setAberto(true);
    } catch (e) { toast.error('Não foi possível ler a planilha: ' + (e as Error).message); }
    finally { setLendo(false); if (arquivo.current) arquivo.current.value = ''; }
  };

  const mudar = (i: number, d: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...d } : l)));
  const marcadas = linhas.filter(l => l.incluir);
  const semAcesso = marcadas.filter(l => !estados.includes(l.uf));

  const importar = async () => {
    if (!marcadas.length) return toast.error('Marque ao menos um posto.');
    if (semAcesso.length) return toast.error(`Sem acesso ao estado de: ${semAcesso.map(l => l.planilha.aba).join(', ')}.`);
    setGravando(true);
    try {
      await importarGastoMensal(ano, linhas.map((l, ordem) => ({ l, ordem })).filter(x => x.l.incluir).map(({ l, ordem }) => ({
        planilha: l.planilha, ordem, uf: l.uf, posto_id: l.posto === SEM_POSTO ? null : l.posto,
      })));
      toast.success(`${marcadas.length} posto(s) importado(s) em ${ano}.`);
      setAberto(false);
      onImportado(ano);
    } catch (e) { toast.error('Erro ao importar: ' + (e as Error).message); }
    finally { setGravando(false); }
  };

  return (
    <>
      <input ref={arquivo} type="file" accept=".xlsx" className="hidden" onChange={e => e.target.files?.[0] && ler(e.target.files[0])} />
      <Button variant="outline" onClick={() => arquivo.current?.click()} disabled={lendo}>
        {lendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
        {rotulo}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar controle de gasto mensal</DialogTitle>
            <DialogDescription>
              {nomeArquivo} — {linhas.length} postos. Confira o posto do sistema de cada aba. A aba que já foi importada
              no mesmo ano é substituída pela da planilha.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-end gap-3">
            <div>
              <Label htmlFor="gasto-ano">Ano</Label>
              <Input id="gasto-ano" type="number" min={2020} max={2100} value={ano} onChange={e => setAno(Number(e.target.value) || ano)} className="w-28" />
            </div>
            <p className="text-sm text-muted-foreground pb-2">{marcadas.length} de {linhas.length} marcados</p>
          </div>
          <div className="overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-0" />
                  <TableHead>Aba</TableHead>
                  <TableHead>Posto no sistema</TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Previsto no ano</TableHead>
                  <TableHead className="text-right">Aplicado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => {
                  const ac = acumulado(l.planilha.meses);
                  const itens = l.planilha.secoes.reduce((s, x) => s + x.itens.length, 0);
                  return (
                    <TableRow key={l.planilha.aba} className={l.incluir ? '' : 'opacity-50'}>
                      <TableCell><Checkbox checked={l.incluir} onCheckedChange={v => mudar(i, { incluir: !!v })} aria-label={`Importar ${l.planilha.aba}`} /></TableCell>
                      <TableCell>
                        <div className="font-medium">{l.planilha.aba}</div>
                        <div className="text-xs text-muted-foreground">{l.planilha.posto} · {l.planilha.custoTexto || 'sem custo'}</div>
                        {l.planilha.avisos.length > 0 && (
                          <div className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{l.planilha.avisos.join(' ')}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select value={l.posto} onValueChange={v => mudar(i, { posto: v, uf: postos.find(p => p.id === v)?.uf ?? l.uf })}>
                          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SEM_POSTO}>— Sem vínculo (só o nome da aba) —</SelectItem>
                            {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.uf})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><EstadoSelect value={l.uf} onChange={uf => mudar(i, { uf })} className="w-20" /></TableCell>
                      <TableCell className="text-right tabular-nums">{itens}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(ac.previsto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(ac.aplicado)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {semAcesso.length > 0 && (
            <p className="text-sm text-destructive">Seu usuário não tem acesso ao estado de: {semAcesso.map(l => `${l.planilha.aba} (${l.uf})`).join(', ')}. Desmarque ou peça o acesso.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={importar} disabled={gravando || !marcadas.length}>
              {gravando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Importar {marcadas.length} posto(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
