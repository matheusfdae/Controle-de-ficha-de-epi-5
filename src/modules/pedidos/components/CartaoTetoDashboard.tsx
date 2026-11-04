import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet } from 'lucide-react';
import { listPostos } from '@/services/postosService';
import { hojeBr, pedidosDoMesParaTeto, reais } from '../lib/pedidosService';
import { gastoTeto, rotuloMes, type LinhaTeto } from '../lib/gerencial';

const MOSTRAR = 8;

/**
 * Cartão do Dashboard: gasto de material de cada posto no mês contra o teto
 * (os que passaram primeiro). O quadro completo e os PDFs ficam no Painel Gerencial.
 */
export default function CartaoTetoDashboard() {
  const mes = hojeBr().slice(0, 7);
  const [linhas, setLinhas] = useState<LinhaTeto[] | null>(null);
  useEffect(() => {
    Promise.all([pedidosDoMesParaTeto(mes), listPostos()])
      .then(([p, po]) => setLinhas(gastoTeto(p, po, mes).filter(l => l.teto != null)))
      .catch(() => setLinhas([]));
  }, [mes]);
  if (!linhas || linhas.length === 0) return null;

  const acima = linhas.filter(l => l.passou).length;
  const gasto = linhas.reduce((s, l) => s + l.gasto, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Teto de gasto por posto — {rotuloMes(mes)}</CardTitle>
        <CardDescription>
          Material pedido no mês até hoje: <strong className="text-foreground">{reais(gasto)}</strong> em {linhas.length} posto(s) com teto
          {acima > 0 ? <> · <span className="text-destructive font-semibold">{acima} acima do teto</span></> : ' · nenhum acima do teto'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {linhas.slice(0, MOSTRAR).map(l => (
          <Link key={l.id} to={`/pedidos/posto/${l.id}?mes=${mes}`} className="block rounded-md px-2 py-1.5 hover:bg-muted/50">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium truncate">{l.nome} <span className="text-xs text-muted-foreground">{l.uf}</span></span>
              <span className={`tabular-nums whitespace-nowrap ${l.passou ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                {reais(l.gasto)} de {reais(l.teto!)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${l.passou ? 'bg-destructive' : (l.pct ?? 0) >= 80 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, l.pct ?? 0)}%` }} />
              </div>
              <span className={`w-14 text-right text-xs tabular-nums ${l.passou ? 'text-destructive font-semibold' : ''}`}>{(l.pct ?? 0).toLocaleString('pt-BR')}%</span>
            </div>
          </Link>
        ))}
        <Link to="/pedidos/gerencial" className="inline-block pt-1 text-sm text-primary hover:underline">
          {linhas.length > MOSTRAR ? `Ver os ${linhas.length} postos e os relatórios no Painel Gerencial` : 'Ver no Painel Gerencial (com relatórios em PDF)'}
        </Link>
      </CardContent>
    </Card>
  );
}
