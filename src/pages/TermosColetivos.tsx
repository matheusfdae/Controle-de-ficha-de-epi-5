import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileSignature, Eye, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { pdfDoTermoColetivo } from '@/lib/termoEpiPdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TermoOficialView from '@/components/TermoOficialView';
import { getTermoColetivoFull, listTermosColetivos, TermoColetivo, TermoColetivoFull } from '@/services/termoColetivoService';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';

export default function TermosColetivos() {
  const [termos, setTermos] = useState<TermoColetivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendo, setVendo] = useState<TermoColetivoFull | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const baixar = async (e: React.MouseEvent, id?: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!id) return;
    setBaixando(id);
    try {
      const full = await getTermoColetivoFull(id);
      if (!full) throw new Error('Termo não encontrado.');
      await pdfDoTermoColetivo(full);
    } catch (err) { toast.error((err as Error).message); } finally { setBaixando(null); }
  };

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
                      <div className="absolute right-4 bottom-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={e => visualizar(e, t.id)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                        </Button>
                        <Button size="sm" variant="outline" disabled={baixando === t.id} onClick={e => baixar(e, t.id)}>
                          {baixando === t.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />} PDF
                        </Button>
                      </div>
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
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              {vendo ? `${vendo.termo.posto} — ${vendo.termo.mes_referencia}` : ''}
              {vendo && (
                <Button size="sm" variant="outline" onClick={() => pdfDoTermoColetivo(vendo).catch(e => toast.error((e as Error).message))}>
                  <FileDown className="h-4 w-4 mr-1" /> Baixar PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {vendo && <TermoOficialView termo={vendo.termo} itens={vendo.itens} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
