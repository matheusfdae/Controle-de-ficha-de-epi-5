import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichaPorToken, assinarFichaPublica } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import SignaturePad from '@/components/SignaturePad';
import FichaOficialView from '@/components/FichaOficialView';
import { toast } from 'sonner';

export default function AssinarFicha() {
  const { token } = useParams<{ token: string }>();
  const [ficha, setFicha] = useState<EPIFicha | null>(null);
  const [assinatura, setAssinatura] = useState('');
  const [itensRecebidos, setItensRecebidos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (token) {
      getFichaPorToken(token).then(f => {
        if (f) {
          setFicha(f);
          const rec: Record<string, boolean> = {};
          f.itens.forEach(i => { rec[i.id] = i.recebido; });
          setItensRecebidos(rec);
        }
      });
    }
  }, [token]);

  if (!ficha) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">Link inválido, expirado ou já utilizado.</p>
      </div>
    );
  }

  if (ficha.status === 'assinada') {
    return (
      <div className="min-h-screen p-4 space-y-4">
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="py-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
            <h2 className="text-xl font-bold">Ficha já assinada</h2>
            <p className="text-muted-foreground text-sm">
              Assinada em {new Date(ficha.assinadoEm!).toLocaleString('pt-BR')}.
            </p>
            <Button onClick={() => generatePDF(ficha)}>
              <Download className="h-4 w-4 mr-2" /> Baixar PDF
            </Button>
          </CardContent>
        </Card>
        <FichaOficialView ficha={ficha} />
      </div>
    );
  }

  const toggleItem = (itemId: string) => {
    setItensRecebidos(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleSign = async () => {
    const recebidosIds = Object.entries(itensRecebidos).filter(([,v]) => v).map(([k]) => k);
    if (recebidosIds.length === 0) { toast.error('Marque ao menos um item recebido'); return; }
    if (!assinatura) { toast.error('Por favor, assine no campo abaixo'); return; }

    if (!token) return;
    const r = await assinarFichaPublica(token, assinatura, recebidosIds);
    if (!r.ok) {
      toast.error(
        r.error === 'ja_assinada' ? 'Esta ficha já foi assinada.'
        : r.error === 'token_invalido' ? 'Link inválido, expirado ou já utilizado.'
        : (r.error || 'Erro ao assinar')
      );
      return;
    }
    const updated: EPIFicha = {
      ...ficha,
      itens: ficha.itens.map(i => ({ ...i, recebido: itensRecebidos[i.id] || false })),
      assinaturaColaborador: assinatura,
      status: 'assinada',
      assinadoEm: new Date().toISOString(),
    };
    setFicha(updated);
    toast.success('Ficha assinada com sucesso!');
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 pb-20">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="text-center space-y-1">
          <ShieldCheck className="h-8 w-8 mx-auto text-primary" />
          <h1 className="text-xl font-bold">Assinatura de Ficha de EPI</h1>
          <p className="text-muted-foreground text-xs">
            Confira a ficha, marque os itens recebidos e assine no final.
          </p>
        </div>

        <FichaOficialView
          ficha={ficha}
          signMode={{
            itensRecebidos,
            onToggleItem: toggleItem,
            signatureSlot: (
              <div className="space-y-3 max-w-md mx-auto">
                <SignaturePad label="Assine aqui" onSave={setAssinatura} />
                <Button className="w-full" size="lg" onClick={handleSign}>
                  Confirmar Recebimento e Assinar
                </Button>
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
