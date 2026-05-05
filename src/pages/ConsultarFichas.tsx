import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, Download, ClipboardList, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { EPIFicha } from '@/types/epi';
import { getFichas } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import { useAuth } from '@/contexts/AuthContext';

export default function ConsultarFichas() {
  const { isAdmin } = useAuth();
  const [fichas, setFichas] = useState<EPIFicha[]>([]);

  useEffect(() => {
    getFichas().then(setFichas);
  }, []);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Consultar Fichas</h2>
            <p className="text-sm text-muted-foreground">Todas as fichas de EPI cadastradas no sistema.</p>
          </div>
          {isAdmin && <Link to="/nova-ficha"><Button size="sm">Nova Ficha</Button></Link>}
        </div>

        {fichas.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma ficha encontrada.</p>
            {isAdmin && <Link to="/nova-ficha"><Button>Criar Nova Ficha</Button></Link>}
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
                    {ficha.status !== 'assinada' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Enviar link de assinatura via WhatsApp"
                        onClick={() => {
                          const tel = (ficha.telefone || '').replace(/\D/g, '');
                          if (!tel) { toast.error('Telefone do colaborador não cadastrado'); return; }
                          const numero = tel.startsWith('55') ? tel : `55${tel}`;
                          const url = `${window.location.origin}/assinar/${ficha.id}`;
                          const msg = encodeURIComponent(`Olá ${ficha.nomeFuncionario}, segue o link para assinatura da sua ficha de EPI/Uniforme: ${url}`);
                          window.open(`https://wa.me/${numero}?text=${msg}`, '_blank');
                        }}
                      >
                        <MessageCircle className="h-4 w-4 text-success" />
                      </Button>
                    )}
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
