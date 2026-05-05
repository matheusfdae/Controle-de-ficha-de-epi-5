import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, Download, ClipboardList } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichas } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';

export default function ConsultarFichas() {
  const [fichas, setFichas] = useState<EPIFicha[]>([]);

  useEffect(() => {
    setFichas(getFichas());
  }, []);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Consultar Fichas</h2>
            <p className="text-sm text-muted-foreground">Todas as fichas de EPI cadastradas no sistema.</p>
          </div>
          <Link to="/nova-ficha"><Button size="sm">Nova Ficha</Button></Link>
        </div>

        {fichas.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma ficha encontrada.</p>
            <Link to="/nova-ficha"><Button>Criar Nova Ficha</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            {fichas.map(ficha => (
              <Card key={ficha.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between p-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{ficha.nomeFuncionario}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ficha.criadoEm).toLocaleDateString('pt-BR')} · {ficha.itens.filter(i => i.recebido).length} itens
                    </p>
                  </div>
                  <Badge variant={ficha.status === 'assinada' ? 'default' : 'secondary'}
                    className={ficha.status === 'assinada' ? 'bg-success text-success-foreground' : ''}>
                    {ficha.status === 'assinada' ? 'Assinada' : 'Pendente'}
                  </Badge>
                  <div className="flex gap-1 shrink-0">
                    <Link to={`/ficha/${ficha.id}`}>
                      <Button variant="ghost" size="icon" title="Visualizar"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" title="Baixar PDF" onClick={() => generatePDF(ficha)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
