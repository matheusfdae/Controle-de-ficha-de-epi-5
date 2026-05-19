import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Mov {
  id: string;
  data_mov: string;
  tipo_item: 'epi' | 'uniforme';
  item_id: string;
  tipo_mov: 'entrada' | 'saida' | 'devolucao' | 'descarte';
  quantidade: number;
  motivo: string | null;
  observacao: string | null;
  item_nome?: string;
  item_codigo?: string | null;
}

const tipoMovLabel: Record<string, { label: string; tone: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  entrada: { label: 'Entrada', tone: 'default' },
  saida: { label: 'Saída', tone: 'destructive' },
  devolucao: { label: 'Devolução', tone: 'secondary' },
  descarte: { label: 'Descarte', tone: 'outline' },
};

function isoDay(d: Date) { return d.toISOString().split('T')[0]; }

export default function RelatorioMovimentacoes() {
  const hoje = new Date();
  const inicio = new Date(); inicio.setDate(inicio.getDate() - 30);

  const [from, setFrom] = useState(isoDay(inicio));
  const [to, setTo] = useState(isoDay(hoje));
  const [tipoItem, setTipoItem] = useState<'all' | 'epi' | 'uniforme'>('all');
  const [tipoMov, setTipoMov] = useState<'all' | 'entrada' | 'saida' | 'devolucao' | 'descarte'>('all');
  const [search, setSearch] = useState('');
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const fromIso = new Date(from + 'T00:00:00').toISOString();
      const toIso = new Date(to + 'T23:59:59').toISOString();
      let q = supabase.from('movimentacoes_estoque').select('*')
        .gte('data_mov', fromIso).lte('data_mov', toIso)
        .order('data_mov', { ascending: false });
      if (tipoItem !== 'all') q = q.eq('tipo_item', tipoItem);
      if (tipoMov !== 'all') q = q.eq('tipo_mov', tipoMov);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data || []) as Mov[];

      // resolver nomes
      const epiIds = Array.from(new Set(list.filter(m => m.tipo_item === 'epi').map(m => m.item_id)));
      const uniIds = Array.from(new Set(list.filter(m => m.tipo_item === 'uniforme').map(m => m.item_id)));
      const [{ data: epis }, { data: unis }] = await Promise.all([
        epiIds.length ? supabase.from('epis').select('id,nome,codigo').in('id', epiIds) : Promise.resolve({ data: [] as any[] }),
        uniIds.length ? supabase.from('uniformes').select('id,nome,codigo').in('id', uniIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const mapE = new Map((epis || []).map((x: any) => [x.id, x]));
      const mapU = new Map((unis || []).map((x: any) => [x.id, x]));
      list.forEach(m => {
        const ref = m.tipo_item === 'epi' ? mapE.get(m.item_id) : mapU.get(m.item_id);
        m.item_nome = ref?.nome || '—';
        m.item_codigo = ref?.codigo || null;
      });
      setMovs(list);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar relatório');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, tipoItem, tipoMov]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return movs;
    return movs.filter(m =>
      (m.item_nome || '').toLowerCase().includes(s) ||
      (m.item_codigo || '').toLowerCase().includes(s) ||
      (m.motivo || '').toLowerCase().includes(s),
    );
  }, [movs, search]);

  const totais = useMemo(() => {
    const t = { entrada: 0, saida: 0, devolucao: 0, descarte: 0, qtdMovs: filtered.length };
    filtered.forEach(m => { t[m.tipo_mov] = (t[m.tipo_mov] || 0) + (m.quantidade || 0); });
    return t;
  }, [filtered]);

  const exportCsv = () => {
    const header = ['Data', 'Tipo Item', 'Item', 'Código', 'Movimentação', 'Quantidade', 'Motivo'];
    const rows = filtered.map(m => [
      new Date(m.data_mov).toLocaleString('pt-BR'),
      m.tipo_item.toUpperCase(),
      m.item_nome || '',
      m.item_codigo || '',
      tipoMovLabel[m.tipo_mov]?.label || m.tipo_mov,
      String(m.quantidade),
      (m.motivo || '').replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `movimentacoes_${from}_a_${to}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Tipo de item</Label>
            <Select value={tipoItem} onValueChange={(v: any) => setTipoItem(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="epi">EPI</SelectItem>
                <SelectItem value="uniforme">Uniforme</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Movimentação</Label>
            <Select value={tipoMov} onValueChange={(v: any) => setTipoMov(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="devolucao">Devolução</SelectItem>
                <SelectItem value="descarte">Descarte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Item, código, motivo..." />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard icon={<ArrowUpCircle className="h-5 w-5" />} label="Entradas" value={totais.entrada} tone="text-emerald-600" />
        <KpiCard icon={<ArrowDownCircle className="h-5 w-5" />} label="Saídas" value={totais.saida} tone="text-rose-600" />
        <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="Devoluções" value={totais.devolucao} tone="text-blue-600" />
        <KpiCard icon={<TrendingDown className="h-5 w-5" />} label="Descartes" value={totais.descarte} tone="text-amber-600" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Movimentos" value={totais.qtdMovs} tone="text-foreground" />
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Movimentações detalhadas</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Movimentação</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nenhuma movimentação no período.</TableCell></TableRow>
                )}
                {!loading && filtered.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(m.data_mov).toLocaleString('pt-BR')}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{m.tipo_item}</Badge></TableCell>
                    <TableCell className="font-medium">{m.item_nome}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.item_codigo || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={tipoMovLabel[m.tipo_mov]?.tone || 'default'}>
                        {tipoMovLabel[m.tipo_mov]?.label || m.tipo_mov}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{m.quantidade}</TableCell>
                    <TableCell className="text-xs">{m.motivo || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 ${tone}`}>{icon}<span className="text-xs uppercase tracking-wider">{label}</span></div>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
