import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Eye, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { enviarEmailIntegracao, lerListaEmails } from '@/services/emailConvocacaoService';
import { montarEmailIntegracao, type PessoaIntegracao } from '../../supabase/functions/_shared/emailIntegracao';

const LEMBRAR = 'integracao-email';

/** Envia por e-mail a lista de quem participou da integração (com planilha Excel). */
export default function EnviarIntegracaoDialog({ pessoas, aberto, onFechar }: {
  pessoas: PessoaIntegracao[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Lembra os últimos destinatários usados nesta máquina.
  useEffect(() => {
    if (!aberto) return;
    try {
      const salvo = JSON.parse(localStorage.getItem(LEMBRAR) ?? '{}');
      if (!texto && salvo.para) setTexto(salvo.para);
      if (!textoCopia && salvo.copia) setTextoCopia(salvo.copia);
    } catch { /* sem armazenamento */ }
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const para = lerListaEmails(texto);
  const copia = lerListaEmails(textoCopia);
  const copiaValidos = copia.validos.filter(e => !para.validos.includes(e));

  function verPrevia() {
    const m = montarEmailIntegracao(pessoas, { data, observacao });
    const janela = window.open('', '_blank');
    if (!janela) return toast.error('O navegador bloqueou a nova aba. Libere pop-ups para este site.');
    janela.document.title = m.assunto;
    janela.document.body.innerHTML =
      `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#555;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:12px">`
      + `<b>Prévia — nada foi enviado.</b><br>Para: ${para.validos.join(', ') || '(sem destinatários)'}`
      + `${copiaValidos.length ? `<br>Cc: ${copiaValidos.join(', ')}` : ''}<br>Assunto: ${m.assunto}`
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
    if (para.invalidos.length || copia.invalidos.length) {
      return toast.error(`E-mail inválido: ${[...para.invalidos, ...copia.invalidos].join(', ')}`);
    }
    if (!para.validos.length) return toast.error('Informe ao menos um destinatário');
    setEnviando(true);
    try {
      const r = await enviarEmailIntegracao({
        destinatarios: para.validos, copia: copiaValidos, pessoas, data, observacao,
      });
      try { localStorage.setItem(LEMBRAR, JSON.stringify({ para: texto, copia: textoCopia })); } catch { /* sem armazenamento */ }
      toast.success(`Lista da integração enviada (${r.colaboradores} colaborador(es)) para ${r.destinatarios} e-mail(s)`
        + (r.copia ? ` + ${r.copia} em cópia.` : '.'));
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => !o && !enviando && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar lista da integração ({pessoas.length})</DialogTitle>
          <DialogDescription>
            Vai a lista dos colaboradores selecionados, com cargo, posto, admissão e situação das fichas, e a planilha
            Excel em anexo. Sai pela conta do Microsoft 365 conectada em Configurações.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="int-data">Data da integração</Label>
              <Input id="int-data" type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="int-para">Destinatários (um por linha ou separados por vírgula)</Label>
            <Textarea id="int-para" rows={3} value={texto} onChange={e => setTexto(e.target.value)} placeholder="rh@grupo5estrelas.com.br" />
            {para.invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {para.invalidos.join(', ')}</p>}
          </div>
          <div>
            <Label htmlFor="int-copia">Em cópia (Cc)</Label>
            <Textarea id="int-copia" rows={2} value={textoCopia} onChange={e => setTextoCopia(e.target.value)} placeholder="gestor@grupo5estrelas.com.br" />
            {copia.invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {copia.invalidos.join(', ')}</p>}
          </div>
          <div>
            <Label htmlFor="int-obs">Observação (opcional, vai no corpo do e-mail)</Label>
            <Textarea id="int-obs" rows={2} value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex.: integração realizada na sede, turma da manhã." />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={verPrevia} title="Mostra o e-mail e baixa a planilha, sem enviar">
            <Eye className="h-4 w-4 mr-1" /> Ver prévia
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || !para.validos.length}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
