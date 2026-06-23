import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, CheckCircle2, Shirt, HardHat } from 'lucide-react';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichas } from '@/services/fichaService';
import { getConfig } from '@/services/configService';
import { getItemValidade } from '@/lib/validade';
import { supabase } from '@/integrations/supabase/client';
import BackButton from '@/components/BackButton';

interface VencimentoItem {
  fichaId: string;
  nomeFuncionario: string;
  item: EPIItem;
  diasRestantes: number;
}

interface UniformeVenc {
  fichaId: string;
  numero: number;
  nomeFuncionario: string;
  dataAssinatura: string; // yyyy-mm-dd
  marco: 3 | 6 | 9;          // qual troca (3/6/9 meses)
  dataTroca: string;          // yyyy-mm-dd
  diasRestantes: number;
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

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

  useEffect(() => { getFichas().then(setFichas); }, []);

  const hoje = new Date();
  const cfg = getConfig();
  const vencimentos: VencimentoItem[] = [];
  fichas.forEach(ficha => {
    ficha.itens.forEach(item => {
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
  const [vencs, setVencs] = useState<UniformeVenc[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'vencidos' | 'proximos' | 'ok'>('todos');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('fichas_uniforme')
        .select('id, numero, data_assinatura_colaborador, status, colaborador_id, profiles:colaborador_id(nome_completo)')
        .eq('status', 'assinada')
        .not('data_assinatura_colaborador', 'is', null)
        .order('data_assinatura_colaborador', { ascending: false });
      if (error) { console.error(error); setLoading(false); return; }

      const hoje = new Date();
      const list: UniformeVenc[] = [];
      (data || []).forEach((f: any) => {
        const dataAss = (f.data_assinatura_colaborador as string).split('T')[0];
        const nome = f.profiles?.nome_completo || '—';
        ([3, 6, 9] as const).forEach((m) => {
          const troca = addMonths(dataAss, m);
          const dias = Math.ceil((troca.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          list.push({
            fichaId: f.id, numero: f.numero, nomeFuncionario: nome,
            dataAssinatura: dataAss, marco: m, dataTroca: fmt(troca), diasRestantes: dias,
          });
        });
      });
      setVencs(list);
      setLoading(false);
    })();
  }, []);

  const vencidos = vencs.filter(v => v.diasRestantes <= 0);
  const proximos = vencs.filter(v => v.diasRestantes > 0 && v.diasRestantes <= 30);
  const emDia = vencs.filter(v => v.diasRestantes > 30);
  const filtrados = filtro === 'vencidos' ? vencidos
    : filtro === 'proximos' ? proximos
    : filtro === 'ok' ? emDia : vencs;
  const sorted = [...filtrados].sort((a, b) => a.diasRestantes - b.diasRestantes);

  return (
    <div className="space-y-6">
      <SummaryCards vencidos={vencidos.length} proximos={proximos.length} emDia={emDia.length} filtro={filtro} setFiltro={setFiltro} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Trocas de uniforme (3 / 6 / 9 meses)
            <span className="text-muted-foreground font-normal ml-2">({sorted.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma ficha de uniforme assinada.</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((v, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  {v.diasRestantes <= 0 ? <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                    : v.diasRestantes <= 30 ? <Clock className="h-5 w-5 text-warning shrink-0" />
                    : <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {v.nomeFuncionario} <span className="text-muted-foreground font-normal">· Ficha #{v.numero}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Assinada em {v.dataAssinatura} · Troca de <strong>{v.marco} meses</strong> em {v.dataTroca}
                    </p>
                  </div>
                  <StatusBadge dias={v.diasRestantes} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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
