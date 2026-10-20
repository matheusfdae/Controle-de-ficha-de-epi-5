import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Check, CheckCircle2, Clock, Copy, Download, ExternalLink, Inbox, Link2, Loader2, MessageCircle, User, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getPhotoUrl } from '../lib/photoUtils';
import { formatarTelefone, revisarSolicitacao, type StatusSolicitacao } from '../lib/solicitacaoService';

/**
 * Solicitações de crachá feitas no link público (quem pede se identifica).
 * O RH confere (foto atual × foto nova, dados da Senior) e aprova ou recusa;
 * aprovada, a foto nova vira a foto do crachá e ele aparece em Gerar Crachás.
 */

interface Solicitacao {
  id: string;
  full_name: string;
  employee_id: string;
  role: string | null;
  company: string | null;
  cnv: string | null;
  blood_type: string | null;
  photo_url: string | null;
  request_photo_url: string | null;
  request_status: StatusSolicitacao;
  request_reason: string | null;
  requested_at: string | null;
  requester_name: string | null;
  requester_matricula: string | null;
  requester_cargo: string | null;
  requester_phone: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  desligado_em: string | null;
}

const ABAS = [
  { valor: 'pendentes', rotulo: 'Pendentes', status: ['recebida', 'em_analise'] },
  { valor: 'aprovada', rotulo: 'Aprovadas', status: ['aprovada'] },
  { valor: 'rejeitada', rotulo: 'Recusadas', status: ['rejeitada'] },
] as const;

const SELO: Record<StatusSolicitacao, { rotulo: string; cls: string; Icone: typeof Inbox }> = {
  recebida: { rotulo: 'Recebida', cls: 'bg-primary/10 text-primary border-primary/20', Icone: Inbox },
  em_analise: { rotulo: 'Em análise', cls: 'bg-warning/10 text-warning border-warning/20', Icone: Clock },
  aprovada: { rotulo: 'Aprovada', cls: 'bg-success/10 text-success border-success/20', Icone: CheckCircle2 },
  rejeitada: { rotulo: 'Recusada', cls: 'bg-destructive/10 text-destructive border-destructive/20', Icone: XCircle },
};

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const Foto = ({ url, rotulo }: { url: string | null; rotulo: string }) => (
  <div className="text-center">
    <div className="w-24 h-32 rounded-md border bg-muted/40 overflow-hidden flex items-center justify-center">
      {url
        ? <a href={getPhotoUrl(url)} target="_blank" rel="noreferrer"><img src={getPhotoUrl(url)} alt={rotulo} className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} referrerPolicy="no-referrer" /></a>
        : <User className="h-8 w-8 text-muted-foreground" />}
    </div>
    <p className="text-[11px] text-muted-foreground mt-1">{rotulo}</p>
  </div>
);

