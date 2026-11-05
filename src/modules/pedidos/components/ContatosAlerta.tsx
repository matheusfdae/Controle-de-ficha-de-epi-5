import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, MessageCircle, Pencil, Plus, Send, Trash2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ajustarContatoAlerta, alertarPedidosWhatsApp, baseDoAlerta, desfazerAjusteAlerta, hojeBr } from '../lib/pedidosService';
import { DIAS_CONTATOS, aplicarAjustes, contatosDoPosto, type Contato, type OrigemContato } from '../../../../supabase/functions/_shared/alertaPedido';
import { numeroWhatsApp } from '../../../../supabase/functions/_shared/whatsapp';

const ORIGEM: Record<OrigemContato, { rotulo: string; classe: string }> = {
  senior: { rotulo: 'Senior', classe: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  link: { rotulo: 'digitado no link', classe: 'bg-muted text-muted-foreground' },
  corrigido: { rotulo: 'corrigido', classe: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  manual: { rotulo: 'adicionado', classe: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
};
const formatar = (n: string) => `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;

/**
 * Quem recebe o alerta de pedido por WhatsApp de um posto: quem pediu pelo link
 * (celular da Senior primeiro; senão o digitado), com corrigir número, tirar da
 * lista e adicionar contato. E o botão de enviar o lembrete agora.
 */
export default function ContatosAlerta({ postoId, postoNome, diaPedido, podeEditar }: {
  postoId: string; postoNome: string; diaPedido: string; podeEditar: boolean;
}) {
  const [lista, setLista] = useState<{ recebem: Contato[]; removidos: Contato[] } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [numeroEdit, setNumeroEdit] = useState('');
  const [novo, setNovo] = useState<{ nome: string; numero: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { pedidos, ajustes } = await baseDoAlerta(postoId);
      setLista(aplicarAjustes(contatosDoPosto(pedidos, hojeBr()), ajustes));
    } catch (e) { toast.error((e as Error).message); setLista({ recebem: [], removidos: [] }); }
  }, [postoId]);
  useEffect(() => { setLista(null); setEditando(null); setNovo(null); carregar(); }, [carregar]);

  const agir = async (fn: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try { await fn(); toast.success(ok); setEditando(null); setNovo(null); await carregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setOcupado(false); }
  };
  const salvarNumero = (c: Contato) => {
    const n = numeroWhatsApp(numeroEdit);
    if (!n) return toast.error('Celular inválido: DDD + 9 dígitos, ex.: (61) 99999-1234.');
    agir(() => ajustarContatoAlerta(postoId, 'corrigir', c.chave, c.nome, n), `Número de ${c.nome || 'contato'} corrigido.`);
  };
  const adicionar = () => {
    if (!novo?.nome.trim()) return toast.error('Informe o nome.');
    const n = numeroWhatsApp(novo.numero);
    if (!n) return toast.error('Celular inválido: DDD + 9 dígitos, ex.: (61) 99999-1234.');
    agir(() => ajustarContatoAlerta(postoId, 'adicionar', null, novo.nome.trim(), n), `${novo.nome.trim()} adicionado ao alerta.`);
  };
  const enviarAgora = async () => {
    if (!lista?.recebem.length) return;
    if (!confirm(`Enviar agora pelo WhatsApp o lembrete do pedido de ${postoNome} para ${lista.recebem.length} pessoa(s)?`)) return;
    setEnviando(true);
    try {
      const r = await alertarPedidosWhatsApp('posto', postoId);
      if (r.enviado) toast.success(`${r.agendados} lembrete(s) agendado(s) no WhatsApp. O primeiro sai em cerca de 1 minuto.`);
      else toast.info(r.motivo ?? 'Nenhuma mensagem enviada.');
      if (r.sem_whatsapp?.length) toast.warning(`Sem WhatsApp: ${r.sem_whatsapp.join(', ')}`);
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <div className="rounded-md border p-3 text-sm space-y-2">
      <p className="font-medium flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600" /> Alerta de pedido por WhatsApp</p>
      <p className="text-xs text-muted-foreground">
        {diaPedido ? <>Sai 2 dias antes e no dia {diaPedido} de cada mês, às 8h, com o link do pedido (não sai se o posto já pediu perto da data).</>
          : <>Defina o dia do pedido para o posto receber o lembrete automático.</>}
        {' '}Recebe quem pediu por este posto pelo link nos últimos {DIAS_CONTATOS} dias (celular da Senior; sem celular lá, o que a pessoa digitou)
        e os contatos adicionados aqui.
      </p>

      {lista === null ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
        {lista.recebem.length === 0
          ? <p className="text-xs text-amber-600">Ninguém para receber: ninguém pediu por este posto pelo link nos últimos {DIAS_CONTATOS} dias. Adicione um contato abaixo.</p>
          : (
            <ul className="divide-y rounded-md border">
              {lista.recebem.map(c => (
                <li key={c.numero} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="font-medium min-w-40">{c.nome || 'Sem nome'}</span>
                  {editando === c.numero ? (
                    <span className="flex items-center gap-1">
                      <Input autoFocus inputMode="tel" className="h-7 w-40 text-xs" value={numeroEdit} placeholder="(61) 99999-1234"
                        onChange={e => setNumeroEdit(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarNumero(c)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={ocupado} aria-label="Salvar número" onClick={() => salvarNumero(c)}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Cancelar" onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
                    </span>
                  ) : <span className="tabular-nums">{formatar(c.numero)}</span>}
                  <Badge variant="outline" className={`border-0 text-[10px] ${ORIGEM[c.origem].classe}`}>{ORIGEM[c.origem].rotulo}</Badge>
                  {c.ultimo && <span className="text-muted-foreground">pediu em {c.ultimo.split('-').reverse().join('/')}</span>}
                  {podeEditar && editando !== c.numero && (
                    <span className="ml-auto flex items-center">
                      {c.chave && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={ocupado}
                          onClick={() => { setEditando(c.numero); setNumeroEdit(formatar(c.numero)); }}><Pencil className="h-3.5 w-3.5" /> Corrigir</Button>
                      )}
                      {c.origem === 'corrigido' && c.ajusteId && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={ocupado}
                          onClick={() => agir(() => desfazerAjusteAlerta(c.ajusteId!), 'Voltou ao número de origem.')}><Undo2 className="h-3.5 w-3.5" /> Número original</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" disabled={ocupado}
                        onClick={() => {
                          if (!confirm(`${c.nome || 'Este contato'} não vai mais receber o alerta deste posto. Continuar?`)) return;
                          agir(() => (c.origem === 'manual' && c.ajusteId ? desfazerAjusteAlerta(c.ajusteId) : ajustarContatoAlerta(postoId, 'remover', c.chave, c.nome, null)),
                            'Contato tirado do alerta.');
                        }}><Trash2 className="h-3.5 w-3.5" /> Não enviar</Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

        {lista.removidos.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Não recebem mais:{' '}
            {lista.removidos.map((c, i) => (
              <span key={c.chave ?? c.numero}>
                {i > 0 && ', '}{c.nome || formatar(c.numero)}
                {podeEditar && c.ajusteId && (
                  <button type="button" className="ml-1 text-primary hover:underline" disabled={ocupado}
                    onClick={() => agir(() => desfazerAjusteAlerta(c.ajusteId!), `${c.nome || 'Contato'} volta a receber o alerta.`)}>voltar a enviar</button>
                )}
              </span>
            ))}
          </div>
        )}

        {podeEditar && (novo ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input autoFocus className="h-8 w-56 text-xs" placeholder="Nome" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} />
            <Input inputMode="tel" className="h-8 w-40 text-xs" placeholder="(61) 99999-1234" value={novo.numero}
              onChange={e => setNovo({ ...novo, numero: e.target.value })} onKeyDown={e => e.key === 'Enter' && adicionar()} />
            <Button size="sm" className="h-8 gap-1" disabled={ocupado} onClick={adicionar}>{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Adicionar</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setNovo({ nome: '', numero: '' })}><Plus className="h-4 w-4" /> Adicionar contato</Button>
            {lista.recebem.length > 0 && (
              <Button size="sm" variant="outline" className="gap-2 border-emerald-600/40 text-emerald-700 dark:text-emerald-400" disabled={enviando} onClick={enviarAgora}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar alerta agora
              </Button>
            )}
          </div>
        ))}
      </>}
    </div>
  );
}
