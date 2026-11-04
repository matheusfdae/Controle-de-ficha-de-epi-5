import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Posto } from '@/services/postosService';
import { formatarNumero, hojeBr, nomeMaterial, type Material } from '../lib/pedidosService';
import { consumoDoPosto } from '../lib/estoqueService';
import { consumoDoDia, consumoDoPeriodo, diasDoPeriodo, type PlantaoComItens, type TipoPeriodo } from '../lib/consumo';
import { pdfConsumo } from '../lib/relatoriosPdf';

const dataBr = (d: string) => d.split('-').reverse().join('/');
const mesNome = (m: string) => {
  const t = new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const semana = (d: string) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(`${d}T12:00:00`).getDay()];

/**
 * Consumo do estoque do posto pelos lançamentos: diário (início, recebido,
 * usado e final de cada item), quinzenal (usado por dia, item a item) e
 * mensal (total, média por dia, dias com uso e o dia de maior uso), com PDF.
 */
export default function ConsumoPosto({ posto, materiais, versao }: { posto: Posto; materiais: Material[]; versao: number }) {
  const hoje = hojeBr();
  const [tipo, setTipo] = useState<TipoPeriodo>('mes');
  const [dia, setDia] = useState(hoje);
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [quinzena, setQuinzena] = useState<1 | 2>(Number(hoje.slice(8, 10)) <= 15 ? 1 : 2);
  const [plantoes, setPlantoes] = useState<PlantaoComItens[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const dias = useMemo(() => diasDoPeriodo(tipo, tipo === 'dia' ? dia : `${mes}-01`, quinzena), [tipo, dia, mes, quinzena]);
  useEffect(() => {
    setCarregando(true);
    consumoDoPosto(posto.id, dias[0], dias[dias.length - 1])
      .then(setPlantoes).catch(e => toast.error('Erro ao carregar o consumo: ' + (e as Error).message))
      .finally(() => setCarregando(false));
  }, [posto.id, dias, versao]);

  const nome = (id: string) => nomeMaterial(materiais.find(m => m.id === id), materiais);
  const unidade = (id: string) => materiais.find(m => m.id === id)?.unidade ?? '';
  const doDia = useMemo(() => (tipo === 'dia' ? consumoDoDia(plantoes, dia).sort((a, b) => b.usado - a.usado || nome(a.material_id).localeCompare(nome(b.material_id))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tipo, plantoes, dia, materiais]);
  const periodo = useMemo(() => consumoDoPeriodo(plantoes, dias), [plantoes, dias]);
  const grafico = periodo.dias.map((d, i) => ({ dia: d.slice(8, 10), total: periodo.totalPorDia[i] }));
  const rotulo = tipo === 'dia' ? dataBr(dia)
    : tipo === 'quinzena' ? `${quinzena}ª quinzena de ${mesNome(mes).toLowerCase()} (${dataBr(dias[0]).slice(0, 5)} a ${dataBr(dias[dias.length - 1]).slice(0, 5)})`
      : mesNome(mes);

  const exportar = async () => {
    setGerando(true);
    try { await pdfConsumo({ posto, tipo, rotulo, dias, doDia, periodo, nome, unidade }); }
    catch (e) { toast.error('Não foi possível gerar o PDF: ' + (e as Error).message); }
    finally { setGerando(false); }
  };

  const vazio = tipo === 'dia' ? doDia.length === 0 : periodo.linhas.length === 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Consumo do posto</CardTitle>
        <CardDescription>Quanto de cada produto foi usado, pelos lançamentos do estoque. Média por dia = total ÷ dias com lançamento no período.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Tabs value={tipo} onValueChange={v => setTipo(v as TipoPeriodo)}>
            <TabsList>
              <TabsTrigger value="dia">Diário</TabsTrigger>
              <TabsTrigger value="quinzena">Quinzenal</TabsTrigger>
              <TabsTrigger value="mes">Mensal</TabsTrigger>
            </TabsList>
          </Tabs>
          {tipo === 'dia' ? (
            <div><Label htmlFor="cons-dia">Dia</Label><Input id="cons-dia" type="date" className="w-44" value={dia} max={hoje} onChange={e => e.target.value && setDia(e.target.value)} /></div>
          ) : (
            <div><Label htmlFor="cons-mes">Mês</Label><Input id="cons-mes" type="month" className="w-44" value={mes} max={hoje.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} /></div>
          )}
          {tipo === 'quinzena' && (
            <div>
              <Label>Quinzena</Label>
              <Select value={String(quinzena)} onValueChange={v => setQuinzena(Number(v) as 1 | 2)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1ª (dias 1 a 15)</SelectItem><SelectItem value="2">2ª (16 ao fim)</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />}
          <Button variant="outline" className="gap-2 ml-auto" disabled={carregando || gerando || vazio} onClick={exportar}>
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Exportar PDF
          </Button>
        </div>

        {!carregando && vazio && <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lançamento em {rotulo}.</p>}

        {tipo === 'dia' && doDia.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead><TableHead className="text-right">Iniciou com</TableHead><TableHead className="text-right">Recebeu</TableHead>
                <TableHead className="text-right">Usou</TableHead><TableHead className="text-right">Ficou</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {doDia.map(l => (
                  <TableRow key={l.material_id}>
                    <TableCell>{nome(l.material_id)} <span className="text-xs text-muted-foreground">{unidade(l.material_id)}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{formatarNumero(l.inicio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.recebido ? formatarNumero(l.recebido) : '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${l.usado > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{formatarNumero(l.usado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarNumero(l.final)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {tipo !== 'dia' && periodo.linhas.length > 0 && <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Dias com lançamento: <strong>{periodo.diasLancados.length}</strong> de {dias.length}</span>
            <span>Produtos usados: <strong>{periodo.linhas.filter(l => l.total > 0).length}</strong></span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={v => [`${formatarNumero(Number(v))} (todas as unidades)`, 'Usado no dia']} labelFormatter={d => `Dia ${d}`}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {tipo === 'quinzena' ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="sticky left-0 bg-card min-w-56">Item</TableHead>
                  {dias.map(d => <TableHead key={d} className="text-center px-1.5 min-w-10"><span className="block">{d.slice(8, 10)}</span><span className="block text-[10px] font-normal">{semana(d)}</span></TableHead>)}
                  <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Média/dia</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {periodo.linhas.map(l => (
                    <TableRow key={l.material_id}>
                      <TableCell className="sticky left-0 bg-card text-sm">{nome(l.material_id)} <span className="text-xs text-muted-foreground">{unidade(l.material_id)}</span></TableCell>
                      {l.porDia.map((v, i) => <TableCell key={i} className={`text-center px-1.5 tabular-nums text-sm ${v ? '' : 'text-muted-foreground/50'}`}>{v ? formatarNumero(v) : '·'}</TableCell>)}
                      <TableCell className="text-right tabular-nums font-semibold">{formatarNumero(l.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(l.mediaDia)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead><TableHead className="text-right">Usado no mês</TableHead><TableHead className="text-right">Média por dia</TableHead>
                  <TableHead className="text-right">Dias com uso</TableHead><TableHead className="text-right">Maior uso</TableHead><TableHead className="text-right">Recebido</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {periodo.linhas.map(l => (
                    <TableRow key={l.material_id}>
                      <TableCell>{nome(l.material_id)} <span className="text-xs text-muted-foreground">{unidade(l.material_id)}</span></TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatarNumero(l.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(l.mediaDia)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.diasComUso}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{l.picoDia ? `${formatarNumero(l.pico)} em ${dataBr(l.picoDia).slice(0, 5)}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{l.recebido ? formatarNumero(l.recebido) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>}
      </CardContent>
    </Card>
  );
}
