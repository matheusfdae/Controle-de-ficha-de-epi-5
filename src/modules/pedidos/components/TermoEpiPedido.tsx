import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Copy, HardHat, Link2, Loader2, Lock, MessageCircle, PenLine, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';
import {
  assinarLinhaTermo, distribuidoPorEpi, linkLinhaTermo, salvarTermo, termoDoPedido,
  type Solicitante, type TermoDoPedido,
} from '../lib/pedidosService';

const OUTRO = '__outro__';
interface Linha {
  chave: string; id?: string; pedido_item_id: string; colaborador_senior_id: string | null; colaborador_nome: string;
  /** Nome digitado (fora da lista da Senior). */
  outro: boolean;
  quantidade: string; assinado_em: string | null;
}
let seq = 0;
const novaChave = () => `n${++seq}`;
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const paraLinhas = (t: TermoDoPedido): Linha[] => t.linhas.map(l => ({
  chave: l.id, id: l.id, pedido_item_id: l.pedido_item_id ?? '', colaborador_senior_id: l.colaborador_senior_id,
  colaborador_nome: l.colaborador_nome, outro: !l.colaborador_senior_id, quantidade: String(l.quantidade), assinado_em: l.assinado_em,
}));

/**
 * Termo de EPI do pedido, pelo link do encarregado: monta quem recebe cada EPI
 * (colaboradores do posto na Senior, ou nome digitado) e, com o pedido atendido,
 * colhe a assinatura no celular dele ou manda o link para o colaborador.
 */
