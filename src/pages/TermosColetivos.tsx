import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileSignature } from 'lucide-react';
import { listTermosColetivos, TermoColetivo } from '@/services/termoColetivoService';

export default function TermosColetivos() {
  const [termos, setTermos] = useState<TermoColetivo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTermosColetivos().then(t => { setTermos(t); setLoading(false); });
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Termos Coletivos de EPI</h1>
        <Button asChild><Link to="/termo-coletivo/novo"><Plus className="h-4 w-4 mr-1" /> Novo Termo</Link></Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
        termos.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nenhum termo coletivo criado ainda.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {termos.map(t => (
              <Link key={t.id} to={`/termo-coletivo/${t.id}`}>
                <Card className="hover:shadow-md transition">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileSignature className="h-4 w-4" /> {t.posto} — {t.mes_referencia}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    <p>Líder: {t.lider || '—'}</p>
                    <p>Empresa: {t.empresa || '—'}</p>
                    <Badge variant={t.status === 'finalizado' ? 'default' : 'secondary'} className="mt-1">
                      {t.status === 'finalizado' ? 'Finalizado' : 'Em assinatura'}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      }
    </div>
  );
}
