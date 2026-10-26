import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, MessageCircle, RotateCcw, Search, Send, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CAMPOS_MENSAGEM, INTERVALO_PADRAO_SEG, MODELO_PADRAO, celularDe, montarMensagem, numeroWhatsApp, type EnvioWhatsApp,
} from '../../supabase/functions/_shared/whatsapp';
import { enviarConvocacaoPorWhatsApp, lerModeloSalvo, salvarModelo } from '@/services/whatsappService';
import { situacaoTexto, type ConvocacaoUniforme } from '@/lib/convocacaoUniforme';

const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "5561996494477" -> "(61) 99649-4477" */
const formatarCelular = (n: string) => n.length === 13 ? `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}` : n;

interface Linha {
  t: ConvocacaoUniforme;
  marcado: boolean;
  /** Celular como está no campo (pode ter sido corrigido aqui). */
  celular: string;
  /** Como veio do cadastro, para saber se foi corrigido. */
  original: string;
  origem: 'senior' | 'ficha' | null;
  /** Incluído à mão (não estava na convocação). */
  adicionado: boolean;
}

function novaLinha(t: ConvocacaoUniforme, adicionado = false): Linha {
  const c = celularDe(t);
  const celular = c ? formatarCelular(c.numero) : '';
  return { t, marcado: !!c, celular, original: celular, origem: c?.origem ?? null, adicionado };
}

/**
 * Botão "Enviar por WhatsApp" da convocação: texto editável e lista de quem
 * recebe — começa com a lista da tela (filtro e busca) e dá para marcar,
 * desmarcar, corrigir o celular e incluir outro colaborador.
 * Uma mensagem por colaborador, espaçadas no tempo.
 */
