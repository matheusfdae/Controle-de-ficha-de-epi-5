import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileSignature, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TermoOficialView from '@/components/TermoOficialView';
import { getTermoColetivoFull, listTermosColetivos, TermoColetivo, TermoColetivoFull } from '@/services/termoColetivoService';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';

export default function TermosColetivos() {
  const [termos, setTermos] = useState<TermoColetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendo, setVendo] = useState<TermoColetivoFull | null>(null);

  const visualizar = async (e: React.MouseEvent, id?: string) => {
    e.preventDefault(); e.stopPropagation();
    if (id) setVendo(await getTermoColetivoFull(id));
  };

  useEffect(() => {
    listTermosColetivos().then(t => { setTermos(t); setLoading(false); });
  }, []);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader
          title="Termos Coletivos de EPI"
          actions={<Button asChild><Link to="/termo-coletivo/novo"><Plus className="h-4 w-4 mr-1" /> Novo Termo</Link></Button>}
        />

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
                    <CardContent className="text-xs text-muted-foreground space-y-1 relative">
                      <Button size="sm" variant="outline" className="absolute right-4 bottom-3" onClick={e => visualizar(e, t.id)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                      </Button>
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
      <Dialog open={!!vendo} onOpenChange={o => { if (!o) setVendo(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{vendo ? `${vendo.termo.posto} — ${vendo.termo.mes_referencia}` : ''}</DialogTitle></DialogHeader>
          {vendo && <TermoOficialView termo={vendo.termo} itens={vendo.itens} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
