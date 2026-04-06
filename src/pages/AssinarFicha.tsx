import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichaById, saveFicha } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import SignaturePad from '@/components/SignaturePad';
import { toast } from 'sonner';

export default function AssinarFicha() {
  const { id } = useParams<{ id: string }>();
  const [ficha, setFicha] = useState<EPIFicha | null>(null);
  const [assinatura, setAssinatura] = useState('');
  const [itensRecebidos, setItensRecebidos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) {
      const f = getFichaById(id);
      if (f) {
        setFicha(f);
        const rec: Record<string, boolean> = {};
        f.itens.forEach(i => { rec[i.id] = i.recebido; });
        setItensRecebidos(rec);
      }
    }
  }, [id]);

  if (!ficha) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-muted-foreground">Ficha não encontrada ou link inválido.</p>
      </div>
    );
  }

  if (ficha.status === 'assinada') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
            <h2 className="text-xl font-bold text-foreground">Ficha já assinada</h2>
            <p className="text-muted-foreground text-sm">
              Esta ficha foi assinada em {new Date(ficha.assinadoEm!).toLocaleString('pt-BR')}.
            </p>
            <Button onClick={() => generatePDF(ficha)}>
              <Download className="h-4 w-4 mr-2" /> Baixar PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const toggleItem = (itemId: string) => {
    setItensRecebidos(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleSign = () => {
    const checkedCount = Object.values(itensRecebidos).filter(Boolean).length;
    if (checkedCount === 0) {
      toast.error('Marque ao menos um item como recebido');
      return;
    }
    if (!assinatura) {
      toast.error('Por favor, assine no campo abaixo');
      return;
    }

    const updated: EPIFicha = {
      ...ficha,
      itens: ficha.itens.map(i => ({ ...i, recebido: itensRecebidos[i.id] || false })),
      assinaturaColaborador: assinatura,
      status: 'assinada',
      assinadoEm: new Date().toISOString(),
    };
    saveFicha(updated);
    setFicha(updated);
    toast.success('Ficha assinada com sucesso!');
  };

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <ShieldCheck className="h-10 w-10 mx-auto text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Assinatura de EPI</h1>
          <p className="text-muted-foreground text-sm">Confira os itens e assine para confirmar o recebimento.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Seus Dados</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              <div><dt className="text-muted-foreground text-xs">Nome</dt><dd className="font-medium">{ficha.nomeFuncionario}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Empresa</dt><dd className="font-medium">{ficha.empresa || '—'}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Função</dt><dd className="font-medium">{ficha.funcao || '—'}</dd></div>
              <div><dt className="text-muted-foreground text-xs">Data</dt><dd className="font-medium">{ficha.dataEntrega}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Itens Recebidos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ficha.itens.map(item => (
              <label key={item.id} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox
                  checked={itensRecebidos[item.id] || false}
                  onCheckedChange={() => toggleItem(item.id)}
                />
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{item.descricao}</p>
                  <p className="text-xs text-muted-foreground">CA: {item.ca || '—'} · Qtd: {item.quantidade} · Tam: {item.tamanho || '—'}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Sua Assinatura</CardTitle></CardHeader>
          <CardContent>
            <SignaturePad label="Assine abaixo" onSave={setAssinatura} />
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={handleSign}>
          Confirmar Recebimento e Assinar
        </Button>
      </div>
    </div>
  );
}
