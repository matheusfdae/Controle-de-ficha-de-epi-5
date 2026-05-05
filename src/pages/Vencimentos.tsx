import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichas } from '@/services/fichaService';

interface VencimentoItem {
  fichaId: string;
  nomeFuncionario: string;
  item: EPIItem;
  diasRestantes: number;
}

export default function Vencimentos() {
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'vencidos' | 'proximos' | 'ok'>('todos');

  useEffect(() => {
    getFichas().then(setFichas);
  }, []);

  const hoje = new Date();
  const vencimentos: VencimentoItem[] = [];

  fichas.forEach(ficha => {
    ficha.itens.forEach(item => {
      if (item.dataValidade) {
        const validade = new Date(item.dataValidade);
        const diff = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
        vencimentos.push({
          fichaId: ficha.id,
          nomeFuncionario: ficha.nomeFuncionario,
          item,
          diasRestantes: diff,
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
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Controle de Vencimentos</h2>
          <p className="text-sm text-muted-foreground">Acompanhe a validade de cada EPI entregue.</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 grid-cols-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'vencidos' ? 'todos' : 'vencidos')}>
            <CardContent className="p-4 text-center">
              <AlertTriangle className={`h-6 w-6 mx-auto mb-1 ${filtro === 'vencidos' ? 'text-destructive' : 'text-destructive/50'}`} />
              <p className="text-2xl font-bold text-foreground">{vencidos.length}</p>
              <p className="text-xs text-muted-foreground">Vencidos</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'proximos' ? 'todos' : 'proximos')}>
            <CardContent className="p-4 text-center">
              <Clock className={`h-6 w-6 mx-auto mb-1 ${filtro === 'proximos' ? 'text-warning' : 'text-warning/50'}`} />
              <p className="text-2xl font-bold text-foreground">{proximos.length}</p>
              <p className="text-xs text-muted-foreground">Próximos (30d)</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFiltro(filtro === 'ok' ? 'todos' : 'ok')}>
            <CardContent className="p-4 text-center">
              <CheckCircle2 className={`h-6 w-6 mx-auto mb-1 ${filtro === 'ok' ? 'text-success' : 'text-success/50'}`} />
              <p className="text-2xl font-bold text-foreground">{emDia.length}</p>
              <p className="text-xs text-muted-foreground">Em Dia</p>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filtro === 'todos' ? 'Todos os Itens' : filtro === 'vencidos' ? 'Itens Vencidos' : filtro === 'proximos' ? 'Próximos a Vencer' : 'Em Dia'}
              <span className="text-muted-foreground font-normal ml-2">({sorted.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum item com data de validade cadastrada.
              </p>
            ) : (
              <div className="space-y-2">
                {sorted.map((v, i) => (
                  <Link key={i} to={`/ficha/${v.fichaId}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      {v.diasRestantes <= 0 ? (
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                      ) : v.diasRestantes <= 30 ? (
                        <Clock className="h-5 w-5 text-warning shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{v.item.descricao}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.nomeFuncionario} · CA: {v.item.ca || '—'} · Validade: {v.item.dataValidade}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          v.diasRestantes <= 0
                            ? 'bg-destructive/10 text-destructive border-destructive/20'
                            : v.diasRestantes <= 30
                            ? 'bg-warning/10 text-warning border-warning/20'
                            : 'bg-success/10 text-success border-success/20'
                        }
                      >
                        {v.diasRestantes <= 0
                          ? `Vencido há ${Math.abs(v.diasRestantes)}d`
                          : `${v.diasRestantes}d restantes`
                        }
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
