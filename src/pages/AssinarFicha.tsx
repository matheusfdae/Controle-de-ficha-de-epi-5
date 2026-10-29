import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Download, Link2Off, Loader2, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichaPorToken, assinarFichaPublica, situacaoLinkAssinatura, type SituacaoLink } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import SignaturePad from '@/components/SignaturePad';
import SelfieAssinatura from '@/components/SelfieAssinatura';
import FichaOficialView from '@/components/FichaOficialView';
import { toast } from 'sonner';

export default function AssinarFicha() {
  const { token } = useParams<{ token: string }>();
  const [ficha, setFicha] = useState<EPIFicha | null>(null);
  const [assinatura, setAssinatura] = useState('');
  const [selfie, setSelfie] = useState('');
  const [itensRecebidos, setItensRecebidos] = useState<Record<string, boolean>>({});
  // Por que a ficha não abriu: cada caso tem a sua mensagem (antes era tudo "Link inválido").
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'sem_conexao' | SituacaoLink>('carregando');

  const carregar = useCallback(async () => {
    if (!token) { setEstado({ situacao: 'inexistente' }); return; }
    setEstado('carregando');
    try {
      const f = await getFichaPorToken(token);
      if (f) {
        setFicha(f);
        const rec: Record<string, boolean> = {};
        f.itens.forEach(i => { rec[i.id] = i.recebido; });
        setItensRecebidos(rec);
        setEstado('ok');
        return;
      }
      setEstado(await situacaoLinkAssinatura(token));
    } catch {
      setEstado('sem_conexao');
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!ficha) {
    const dataHora = (iso?: string | null) => iso
      ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    const aviso = estado === 'carregando' ? null
      : estado === 'sem_conexao' ? {
          icone: <WifiOff className="h-12 w-12 mx-auto text-warning" />,
          titulo: 'Não foi possível carregar a ficha',
          texto: 'Verifique a internet do celular e tente de novo.',
          tentar: true,
        }
      : estado !== 'ok' && estado.situacao === 'usado' ? {
          icone: <CheckCircle2 className="h-12 w-12 mx-auto text-success" />,
          titulo: 'Ficha já assinada',
          texto: `Esta ficha já foi assinada${estado.usado_em ? ` em ${dataHora(estado.usado_em)}` : ''}. Não é preciso fazer mais nada.`,
        }
      : estado !== 'ok' && estado.situacao === 'vencido' ? {
          icone: <Clock className="h-12 w-12 mx-auto text-warning" />,
          titulo: 'Link vencido',
          texto: `O link vale por 72 horas e venceu${estado.expira_em ? ` em ${dataHora(estado.expira_em)}` : ''}. Peça um novo link ao responsável pela entrega.`,
        }
      : estado !== 'ok' && estado.situacao === 'valido' ? {
          // O token vale mas a ficha não veio (ex.: ficha excluída depois de gerar o link).
          icone: <Link2Off className="h-12 w-12 mx-auto text-muted-foreground" />,
          titulo: 'Ficha não encontrada',
          texto: 'Esta ficha não está mais disponível. Fale com o responsável pela entrega.',
        }
      : {
          icone: <Link2Off className="h-12 w-12 mx-auto text-muted-foreground" />,
          titulo: 'Link inválido',
          texto: 'Confira se o link foi copiado inteiro. Se continuar, peça um novo link ao responsável pela entrega.',
        };
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        {!aviso ? (
          <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando a ficha…</p>
        ) : (
          <Card className="max-w-md w-full text-center">
            <CardContent className="py-8 space-y-3">
              {aviso.icone}
              <h2 className="text-xl font-bold">{aviso.titulo}</h2>
              <p className="text-muted-foreground text-sm">{aviso.texto}</p>
              {aviso.tentar && (
                <Button onClick={carregar}><RefreshCw className="h-4 w-4 mr-2" /> Tentar de novo</Button>
              )}
            </CardContent>
          </Card>
        )}
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
    const r = await assinarFichaPublica(token, assinatura, recebidosIds, selfie);
    if (!r.ok) {
      // O link deixou de valer enquanto a tela estava aberta: mostra o motivo certo.
      if (r.error === 'token_invalido') {
        try { setFicha(null); setEstado(await situacaoLinkAssinatura(token)); return; } catch { /* segue com o aviso */ }
      }
      toast.error(
        r.error === 'ja_assinada' ? 'Esta ficha já foi assinada.'
        : r.error === 'token_invalido' ? 'Link inválido, expirado ou já utilizado.'
        : r.error === 'selfie_invalida' ? 'Não foi possível usar a selfie. Tire de novo ou assine sem ela.'
        : (r.error || 'Erro ao assinar')
      );
      return;
    }
    const updated: EPIFicha = {
      ...ficha,
      itens: ficha.itens.map(i => ({ ...i, recebido: itensRecebidos[i.id] || false })),
      assinaturaColaborador: assinatura,
      ...(selfie && { selfieColaborador: selfie, selfieEm: new Date().toISOString() }),
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
              <div className="space-y-3">
                <SignaturePad label="Assine aqui" onSave={setAssinatura} grande />
                <div className="space-y-3 max-w-md mx-auto">
                  <SelfieAssinatura value={selfie} onChange={setSelfie} habilitado={!!assinatura} />
                  <Button className="w-full" size="lg" onClick={handleSign}>
                    Confirmar Recebimento e Assinar
                  </Button>
                </div>
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
