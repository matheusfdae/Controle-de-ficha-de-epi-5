import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';
import { assinarItemColetivo, getTermoColetivoPublico, TermoColetivoFull, TermoColetivoItem } from '@/services/termoColetivoService';

export default function AssinarTermoColetivo() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const [data, setData] = useState<TermoColetivoFull | null>(null);
  const [item, setItem] = useState<TermoColetivoItem | null>(null);
  const [pad, setPad] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id || !itemId) { setLoading(false); return; }
      const d = await getTermoColetivoPublico(id);
      setData(d);
      const it = d?.itens.find(i => i.id === itemId) ?? null;
      setItem(it);
      if (it?.data_assinatura) setDone(true);
      setLoading(false);
    })();
  }, [id, itemId]);

  const submit = async () => {
    if (!itemId || !pad) return toast.error('Assine antes de confirmar');
    const r = await assinarItemColetivo(itemId, pad);
    if (!r.ok) return toast.error(r.error ?? 'Erro ao salvar');
    setDone(true);
    toast.success('Assinatura registrada');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm">Carregando…</div>;
  if (!data || !item) return <div className="min-h-screen flex items-center justify-center text-sm">Link inválido ou item não encontrado.</div>;

  return (
    <div className="min-h-screen bg-muted/30 p-4 flex items-start justify-center">
      <Card className="w-full max-w-xl mt-6">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-base">Termo de Entrega de EPI</CardTitle>
          <p className="text-xs text-muted-foreground">{data.termo.posto} — {data.termo.mes_referencia}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">Colaborador:</span> <strong>{item.colaborador_nome}</strong></p>
            {item.colaborador_cpf && <p><span className="text-muted-foreground">CPF:</span> {item.colaborador_cpf}</p>}
            <p><span className="text-muted-foreground">Material:</span> {item.material}</p>
            {item.ca && <p><span className="text-muted-foreground">CA:</span> {item.ca}</p>}
            <p><span className="text-muted-foreground">Quantidade:</span> {item.quantidade}{item.tamanho ? ` — Tam ${item.tamanho}` : ''}</p>
          </div>

          {done ? (
            <div className="text-center space-y-2 py-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
              <p className="text-sm font-medium">Assinatura registrada com sucesso</p>
              <p className="text-xs text-muted-foreground">Você pode fechar esta janela.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Declaro ter recebido o EPI acima em perfeito estado, comprometendo-me com seu uso
                correto conforme NR-06.
              </p>
              <SignaturePad label="Sua assinatura" onSave={setPad} />
              <Button className="w-full" onClick={submit} disabled={!pad}>Confirmar assinatura</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
