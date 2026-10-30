import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDown, ArrowUp, Download, Equal, Loader2, Receipt, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  ROTULO_VARIACAO, classificarVariacao, dataBr, formatarMoeda, formatarNumero, hojeBr, listMateriais, listPrecos,
  type LinhaPreco, type Material, type TipoVariacao,
} from '../lib/pedidosService';
import RegistrarCompra from '../components/RegistrarCompra';

/**
 * Variação de preço: cada item de nota comparado com a compra anterior do
 * mesmo material no mesmo fornecedor. Separa o que aumentou, manteve e baixou.
 */

const ICONE: Record<TipoVariacao, typeof ArrowUp> = { aumentou: ArrowUp, manteve: Equal, baixou: ArrowDown, primeira: Sparkles };
const COR: Record<TipoVariacao, string> = {
  aumentou: 'text-destructive', manteve: 'text-muted-foreground', baixou: 'text-emerald-600 dark:text-emerald-400', primeira: 'text-muted-foreground',
};
const TIPOS: TipoVariacao[] = ['aumentou', 'manteve', 'baixou', 'primeira'];

const diasAtras = (n: number) => {
  const d = new Date(hojeBr() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

export default function RelatorioPrecos() {
  const { can } = useAuth();
  const [inicio, setInicio] = useState(diasAtras(90));
  const [fim, setFim] = useState(hojeBr());
  const [linhas, setLinhas] = useState<LinhaPreco[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [tipo, setTipo] = useState<TipoVariacao | 'todos'>('todos');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [avulsa, setAvulsa] = useState(false);

  const carregar = useCallback(async () => {
    if (!inicio || !fim || inicio > fim) return;
    setCarregando(true);
    try {
      const [l, m] = await Promise.all([listPrecos(inicio, fim), listMateriais()]);
      setLinhas(l); setMateriais(m);
    } catch (e) {
      toast.error('Erro ao carregar: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim]);
  useEffect(() => { carregar(); }, [carregar]);

  const classificadas = useMemo(() => linhas.map(l => {
    const v = classificarVariacao(l.valor_unitario, l.valor_anterior);
    // Quanto a diferença de preço custou (ou economizou) nesta compra.
    const impacto = l.valor_anterior == null ? 0 : (l.valor_unitario - l.valor_anterior) * l.quantidade;
    return { ...l, ...v, impacto };
  }), [linhas]);

  const termo = busca.trim().toLowerCase();
  const filtradas = classificadas.filter(l => (tipo === 'todos' || l.tipo === tipo)
    && (!termo || l.material_nome.toLowerCase().includes(termo) || l.fornecedor_nome.toLowerCase().includes(termo) || (l.numero_nf ?? '').includes(termo)));

  const contagem = (t: TipoVariacao) => classificadas.filter(l => l.tipo === t).length;
  const impactoTipo = (t: TipoVariacao) => classificadas.filter(l => l.tipo === t).reduce((s, l) => s + l.impacto, 0);

  const exportar = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Variação de preço');
    ws.columns = [
      { header: 'Data da compra', key: 'data', width: 14 },
      { header: 'Material', key: 'material', width: 32 },
      { header: 'Unidade', key: 'unidade', width: 9 },
      { header: 'Fornecedor', key: 'fornecedor', width: 34 },
      { header: 'NF', key: 'nf', width: 12 },
      { header: 'Quantidade', key: 'qtd', width: 11 },
      { header: 'Preço anterior', key: 'anterior', width: 14, style: { numFmt: '"R$" #,##0.00##' } },
      { header: 'Compra anterior em', key: 'data_ant', width: 16 },
      { header: 'Preço atual', key: 'atual', width: 13, style: { numFmt: '"R$" #,##0.00##' } },
      { header: 'Variação (%)', key: 'pct', width: 12, style: { numFmt: '0.00' } },
      { header: 'Situação', key: 'situacao', width: 16 },
      { header: 'Impacto na compra (R$)', key: 'impacto', width: 20, style: { numFmt: '"R$" #,##0.00' } },
    ];
    ws.getRow(1).font = { bold: true };
    for (const l of filtradas) {
      ws.addRow({
        data: dataBr(l.data_compra), material: l.material_nome, unidade: l.unidade, fornecedor: l.fornecedor_nome,
        nf: l.numero_nf ?? '', qtd: l.quantidade, anterior: l.valor_anterior ?? '', data_ant: dataBr(l.data_anterior),
        atual: l.valor_unitario, pct: l.percentual ?? '', situacao: ROTULO_VARIACAO[l.tipo], impacto: l.valor_anterior == null ? '' : l.impacto,
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `variacao-de-preco-${inicio}-a-${fim}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Variação de Preço dos Materiais" eyebrow="Pedidos"
          description="Cada compra comparada com a compra anterior do mesmo material no mesmo fornecedor."
          actions={<>
            {can('pedidos_material', 'create') && (
              <Button variant="outline" className="gap-2" onClick={() => setAvulsa(true)}><Receipt className="h-4 w-4" /> Registrar compra avulsa</Button>
            )}
            <Button className="gap-2" onClick={exportar} disabled={filtradas.length === 0}><Download className="h-4 w-4" /> Excel</Button>
          </>} />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ini">De</Label>
            <Input id="ini" type="date" value={inicio} max={fim} onChange={e => setInicio(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label htmlFor="fim">Até</Label>
            <Input id="fim" type="date" value={fim} min={inicio} max={hojeBr()} onChange={e => setFim(e.target.value)} className="w-40" />
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Material, fornecedor ou NF" value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {TIPOS.map(t => {
            const Icone = ICONE[t];
            const impacto = impactoTipo(t);
            return (
              <button key={t} type="button" onClick={() => setTipo(atual => (atual === t ? 'todos' : t))}
                className={`text-left rounded-lg border bg-card p-4 transition hover:bg-muted/50 ${tipo === t ? 'ring-2 ring-primary' : ''}`}
                aria-pressed={tipo === t}>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Icone className={`h-3.5 w-3.5 ${COR[t]}`} /> {ROTULO_VARIACAO[t]}</p>
                <p className="text-2xl font-bold tabular-nums">{contagem(t)}</p>
                {(t === 'aumentou' || t === 'baixou') && (
                  <p className="text-xs text-muted-foreground">
                    {t === 'aumentou' ? 'Custo a mais' : 'Economia'}: {formatarMoeda(Math.abs(impacto))}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compra</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço anterior</TableHead>
                  <TableHead className="text-right">Preço atual</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                )}
                {!carregando && filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Nenhuma compra registrada no período.
                  </TableCell></TableRow>
                )}
                {!carregando && filtradas.map(l => {
                  const Icone = ICONE[l.tipo];
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{dataBr(l.data_compra)}{l.numero_nf && <span className="block text-xs text-muted-foreground">NF {l.numero_nf}</span>}</TableCell>
                      <TableCell>{l.material_nome} <span className="text-xs text-muted-foreground">{l.unidade}</span></TableCell>
                      <TableCell>{l.fornecedor_nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarNumero(l.quantidade)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatarMoeda(l.valor_anterior)}
                        {l.data_anterior && <span className="block text-xs text-muted-foreground">{dataBr(l.data_anterior)}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(l.valor_unitario)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${COR[l.tipo]}`}>{pct(l.percentual)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 whitespace-nowrap"><Icone className={`h-3 w-3 ${COR[l.tipo]}`} /> {ROTULO_VARIACAO[l.tipo]}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {avulsa && (
        <RegistrarCompra pedido={null} materiais={materiais.filter(m => m.ativo)} onFechar={() => setAvulsa(false)}
          onSalvo={async () => { setAvulsa(false); await carregar(); }} />
      )}
    </div>
  );
}
