import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Eye, Loader2, Mail, Send } from 'lucide-react';
import { montarEmail } from '../../supabase/functions/_shared/emailConvocacao';
import { toast } from 'sonner';
import { enviarConvocacaoPorEmail, lerConfigEmail, lerListaEmails } from '@/services/emailConvocacaoService';
import { TODOS_ESTADOS } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import type { ConvocacaoUniforme } from '@/lib/convocacaoUniforme';

/** Botão "Enviar por e-mail" da convocação de troca de uniforme. */
export default function EnviarConvocacaoDialog({ uf, convocados }: { uf: string; convocados: ConvocacaoUniforme[] }) {
  const { estados } = useAuth();
  const total = convocados.length;
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto || texto) return;
    // Sugere os destinatários e a cópia cadastrados em Configurações.
    lerConfigEmail().then(c => {
      if (c?.destinatarios.length) setTexto(c.destinatarios.join('\n'));
      if (c?.copia?.length) setTextoCopia(c.copia.join('\n'));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const { validos, invalidos } = lerListaEmails(texto);
  const copia = lerListaEmails(textoCopia);
  const copiaValidos = copia.validos.filter(e => !validos.includes(e));
  const estado = uf === TODOS_ESTADOS ? undefined : uf;

  /** Mostra o e-mail como vai chegar (nova aba) e baixa a planilha anexa — não envia nada. */
  function verPrevia() {
    const m = montarEmail(convocados, estado ? [estado] : estados);
    const janela = window.open('', '_blank');
    if (!janela) return toast.error('O navegador bloqueou a nova aba. Libere pop-ups para este site.');
    janela.document.title = m.assunto;
    janela.document.body.innerHTML =
      `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#555;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:12px">`
      + `<b>Prévia — nada foi enviado.</b><br>Para: ${validos.join(', ') || '(sem destinatários)'}${copiaValidos.length ? `<br>Cc: ${copiaValidos.join(', ')}` : ''}<br>Assunto: ${m.assunto}`
      + `<br>Anexo: ${m.anexo.nome} (baixado nesta máquina)</div>${m.html}`;
    const bytes = Uint8Array.from(atob(m.anexo.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: m.anexo.tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = m.anexo.nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function enviar() {
    if (invalidos.length || copia.invalidos.length) return toast.error(`E-mail inválido: ${[...invalidos, ...copia.invalidos].join(', ')}`);
    if (!validos.length) return toast.error('Informe ao menos um e-mail');
    setEnviando(true);
    try {
      // No localhost vai a lista da tela; na produção o servidor recalcula.
      const r = await enviarConvocacaoPorEmail(validos, estado, { lista: convocados, ufs: estado ? [estado] : estados }, copiaValidos);
      toast.success(`Convocação enviada para ${r.destinatarios} e-mail(s)${copiaValidos.length ? ` + ${copiaValidos.length} em cópia` : ''} com ${r.colaboradores} colaborador(es).`);
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm"><Mail className="h-4 w-4 mr-1" /> Enviar por e-mail</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar convocação por e-mail</DialogTitle>
          <DialogDescription>
            Vai a lista de convocação (vencidos e quem vence em até 30 dias) {estado ? `de ${estado}` : 'dos seus estados'},
            calculada na hora do envio, com a planilha em anexo. Hoje: {total} colaborador(es).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="dest">Destinatários (um por linha ou separados por vírgula)</Label>
          <Textarea id="dest" rows={5} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="supervisor@grupo5estrelas.com.br" />
          {invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {invalidos.join(', ')}</p>}
          <Label htmlFor="copia">Em cópia (Cc)</Label>
          <Textarea id="copia" rows={2} value={textoCopia} onChange={e => setTextoCopia(e.target.value)}
            placeholder="gestor@grupo5estrelas.com.br" />
          {copia.invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {copia.invalidos.join(', ')}</p>}
          <p className="text-xs text-muted-foreground">Os destinatários fixos, a cópia e o envio automático ficam em Configurações.</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={verPrevia} title="Mostra o e-mail e baixa a planilha, sem enviar">
            <Eye className="h-4 w-4 mr-1" /> Ver prévia
          </Button>
          <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando || !validos.length}>
            {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar para {validos.length} e-mail(s)
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
