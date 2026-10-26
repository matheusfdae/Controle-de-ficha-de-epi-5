import { Fragment, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Ban, Check, CheckCheck, ChevronDown, ChevronRight, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  cancelarLoteWhatsApp, lerLoteWhatsApp, listarLotesWhatsApp, type MensagemLote, type ResumoLote, type SituacaoMensagem,
} from '@/services/whatsappService';

const ATUALIZAR_MS = 30_000;

const dataHora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "556194332974@s.whatsapp.net" -> "(61) 9433-2974"; com o 9: "(61) 99433-2974". */
function telefoneDoJid(jid: string) {
  const d = jid.split('@')[0].replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d;
}

const SITUACOES: Record<SituacaoMensagem, { texto: string; cor: string; Icone: typeof Check }> = {
  PENDING: { texto: 'Agendada', cor: 'text-muted-foreground', Icone: Clock },
  SENT: { texto: 'Enviada', cor: 'text-muted-foreground', Icone: Check },
  DELIVERED: { texto: 'Entregue', cor: 'text-foreground', Icone: CheckCheck },
  READ: { texto: 'Lida', cor: 'text-sky-600', Icone: CheckCheck },
  FAILED: { texto: 'Falhou', cor: 'text-destructive', Icone: XCircle },
};
const ORDEM: SituacaoMensagem[] = ['READ', 'DELIVERED', 'SENT', 'PENDING', 'FAILED'];

function Situacao({ s, erro }: { s: SituacaoMensagem; erro?: string | null }) {
  const { texto, cor, Icone } = SITUACOES[s];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${cor}`} title={erro ?? undefined}>
      <Icone className="h-4 w-4" /> {texto}
    </span>
  );
}

/** Uma linha por envio, com a contagem de cada situação e as mensagens ao abrir. */
function Lote({ resumo, onCancelado }: { resumo: ResumoLote; onCancelado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemLote[] | null>(null);
  const [verTexto, setVerTexto] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const carregar = useCallback(() => lerLoteWhatsApp(resumo.batchId).then(setMensagens)
    .catch(e => toast.error(e instanceof Error ? e.message : 'Falha ao ler o envio')), [resumo.batchId]);
  // Recarrega as mensagens junto com o resumo (a cada atualização da aba).
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar, resumo]);

  async function cancelar() {
    setCancelando(true);
    try {
      const r = await cancelarLoteWhatsApp(resumo.batchId);
      toast.success(`${r.cancelled} mensagem(ns) cancelada(s).`);
      onCancelado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar');
    } finally {
      setCancelando(false);
    }
  }

  const feitas = resumo.total - resumo.PENDING;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => setAberto(!aberto)}>
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>
              <CardTitle className="text-base">Envio de {dataHora(resumo.createdAt)}</CardTitle>
              <span className="block text-xs text-muted-foreground">
                {resumo.total} mensagem(ns) · {resumo.PENDING
                  ? `saindo até por volta de ${hora(resumo.lastSendAt)}`
                  : `concluído às ${hora(resumo.lastSendAt)}`}
              </span>
            </span>
          </button>
          {resumo.PENDING > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={cancelando}>
                  {cancelando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ban className="h-4 w-4 mr-1" />}
                  Cancelar as {resumo.PENDING} que faltam
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar o resto deste envio?</AlertDialogTitle>
                  <AlertDialogDescription>
                    As {resumo.PENDING} mensagem(ns) que ainda não saíram não serão enviadas. As {feitas} que já saíram não
                    têm como ser desfeitas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={cancelar}>Cancelar as que faltam</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {ORDEM.filter(s => resumo[s] > 0).map(s => (
            <span key={s} className="inline-flex items-center gap-1">
              <Situacao s={s} /> <strong className="text-sm">{resumo[s]}</strong>
            </span>
          ))}
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted" title={`${feitas} de ${resumo.total} já saíram`}>
          <div className="bg-sky-500" style={{ width: `${(resumo.READ / resumo.total) * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${(resumo.DELIVERED / resumo.total) * 100}%` }} />
          <div className="bg-emerald-300" style={{ width: `${(resumo.SENT / resumo.total) * 100}%` }} />
          <div className="bg-destructive" style={{ width: `${(resumo.FAILED / resumo.total) * 100}%` }} />
        </div>
      </CardHeader>
      {aberto && (
        <CardContent>
          {!mensagens ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem neste envio (canceladas).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mensagens.map(m => (
                  <Fragment key={m.id}>
                    <TableRow className="cursor-pointer" onClick={() => setVerTexto(verTexto === m.id ? null : m.id)}
                      title="Clique para ver o texto enviado">
                      <TableCell className="font-medium">{m.label || '—'}</TableCell>
                      <TableCell>{telefoneDoJid(m.jid)}</TableCell>
                      <TableCell>{hora(m.sendAt)}</TableCell>
                      <TableCell><Situacao s={m.delivery} erro={m.error} /></TableCell>
                    </TableRow>
                    {verTexto === m.id && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs font-sans">{m.content}</pre>
                          {m.error && <p className="mt-1 text-xs text-destructive">Erro: {m.error}</p>}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** Aba "Envios WhatsApp": situação das mensagens da convocação, atualizada a cada 30 s. */
export default function EnviosWhatsAppPanel() {
  const [lotes, setLotes] = useState<ResumoLote[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLotes(await listarLotesWhatsApp());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao ler os envios');
      setLotes(l => l ?? []);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, ATUALIZAR_MS);
    return () => clearInterval(id);
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Os últimos envios da convocação pelo WhatsApp. <Check className="inline h-3 w-3" /> enviada ·{' '}
          <CheckCheck className="inline h-3 w-3" /> entregue no celular ·{' '}
          <CheckCheck className="inline h-3 w-3 text-sky-600" /> lida (quem desligou a confirmação de leitura fica
          como entregue). Atualiza sozinho a cada 30 s.
        </p>
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 mr-1 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>
      {lotes === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : lotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum envio ainda. Use "Enviar por WhatsApp" na aba Convocação.</p>
      ) : (
        lotes.map(l => <Lote key={l.batchId} resumo={l} onCancelado={carregar} />)
      )}
    </div>
  );
}
