import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { EMAIL_VALIDO } from '../../supabase/functions/_shared/avisoMovimentacao';
import { enviarAvisosAgora, lerEmailsAviso, salvarEmailsAviso } from '@/modules/movimentacao/lib/movimentacaoService';

/**
 * Configurações → E-mail: quem recebe o aviso de lançamento DIVERGENTE do
 * Controle de Movimentação Diária (data informada diferente do dia do lançamento).
 */
export default function EmailMovimentacaoConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const [emails, setEmails] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [avisando, setAvisando] = useState(false);

  useEffect(() => { lerEmailsAviso().then(l => setEmails(l.join(', ')), () => undefined); }, []);

  const salvar = async () => {
    const lista = [...new Set(emails.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
    const ruins = lista.filter(x => !EMAIL_VALIDO.test(x));
    if (ruins.length) return toast.error(`E-mail inválido: ${ruins.join(', ')}`);
    setSalvando(true);
    try { await salvarEmailsAviso(lista); setEmails(lista.join(', ')); toast.success('E-mails do aviso salvos.'); }
    catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const avisarAgora = async () => {
    setAvisando(true);
    try {
      const r = await enviarAvisosAgora();
      if (r.enviados) toast.success(`${r.enviados} aviso(s) de divergência enviado(s) por e-mail.`);
      else toast.info(r.motivo ?? 'Nada para enviar.');
    } catch (e) { toast.error((e as Error).message); } finally { setAvisando(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Aviso de lançamento divergente</CardTitle>
        <CardDescription>
          Movimentação Diária: cada lançamento DIVERGENTE manda um e-mail com o nome do fiscal e a data para os
          endereços abaixo (na produção, automático a cada 5 minutos).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="mov-emails">E-mails (separe por vírgula)</Label>
          <Textarea id="mov-emails" rows={2} value={emails} disabled={!podeEditar} onChange={e => setEmails(e.target.value)}
            placeholder="fiscalizacao@empresa.com.br, gerente@empresa.com.br" />
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar e-mails
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={avisarAgora} disabled={avisando}>
              {avisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar avisos pendentes agora
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