export default function TermoEpiPedido({ quem, pedidoId, codigo, posto, aberto, fechar }: {
  quem: Solicitante; pedidoId: string; codigo: string; posto: string; aberto: boolean; fechar: () => void;
}) {
  const [termo, setTermo] = useState<TermoDoPedido | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [assinando, setAssinando] = useState<Linha | null>(null);
  const [link, setLink] = useState<{ linha: string; url: string; nome: string } | null>(null);

  const aplicar = (t: TermoDoPedido) => { setTermo(t); setLinhas(paraLinhas(t)); setAlterado(false); };
  useEffect(() => {
    if (!aberto) return;
    setTermo(null); setLink(null); setAssinando(null);
    termoDoPedido(quem, pedidoId).then(aplicar).catch(e => { toast.error(e.message); fechar(); });
    // Só ao abrir: quem/fechar mudam a cada render do cartão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, pedidoId]);

  const soma = useMemo(() => distribuidoPorEpi(linhas.map(l => ({ pedido_item_id: l.pedido_item_id, quantidade: Number(l.quantidade) || 0 }))), [linhas]);
  const mudar = (chave: string, m: Partial<Linha>) => { setLinhas(ls => ls.map(l => (l.chave === chave ? { ...l, ...m } : l))); setAlterado(true); setLink(null); };
  const adicionar = () => {
    const epi = termo?.epis.find(e => (soma[e.item_id] ?? 0) < e.limite) ?? termo?.epis[0];
    setLinhas(ls => [...ls, { chave: novaChave(), pedido_item_id: epi?.item_id ?? '', colaborador_senior_id: null, colaborador_nome: '', outro: false, quantidade: '1', assinado_em: null }]);
    setAlterado(true);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      aplicar(await salvarTermo(quem, pedidoId, linhas.map(l => ({
        id: l.id, pedido_item_id: l.pedido_item_id, colaborador_senior_id: l.colaborador_senior_id,
        colaborador_nome: l.colaborador_senior_id ? null : l.colaborador_nome, quantidade: Number(l.quantidade) || 0,
      }))));
      toast.success('Termo salvo.');
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const gerarLink = async (l: Linha) => {
    try {
      const r = await linkLinhaTermo(quem, l.id!);
      setLink({ linha: l.chave, url: `${window.location.origin}/assinar-termo-coletivo/${r.token}`, nome: r.colaborador });
    } catch (e) { toast.error((e as Error).message); }
  };
  const textoLink = (nome: string, url: string) =>
    `Olá, ${nome.split(' ')[0]}! Assine o Termo de Entrega de EPI do posto ${posto} por este link:\n${url}`;

  const nomeEpi = (id: string) => termo?.epis.find(e => e.item_id === id);
  const colaboradores = termo?.colaboradores ?? [];

  return (
    <Dialog open={aberto} onOpenChange={v => !v && !salvando && fechar()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HardHat className="h-5 w-5 text-amber-600" /> Termo de EPI · {codigo}</DialogTitle>
          <DialogDescription>{posto}: quem recebe cada EPI deste pedido.</DialogDescription>
        </DialogHeader>

        {!termo ? <Loader2 className="h-5 w-5 animate-spin" /> : assinando ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p><span className="text-muted-foreground">Colaborador:</span> <b>{assinando.colaborador_nome}</b></p>
              <p><span className="text-muted-foreground">EPI:</span> {nomeEpi(assinando.pedido_item_id)?.nome} · {assinando.quantidade} {nomeEpi(assinando.pedido_item_id)?.unidade}
                {nomeEpi(assinando.pedido_item_id)?.ca && ` · CA ${nomeEpi(assinando.pedido_item_id)?.ca}`}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Declaro ter recebido o EPI acima em perfeito estado, comprometendo-me com seu uso e cuidado conforme a NR-06.
            </p>
            <AssinarAqui
              cancelar={() => setAssinando(null)}
              confirmar={async img => {
                try { aplicar(await assinarLinhaTermo(quem, assinando.id!, img)); toast.success(`Assinatura de ${assinando.colaborador_nome} registrada.`); setAssinando(null); }
                catch (e) { toast.error((e as Error).message); }
              }} />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {termo.epis.map(e => {
                const n = soma[e.item_id] ?? 0;
                return (
                  <Badge key={e.item_id} variant="outline" className={n > e.limite ? 'border-destructive text-destructive' : ''}>
                    {e.nome}{e.ca ? ` (CA ${e.ca})` : ''}: {n} de {e.limite} {e.unidade}
                  </Badge>
                );
              })}
            </div>
            {!termo.liberado && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Monte o termo agora. As assinaturas abrem quando o pedido for <b>atendido</b> (EPI entregue no posto).
              </p>
            )}

            {linhas.length === 0 && <p className="text-xs text-muted-foreground">Ninguém no termo ainda. Adicione quem vai receber o EPI.</p>}
            <ul className="space-y-2">
              {linhas.map(l => l.assinado_em ? (
                <li key={l.chave} className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5">
                  <p className="font-medium flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {l.colaborador_nome}</p>
                  <p className="text-xs text-muted-foreground">{nomeEpi(l.pedido_item_id)?.nome} · {l.quantidade} · assinado em {dataHora(l.assinado_em)}</p>
                </li>
              ) : (
                <li key={l.chave} className="rounded-md border p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <Select value={l.colaborador_senior_id ?? (l.outro ? OUTRO : '')}
                      onValueChange={v => mudar(l.chave, v === OUTRO
                        ? { colaborador_senior_id: null, outro: true, colaborador_nome: '' }
                        : { colaborador_senior_id: v, outro: false, colaborador_nome: colaboradores.find(c => c.id === v)?.nome ?? '' })}>
                      <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                      <SelectContent className="max-h-80">
                        {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        <SelectItem value={OUTRO}>Outro (digitar o nome)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" aria-label="Tirar do termo" onClick={() => { setLinhas(ls => ls.filter(x => x.chave !== l.chave)); setAlterado(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {l.outro && (
                    <Input placeholder="Nome completo do colaborador" value={l.colaborador_nome} maxLength={150}
                      onChange={e => mudar(l.chave, { colaborador_nome: e.target.value })} />
                  )}
                  <div className="flex gap-2">
                    <Select value={l.pedido_item_id} onValueChange={v => mudar(l.chave, { pedido_item_id: v })}>
                      <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="EPI" /></SelectTrigger>
                      <SelectContent>{termo.epis.map(e => <SelectItem key={e.item_id} value={e.item_id}>{e.nome}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="w-20" inputMode="numeric" aria-label="Quantidade" value={l.quantidade}
                      onChange={e => mudar(l.chave, { quantidade: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </div>
                  {termo.liberado && l.id && !alterado && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="gap-1" onClick={() => setAssinando(l)}><PenLine className="h-4 w-4" /> Assinar aqui</Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => gerarLink(l)}><Link2 className="h-4 w-4" /> Enviar link</Button>
                    </div>
                  )}
                  {link?.linha === l.chave && (
                    <div className="rounded-md bg-muted p-2 space-y-2">
                      <p className="text-xs break-all">{link.url}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="gap-1 border-emerald-600/40 text-emerald-700 dark:text-emerald-400" asChild>
                          <a href={`https://wa.me/?text=${encodeURIComponent(textoLink(link.nome, link.url))}`} target="_blank" rel="noreferrer">
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1"
                          onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success('Link copiado.'), () => toast.error('Não deu para copiar; segure o link para copiar.'))}>
                          <Copy className="h-4 w-4" /> Copiar
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-1" onClick={adicionar}><Plus className="h-4 w-4" /> Adicionar colaborador</Button>
              <Button className="gap-1 ml-auto" disabled={!alterado || salvando} onClick={salvar}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar termo
              </Button>
            </div>
            {termo.liberado && alterado && <p className="text-xs text-amber-700 dark:text-amber-400">Salve o termo para assinar ou enviar os links.</p>}
            {linhas.some(l => l.assinado_em) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Linha assinada não pode ser alterada.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssinarAqui({ confirmar, cancelar }: { confirmar: (img: string) => Promise<void>; cancelar: () => void }) {
  const [img, setImg] = useState('');
  const [enviando, setEnviando] = useState(false);
  return (
    <>
      <SignaturePad label="Assinatura do colaborador" onSave={setImg} grande />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={cancelar} disabled={enviando}>Voltar</Button>
        <Button className="gap-1" disabled={!img || enviando} onClick={async () => { setEnviando(true); await confirmar(img); setEnviando(false); }}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar assinatura
        </Button>
      </div>
    </>
  );
}