export default function EnviarWhatsAppDialog({ convocados, todos, onEnviado }: {
  convocados: ConvocacaoUniforme[]; todos: ConvocacaoUniforme[];
  /** Depois de agendar (a tela abre a aba "Envios WhatsApp"). */
  onEnviado?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [modelo, setModelo] = useState(MODELO_PADRAO);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [busca, setBusca] = useState('');
  const [previa, setPrevia] = useState<string | null>(null);
  const texto = useRef<HTMLTextAreaElement>(null);

  // Ao abrir: a convocação da tela e o último texto usado neste navegador.
  useEffect(() => {
    if (!aberto) return;
    setLinhas(convocados.map(t => novaLinha(t)));
    setModelo(lerModeloSalvo() || MODELO_PADRAO);
    setBusca('');
    setPrevia(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const atualizar = (chave: string, mudar: (l: Linha) => Partial<Linha>) =>
    setLinhas(ls => ls.map(l => (l.t.chave === chave ? { ...l, ...mudar(l) } : l)));

  /** Marcados com celular válido; o mesmo número vai uma vez só. */
  const envios = useMemo(() => {
    const vistos = new Set<string>();
    const lista: EnvioWhatsApp[] = [];
    for (const l of linhas) {
      const numero = l.marcado ? numeroWhatsApp(l.celular) : null;
      if (!numero || vistos.has(numero)) continue;
      vistos.add(numero);
      lista.push({ nome: l.t.nome, numero, texto: montarMensagem(l.t, modelo) });
    }
    return lista;
  }, [linhas, modelo]);
  const marcadosSemCelular = linhas.filter(l => l.marcado && !numeroWhatsApp(l.celular)).length;
  const minutos = Math.ceil((envios.length * INTERVALO_PADRAO_SEG * 1.25) / 60);

  const naLista = new Set(linhas.map(l => l.t.chave));
  const termo = busca.trim().toLowerCase();
  const sugestoes = termo.length < 2 ? [] : todos
    .filter(t => !naLista.has(t.chave) && [t.nome, t.matricula, t.cpf].some(v => (v || '').toLowerCase().includes(termo)))
    .slice(0, 8);

  const linhaPrevia = linhas.find(l => l.t.chave === previa) ?? linhas.find(l => l.marcado) ?? linhas[0];

  function inserirCampo(campo: string) {
    const el = texto.current;
    const ini = el?.selectionStart ?? modelo.length;
    const fim = el?.selectionEnd ?? modelo.length;
    setModelo(modelo.slice(0, ini) + campo + modelo.slice(fim));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + campo.length, ini + campo.length); });
  }

  async function enviar() {
    if (!modelo.trim()) return toast.error('Escreva o texto da mensagem');
    setEnviando(true);
    try {
      const r = await enviarConvocacaoPorWhatsApp(envios);
      salvarModelo(modelo.trim() === MODELO_PADRAO ? '' : modelo);
      const fim = r.termina ? ` A última sai por volta de ${hora(r.termina)}.` : '';
      toast.success(`${r.agendados} mensagem(ns) agendada(s)${r.teste ? ' para o número de TESTE' : ''}.${fim}`
        + (r.semWhatsApp.length ? ` Sem WhatsApp: ${r.semWhatsApp.join(', ')}.` : '')
        + ' Acompanhe em "Envios WhatsApp".', { duration: 15000 });
      setAberto(false);
      onEnviado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><MessageCircle className="h-4 w-4 mr-1" /> Enviar por WhatsApp</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar convocação por WhatsApp</DialogTitle>
          <DialogDescription>
            Cada colaborador marcado recebe a mensagem no próprio celular (o da Senior ou, se lá não houver, o digitado
            nas fichas). Saem uma de cada vez, com {INTERVALO_PADRAO_SEG} s a {Math.round(INTERVALO_PADRAO_SEG * 1.5)} s
            entre elas, para não bloquear o número.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* ---------- Mensagem ---------- */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="wa-modelo">Mensagem</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setModelo(MODELO_PADRAO)}
                disabled={modelo === MODELO_PADRAO}>
                <RotateCcw className="h-3 w-3 mr-1" /> Texto padrão
              </Button>
            </div>
            <Textarea id="wa-modelo" ref={texto} rows={9} value={modelo} onChange={e => setModelo(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {CAMPOS_MENSAGEM.map(c => (
                <Button key={c.campo} variant="secondary" size="sm" className="h-6 px-2 text-xs" title={c.descricao}
                  onClick={() => inserirCampo(c.campo)}>{c.campo}</Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Clique num campo para colocá-lo no texto; ele é trocado pelos dados de cada colaborador.
            </p>
            {linhaPrevia && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Como chega para <strong>{linhaPrevia.t.nome}</strong>:</p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs font-sans">{montarMensagem(linhaPrevia.t, modelo)}</pre>
              </div>
            )}
          </div>

          {/* ---------- Quem recebe ---------- */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Label>Quem recebe ({envios.length} de {linhas.length})</Label>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => setLinhas(ls => ls.map(l => ({ ...l, marcado: !!numeroWhatsApp(l.celular) })))}>Marcar todos</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => setLinhas(ls => ls.map(l => ({ ...l, marcado: false })))}>Desmarcar todos</Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Incluir outro colaborador (nome, matrícula ou CPF)"
                value={busca} onChange={e => setBusca(e.target.value)} />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {sugestoes.map(t => (
                    <button key={t.chave} type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => { setLinhas(ls => [novaLinha(t, true), ...ls]); setBusca(''); setPrevia(t.chave); }}>
                      <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate">{t.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[t.matricula && `Mat. ${t.matricula}`, t.posto, situacaoTexto(t)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {termo.length >= 2 && sugestoes.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Ninguém encontrado fora da lista.</p>
              )}
            </div>

            <ul className="max-h-[46vh] overflow-y-auto rounded-md border divide-y">
              {linhas.map(l => {
                const valido = !!numeroWhatsApp(l.celular);
                const origem = l.celular !== l.original ? 'corrigido' : l.origem === 'senior' ? 'Senior' : l.origem === 'ficha' ? 'ficha' : '';
                return (
                  <li key={l.t.chave} className={`flex items-center gap-2 px-2 py-1.5 ${l.marcado ? '' : 'opacity-60'}`}>
                    <Checkbox checked={l.marcado} disabled={!valido} aria-label={`Enviar para ${l.t.nome}`}
                      onCheckedChange={v => atualizar(l.t.chave, () => ({ marcado: v === true }))} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setPrevia(l.t.chave)}
                      title="Ver a mensagem desta pessoa">
                      <span className="block truncate text-sm font-medium">
                        {l.t.nome}{l.adicionado && <span className="ml-1 text-xs font-normal text-primary">(incluído)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[l.t.posto, situacaoTexto(l.t)].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    <div className="w-40 shrink-0">
                      <Input value={l.celular} inputMode="tel" placeholder="Celular com DDD"
                        className={`h-8 text-xs ${l.celular && !valido ? 'border-destructive' : ''}`}
                        onChange={e => {
                          const celular = e.target.value;
                          atualizar(l.t.chave, x => ({ celular, marcado: numeroWhatsApp(celular) ? (x.marcado || !x.celular) : false }));
                        }} />
                      <span className={`block text-[10px] ${l.celular && !valido ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {!l.celular ? 'sem celular' : !valido ? 'não é celular' : origem}
                      </span>
                    </div>
                    {l.adicionado && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Tirar da lista"
                        onClick={() => setLinhas(ls => ls.filter(x => x.t.chave !== l.t.chave))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
              {linhas.length === 0 && (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  A lista da tela está vazia com o filtro atual. Mude o filtro ou inclua colaboradores pela busca acima.
                </li>
              )}
            </ul>
            {marcadosSemCelular > 0 && (
              <p className="text-xs text-destructive">{marcadosSemCelular} marcado(s) sem celular válido não vão receber.</p>
            )}
          </div>
        </div>

        {import.meta.env.DEV && (
          <p className="text-xs text-amber-600">
            Localhost: vão só as 3 primeiras mensagens, todas para o número de teste (WAAKG_NUMERO_TESTE).
          </p>
        )}
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {envios.length} mensagem(ns){envios.length > 0 && <> · leva cerca de {minutos} min</>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={enviar} disabled={enviando || !envios.length}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {import.meta.env.DEV ? `Enviar teste (${Math.min(3, envios.length)})` : `Agendar ${envios.length} mensagem(ns)`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