const LinkPublico = () => {
  const url = `${window.location.origin}/crachas/solicitacao`;
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setQr).catch(() => setQr(null)); }, [url]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5 text-primary" /> Link de solicitação</CardTitle>
        <CardDescription>
          Não precisa de login: quem solicita entra com a própria matrícula e CPF (precisa estar ativo na Senior), informa o colaborador e manda a foto.
          Funciona no celular, dentro ou fora da rede.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-4 items-start">
        {qr && <img src={qr} alt="QR Code do link de solicitação" className="w-28 h-28 rounded border bg-white" />}
        <div className="flex-1 w-full space-y-2">
          <Input value={url} readOnly className="font-mono text-sm bg-background" onFocus={e => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copiar} className="gap-2">
              {copiado ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />} {copiado ? 'Copiado!' : 'Copiar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open(url, '_blank')} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Abrir
            </Button>
            {qr && (
              <Button type="button" variant="outline" size="sm" asChild className="gap-2">
                <a href={qr} download="qrcode-solicitar-cracha.png"><Download className="h-4 w-4" /> Baixar QR Code</a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const SolicitarCracha = () => {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const podeEditar = can('crachas', 'edit');
  const [aba, setAba] = useState<(typeof ABAS)[number]['valor']>('pendentes');
  const [recusando, setRecusando] = useState<Solicitacao | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ['cracha_solicitacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_employees')
        .select('id, full_name, employee_id, role, company, cnv, blood_type, photo_url, request_photo_url, request_status, request_reason, requested_at, requester_name, requester_matricula, requester_cargo, requester_phone, rejection_reason, reviewed_at, desligado_em')
        .not('request_status', 'is', null)
        .order('requested_at', { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data as Solicitacao[];
    },
    refetchInterval: 60_000,
  });

  const contagem = useMemo(() => Object.fromEntries(ABAS.map(a => [a.valor,
    solicitacoes.filter(s => (a.status as readonly string[]).includes(s.request_status)).length])), [solicitacoes]);
  const lista = solicitacoes.filter(s => (ABAS.find(a => a.valor === aba)!.status as readonly string[]).includes(s.request_status));
  // Pendentes: mais antigas primeiro (fila); as demais: mais recentes primeiro.
  if (aba === 'pendentes') lista.reverse();

  const revisar = async (s: Solicitacao, status: StatusSolicitacao, motivo?: string) => {
    setSalvando(s.id);
    try {
      await revisarSolicitacao(s, status, motivo);
      toast.success(status === 'aprovada' ? `Aprovada: ${s.full_name} já pode ser gerado em Gerar Crachás`
        : status === 'rejeitada' ? 'Solicitação recusada' : 'Marcada em análise');
      queryClient.invalidateQueries({ queryKey: ['cracha_solicitacoes'] });
      queryClient.invalidateQueries({ queryKey: ['cracha_employees'] });
      setRecusando(null);
      setMotivoRecusa('');
    } catch (e) {
      toast.error('Erro ao atualizar: ' + (e as Error).message);
    } finally {
      setSalvando(null);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Inbox className="h-6 w-6 text-primary" /> Solicitações de crachá</h1>
          <p className="text-muted-foreground mt-1">Pedidos feitos pelo link, com os dados da Senior e quem solicitou.</p>
        </div>

        <LinkPublico />

        <Tabs value={aba} onValueChange={v => setAba(v as typeof aba)}>
          <TabsList>
            {ABAS.map(a => <TabsTrigger key={a.valor} value={a.valor}>{a.rotulo} ({contagem[a.valor] ?? 0})</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !lista.length ? (
          <p className="text-center text-muted-foreground py-10">Nenhuma solicitação aqui.</p>
        ) : (
          <div className="space-y-3">
            {lista.map(s => {
              const selo = SELO[s.request_status] ?? SELO.recebida;
              const tel = s.requester_phone?.replace(/\D/g, '');
              return (
                <Card key={s.id}>
                  <CardContent className="pt-4 flex flex-col md:flex-row gap-4">
                    <div className="flex gap-2 shrink-0">
                      <Foto url={s.photo_url} rotulo="Foto atual" />
                      {s.request_photo_url && s.request_photo_url !== s.photo_url && <Foto url={s.request_photo_url} rotulo="Foto enviada" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-base">{s.full_name}</span>
                        <Badge variant="outline" className={`${selo.cls} gap-1`}><selo.Icone className="h-3 w-3" /> {selo.rotulo}</Badge>
                        {s.desligado_em && <Badge variant="destructive">Desligado</Badge>}
                      </div>
                      <p className="text-muted-foreground">
                        Matrícula {s.employee_id}{s.role ? ` · ${s.role}` : ''}{s.company ? ` · ${s.company}` : ''}
                      </p>
                      <p><span className="text-muted-foreground">Motivo:</span> {s.request_reason || '—'}</p>
                      <p>
                        <span className="text-muted-foreground">Tipo sanguíneo:</span> {s.blood_type || '—'}
                        <span className="text-muted-foreground ml-3">CNV:</span> {s.cnv || '—'}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Solicitado por:</span> {s.requester_name || '—'}
                        {s.requester_cargo ? ` (${s.requester_cargo}` : ''}{s.requester_matricula ? `, mat. ${s.requester_matricula})` : s.requester_cargo ? ')' : ''}
                        {' '}em {dataHora(s.requested_at)}
                      </p>
                      {tel && (
                        <a href={`https://wa.me/55${tel}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <MessageCircle className="h-3.5 w-3.5" /> {formatarTelefone(tel)}
                        </a>
                      )}
                      {s.request_status === 'rejeitada' && s.rejection_reason && (
                        <p className="text-destructive"><strong>Motivo da recusa:</strong> {s.rejection_reason}</p>
                      )}
                      {s.reviewed_at && s.request_status !== 'recebida' && (
                        <p className="text-xs text-muted-foreground">Revisada em {dataHora(s.reviewed_at)}</p>
                      )}
                    </div>
                    {podeEditar && (s.request_status === 'recebida' || s.request_status === 'em_analise') && (
                      <div className="flex md:flex-col gap-2 shrink-0">
                        <Button size="sm" className="gap-1" disabled={salvando === s.id} onClick={() => revisar(s, 'aprovada')}>
                          {salvando === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" disabled={salvando === s.id}
                          onClick={() => { setRecusando(s); setMotivoRecusa(''); }}>
                          <XCircle className="h-4 w-4" /> Recusar
                        </Button>
                        {s.request_status === 'recebida' && (
                          <Button size="sm" variant="ghost" className="gap-1" disabled={salvando === s.id} onClick={() => revisar(s, 'em_analise')}>
                            <Clock className="h-4 w-4" /> Em análise
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      </div>

      <Dialog open={!!recusando} onOpenChange={o => { if (!o) setRecusando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar solicitação</DialogTitle>
            <DialogDescription>
              {recusando?.full_name}. Quem solicitou vê o motivo ao consultar o colaborador de novo.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} maxLength={300} value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)}
            placeholder="Ex.: foto escura, colaborador de boné, CNV errada..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={!motivoRecusa.trim() || salvando === recusando?.id}
              onClick={() => recusando && revisar(recusando, 'rejeitada', motivoRecusa)}>
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default SolicitarCracha;
