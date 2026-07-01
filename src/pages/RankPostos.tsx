import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trophy, MapPin, ChevronLeft, Eye, Search } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichas } from '@/services/fichaService';
import BackButton from '@/components/BackButton';

export default function RankPostos() {
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => { getFichas().then(setFichas); }, []);

  const ranking = useMemo(() => {
    const map = new Map<string, EPIFicha[]>();
    for (const f of fichas) {
      const posto = (f.posto || '').trim() || 'Sem posto';
      if (!map.has(posto)) map.set(posto, []);
      map.get(posto)!.push(f);
    }
    const arr = Array.from(map.entries()).map(([posto, items]) => ({
      posto,
      total: items.length,
      assinadas: items.filter(i => i.status === 'assinada').length,
      pendentes: items.filter(i => i.status !== 'assinada').length,
      colaboradores: new Set(items.map(i => i.nomeFuncionario)).size,
      items,
    }));
    arr.sort((a, b) => b.total - a.total);
    return arr;
  }, [fichas]);

  const filtrado = ranking.filter(r => r.posto.toLowerCase().includes(busca.toLowerCase()));
  const detalhes = selecionado ? ranking.find(r => r.posto === selecionado) : null;

  const medalha = (i: number) =>
    i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />

        {!detalhes && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-primary" /> Ranking por Posto
                </h2>
                <p className="text-sm text-muted-foreground">
                  Postos de trabalho ordenados pelo número de fichas emitidas. Clique em um posto para ver as fichas.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar posto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {filtrado.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Nenhum posto encontrado.
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {filtrado.map((r, i) => (
                  <Card
                    key={r.posto}
                    className="hover:border-primary/60 hover:shadow-md transition cursor-pointer"
                    onClick={() => setSelecionado(r.posto)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="text-2xl font-bold w-12 text-center">{medalha(i)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 font-semibold text-foreground truncate">
                          <MapPin className="h-4 w-4 text-primary shrink-0" />
                          {r.posto}
                        </div>
                        <div className="flex gap-2 flex-wrap mt-1">
                          <Badge variant="secondary">{r.colaboradores} colaborador(es)</Badge>
                          <Badge variant="outline" className="text-green-700 border-green-700/50">
                            {r.assinadas} assinada(s)
                          </Badge>
                          {r.pendentes > 0 && (
                            <Badge variant="outline" className="text-amber-700 border-amber-700/50">
                              {r.pendentes} pendente(s)
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-primary">{r.total}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">fichas</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {detalhes && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setSelecionado(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar ao ranking
            </Button>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" /> {detalhes.posto}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {detalhes.total} ficha(s) · {detalhes.colaboradores} colaborador(es)
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {detalhes.items.map(f => (
                  <div key={f.id} className="flex items-center justify-between border rounded-lg p-3 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{f.nomeFuncionario}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {f.funcao} · {new Date(f.dataEntrega).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={f.status === 'assinada' ? 'default' : 'secondary'}>
                        {f.status === 'assinada' ? 'Assinada' : 'Pendente'}
                      </Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/ficha/${f.id}`}><Eye className="h-4 w-4 mr-1" /> Abrir</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
