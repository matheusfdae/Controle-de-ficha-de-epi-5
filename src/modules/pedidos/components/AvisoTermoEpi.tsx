import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HardHat, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { enviarAvisoTermo, termosAbertos, type TermoAberto } from '../lib/pedidosService';

const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const celular = (n: string) => n.replace(/^55(\d{2})(\d+)(\d{4})$/, '($1) $2-$3');

/** Aviso "Termo de EPI disponível" pelo WhatsApp: automático ao atender, com lembretes, e o envio à mão por pedido. */
export default function AvisoTermoEpi({ podeEditar }: { podeEditar: boolean }) {
  const [termos, setTermos] = useState<TermoAberto[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try { setTermos(await termosAbertos()); } catch (e) { toast.error((e as Error).message); } finally { setCarregando(false); }
  };
  const enviar = async (t: TermoAberto) => {
    setEnviando(t.pedido_id);
    try {
      const r = await enviarAvisoTermo(t.pedido_id);
      if (r.enviado) { toast.success(`Aviso do ${t.codigo} enviado para ${celular(r.numero ?? '')}. Chega em cerca de 1 minuto.`); await carregar(); }
      else toast.error(`Não enviado: ${r.motivo}.`);
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><HardHat className="h-5 w-5 text-amber-600" /> Aviso do Termo de EPI por WhatsApp</CardTitle>
        <CardDescription>
          Quando Compras atende um pedido com EPI, o líder que pediu recebe no WhatsApp que o Termo de EPI está disponível para as
          assinaturas; enquanto o termo não finaliza, recebe lembrete a cada 2 dias (até 3, das 8h às 18h). Vai para o celular que o
          líder digitou no link do pedido (sem esse, o da Senior). Aqui dá para mandar o aviso de novo, na hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {podeEditar && (
          <Button variant="outline" className="gap-2" disabled={carregando} onClick={carregar}>
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {termos ? 'Atualizar' : 'Ver termos abertos'}
          </Button>
        )}
        {termos && termos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum termo aberto: todos os pedidos atendidos com EPI já têm o termo finalizado.</p>}
        {termos && termos.length > 0 && (
          <ul className="divide-y rounded-md border">
            {termos.map(t => (
              <li key={t.pedido_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{t.codigo} · {t.posto}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.lider || '—'} · {t.numero ? celular(t.numero) : <span className="text-destructive">sem celular</span>} · Termo {t.situacao}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.ultimo_envio ? `Último aviso: ${dataHora(t.ultimo_envio)}${t.lembretes ? ` · ${t.lembretes} lembrete${t.lembretes > 1 ? 's' : ''}` : ''}` : 'Ainda não avisado'}
                  </p>
                </div>
                {podeEditar && (
                  <Button size="sm" className="gap-1 shrink-0" disabled={!t.numero || !!enviando} onClick={() => enviar(t)}>
                    {enviando === t.pedido_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar aviso agora
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
