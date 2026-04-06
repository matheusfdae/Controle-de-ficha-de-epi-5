import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, Search, Plus, LogOut, ShieldCheck, AlertTriangle,
  CheckCircle2, Clock, CalendarX, BarChart3
} from 'lucide-react';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichas, seedDemoData } from '@/services/fichaService';
import { useAuth } from '@/contexts/AuthContext';

interface VencimentoItem {
  fichaId: string;
  nomeFuncionario: string;
  item: EPIItem;
  diasRestantes: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [fichas, setFichas] = useState<EPIFicha[]>([]);

  useEffect(() => {
    seedDemoData();
    setFichas(getFichas());
  }, []);

  const totalFichas = fichas.length;
  const fichasAssinadas = fichas.filter(f => f.status === 'assinada').length;
  const fichasPendentes = fichas.filter(f => f.status === 'pendente').length;

  // Calculate expiration items
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
  const proximosVencer = vencimentos.filter(v => v.diasRestantes > 0 && v.diasRestantes <= 30);
  const emDia = vencimentos.filter(v => v.diasRestantes > 30);

  const alertas = [...vencidos, ...proximosVencer].sort((a, b) => a.diasRestantes - b.diasRestantes);

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Painel de Controle</h1>
              <p className="text-sm text-muted-foreground">Olá, {user?.nome}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalFichas}</p>
                <p className="text-xs text-muted-foreground">Total de Fichas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{fichasAssinadas}</p>
                <p className="text-xs text-muted-foreground">Assinadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{fichasPendentes}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{vencidos.length}</p>
                <p className="text-xs text-muted-foreground">EPIs Vencidos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/nova-ficha">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30 h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <Plus className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm">Nova Ficha</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/consultar">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30 h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <Search className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm">Consultar Fichas</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/vencimentos">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30 h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm">Controle de Vencimentos</span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Expiration Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX className="h-5 w-5 text-destructive" />
              Alertas de Vencimento
            </CardTitle>
            <CardDescription>EPIs vencidos ou próximos do vencimento (30 dias)</CardDescription>
          </CardHeader>
          <CardContent>
            {alertas.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-success/40" />
                <p className="text-sm text-muted-foreground">Nenhum alerta de vencimento no momento.</p>
                <p className="text-xs text-muted-foreground">Adicione datas de validade nos itens de EPI para acompanhar.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alertas.slice(0, 10).map((v, i) => (
                  <Link key={i} to={`/ficha/${v.fichaId}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      {v.diasRestantes <= 0 ? (
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                      ) : (
                        <Clock className="h-5 w-5 text-warning shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{v.item.descricao}</p>
                        <p className="text-xs text-muted-foreground">{v.nomeFuncionario} · CA: {v.item.ca || '—'}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={v.diasRestantes <= 0
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-warning/10 text-warning border-warning/20'
                        }
                      >
                        {v.diasRestantes <= 0
                          ? `Vencido há ${Math.abs(v.diasRestantes)} dias`
                          : `Vence em ${v.diasRestantes} dias`
                        }
                      </Badge>
                    </div>
                  </Link>
                ))}
                {alertas.length > 10 && (
                  <Link to="/vencimentos">
                    <p className="text-sm text-primary text-center mt-2 hover:underline">
                      Ver todos os {alertas.length} alertas →
                    </p>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent fichas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fichas Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fichas.slice(0, 5).map(ficha => (
              <Link key={ficha.id} to={`/ficha/${ficha.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">{ficha.nomeFuncionario}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ficha.criadoEm).toLocaleDateString('pt-BR')} · {ficha.itens.length} itens
                    </p>
                  </div>
                  <Badge variant={ficha.status === 'assinada' ? 'default' : 'secondary'}
                    className={ficha.status === 'assinada' ? 'bg-success text-success-foreground' : ''}>
                    {ficha.status === 'assinada' ? 'Assinada' : 'Pendente'}
                  </Badge>
                </div>
              </Link>
            ))}
            {fichas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma ficha criada ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
