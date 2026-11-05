import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Copy, HardHat, Link2, Loader2, Lock, MessageCircle, PenLine, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';
import {
  assinarLinhaTermo, buscarColaboradorTermo, distribuidoPorEpi, linkLinhaTermo, salvarTermo, termoDoPedido,
  type ColaboradorBusca, type Solicitante, type TermoDoPedido,
} from '../lib/pedidosService';

interface Linha {
  chave: string; id?: string; pedido_item_id: string; colaborador_senior_id: string | null; colaborador_nome: string;
  quantidade: string; assinado_em: string | null;
}
let seq = 0;
const novaChave = () => `n${++seq}`;
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const paraLinhas = (t: TermoDoPedido): Linha[] => t.linhas.map(l => ({
  chave: l.id, id: l.id, pedido_item_id: l.pedido_item_id ?? '', colaborador_senior_id: l.colaborador_senior_id,
  colaborador_nome: l.colaborador_nome, quantidade: String(l.quantidade), assinado_em: l.assinado_em,
}));

/**
 * Termo de EPI do pedido, pelo link do encarregado: monta quem recebe cada EPI
 * (colaborador buscado pelo nome na Senior) e, com o pedido atendido,
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
    setLinhas(ls => [...ls, { chave: novaChave(), pedido_item_id: epi?.item_id ?? '', colaborador_senior_id: null, colaborador_nome: '', quantidade: '1', assinado_em: null }]);
    setAlterado(true);
  };

  const salvar = async () => {
    const sem = linhas.findIndex(l => !l.assinado_em && !l.colaborador_senior_id);
    if (sem >= 0) return toast.error(`Busque o colaborador da linha ${sem + 1} na Senior.`);
    setSalvando(true);
    try {
      aplicar(await salvarTermo(quem, pedidoId, linhas.map(l => ({
        id: l.id, pedido_item_id: l.pedido_item_id, colaborador_senior_id: l.colaborador_senior_id,
        colaborador_nome: null, quantidade: Number(l.quantidade) || 0,
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
  const faltando = (termo?.epis ?? []).filter(e => (soma[e.item_id] ?? 0) < e.limite);
  // Assina só com a quantidade entregue inteira distribuída (nem menos, nem mais).
  const completo = (termo?.epis ?? []).every(e => (soma[e.item_id] ?? 0) === e.limite);
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
            {faltando.length > 0 && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                As assinaturas liberam quando a quantidade entregue estiver inteira no termo. Falta distribuir: {faltando.map(e => `${e.limite - (soma[e.item_id] ?? 0)} ${e.unidade} de ${e.nome}`).join(', ')}.
              </p>
            )}
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
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <BuscaSenior quem={quem} pedidoId={pedidoId} linha={l} doPosto={colaboradores}
                        escolher={c => mudar(l.chave, { colaborador_senior_id: c.id, colaborador_nome: c.nome })}
                        limpar={() => mudar(l.chave, { colaborador_senior_id: null, colaborador_nome: '' })} />
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Tirar do termo" onClick={() => { setLinhas(ls => ls.filter(x => x.chave !== l.chave)); setAlterado(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Select value={l.pedido_item_id} onValueChange={v => mudar(l.chave, { pedido_item_id: v })}>
                      <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder="EPI" /></SelectTrigger>
                      <SelectContent>{termo.epis.map(e => <SelectItem key={e.item_id} value={e.item_id}>{e.nome}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="w-20" inputMode="numeric" aria-label="Quantidade" value={l.quantidade}
                      onChange={e => mudar(l.chave, { quantidade: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </div>
                  {termo.liberado && completo && l.id && l.colaborador_senior_id && !alterado && (
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

/** Busca o colaborador pelo nome na Senior inteira; com o campo vazio, sugere quem é do posto. */
function BuscaSenior({ quem, pedidoId, linha, doPosto, escolher, limpar }: {
  quem: Solicitante; pedidoId: string; linha: Linha; doPosto: { id: string; nome: string; cargo: string | null }[];
  escolher: (c: { id: string; nome: string }) => void; limpar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ColaboradorBusca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const curta = busca.trim().replace(/\s/g, '').length < 3;
  useEffect(() => {
    if (curta) { setAchados(null); setBuscando(false); return; }
    let ativo = true;
    setBuscando(true);
    const id = setTimeout(() => {
      buscarColaboradorTermo(quem, pedidoId, busca.trim())
        .then(r => { if (ativo) setAchados(r); })
        .catch(e => { if (ativo) toast.error((e as Error).message); })
        .finally(() => { if (ativo) setBuscando(false); });
    }, 350);
    return () => { ativo = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, pedidoId]);

  if (linha.colaborador_senior_id) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <p className="font-medium truncate min-w-0">{linha.colaborador_nome}</p>
        <Button variant="ghost" size="sm" className="gap-1 shrink-0 h-7" onClick={limpar}><X className="h-4 w-4" /> Trocar</Button>
      </div>
    );
  }
  const escolherELimpar = (c: { id: string; nome: string }) => { escolher(c); setBusca(''); setAchados(null); };
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar colaborador pelo nome" value={busca} maxLength={150}
          onChange={e => setBusca(e.target.value)} />
        {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {linha.colaborador_nome && !busca && (
        <p className="text-xs text-amber-700 dark:text-amber-400">"{linha.colaborador_nome}" foi digitado: busque o colaborador na Senior.</p>
      )}
      {curta && !busca && doPosto.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border divide-y">
          <li className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Do posto</li>
          {doPosto.map(c => (
            <li key={c.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => escolherELimpar(c)}>{c.nome}</button>
            </li>
          ))}
        </ul>
      )}
      {achados && (
        <ul className="max-h-56 overflow-y-auto rounded-md border divide-y">
          {achados.map(c => (
            <li key={c.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted" onClick={() => escolherELimpar(c)}>
                <span className="font-medium">{c.nome}</span>
                <span className="block text-xs text-muted-foreground">{[c.cargo, c.matricula && `matrícula ${c.matricula}`].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
          {achados.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">Ninguém ativo na Senior com esse nome. Confira a grafia.</li>}
        </ul>
      )}
    </div>
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
