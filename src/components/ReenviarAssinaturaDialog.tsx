import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { AlertTriangle, Copy, Loader2, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { EPIFicha } from '@/types/epi';
import { criarTokenAssinatura, reabrirParaAssinatura } from '@/services/fichaService';

/**
 * Envia (ou reenvia) a ficha para assinatura pelo link. Ficha pendente: gera o
 * link. Ficha assinada: pede o motivo, guarda a assinatura atual no histórico,
 * volta a ficha para pendente e gera um link novo.
 */
export default function ReenviarAssinaturaDialog({ ficha, trigger, onReaberta }: {
  ficha: EPIFicha;
  trigger: ReactNode;
  /** Chamado quando uma ficha assinada foi reaberta (a tela recarrega a ficha). */
  onReaberta?: () => void;
}) {
  const assinada = ficha.status === 'assinada';
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [link, setLink] = useState('');
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    setGerando(true);
    try {
      const token = assinada
        ? await reabrirParaAssinatura(ficha.id, motivo)
        : await criarTokenAssinatura(ficha.id);
      if (!token) throw new Error('Erro ao gerar link de assinatura');
      setLink(`${window.location.origin}/assinar/${token}`);
      if (assinada) {
        toast.success('Assinatura anterior guardada no histórico. Ficha aguardando nova assinatura.');
        onReaberta?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar link');
    } finally {
      setGerando(false);
    }
  };

  const abrir = (o: boolean) => {
    setAberto(o);
    if (!o) { setMotivo(''); setLink(''); return; }
    if (!assinada) gerar();
  };

  const mensagem = `Olá ${ficha.nomeFuncionario}, segue o link para assinatura da sua ficha de EPI/Uniforme: ${link}`;
  const whatsapp = () => {
    const tel = (ficha.telefone || '').replace(/\D/g, '');
    const numero = !tel ? '' : tel.startsWith('55') && tel.length > 11 ? tel : `55${tel}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank');
  };

  return (
    <Dialog open={aberto} onOpenChange={o => !gerando && abrir(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{assinada ? 'Reenviar para nova assinatura' : 'Enviar para assinatura remota'}</DialogTitle>
          <DialogDescription>
            {ficha.nomeFuncionario}{ficha.numero ? ` · ficha nº ${ficha.numero}` : ''}
          </DialogDescription>
        </DialogHeader>

        {assinada && !link ? (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p>
                Esta ficha já está assinada. Ao reenviar, a assinatura atual <b>não é apagada</b>: ela fica guardada no
                histórico da ficha. A ficha volta para <b>Pendente</b> até o colaborador assinar o link novo, e links
                antigos deixam de valer.
              </p>
            </div>
            <div>
              <Label htmlFor="motivo-reenvio">Motivo do reenvio</Label>
              <Textarea id="motivo-reenvio" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ex.: itens atualizados a pedido do fiscal do contrato; rubrica não aparecia no PDF." />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Link público</Label>
              <Input readOnly value={gerando ? 'Gerando link…' : link} onClick={e => e.currentTarget.select()} />
            </div>
            <p className="text-xs text-muted-foreground">
              O colaborador abre o link, marca os itens recebidos e assina pelo celular. O link vale por 72 horas.
            </p>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:flex-row">
          {assinada && !link ? (
            <>
              <Button variant="outline" onClick={() => abrir(false)} disabled={gerando}>Cancelar</Button>
              <Button onClick={gerar} disabled={gerando || motivo.trim().length < 5}>
                {gerando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reabrir e gerar link
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={!link}
                onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiado!'); }}>
                <Copy className="h-4 w-4 mr-2" /> Copiar
              </Button>
              <Button variant="outline" disabled={!link}
                onClick={() => { window.location.href = `mailto:?subject=${encodeURIComponent('Assinatura de Ficha de EPI')}&body=${encodeURIComponent(mensagem)}`; }}>
                <Mail className="h-4 w-4 mr-2" /> Email
              </Button>
              <Button onClick={whatsapp} disabled={!link} className="bg-whatsapp hover:bg-whatsapp-hover text-white">
                <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
