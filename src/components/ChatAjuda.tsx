import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin, RotateCcw, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { perguntarAjuda, type MensagemChat } from '@/services/ajudaService';
import { useAuth } from '@/contexts/AuthContext';
import GuiaRobo from '@/components/GuiaRobo';
import { separarGuia } from '../../supabase/functions/_shared/assistente';
import robo from '@/assets/assistente/robo.png';
import roboCabeca from '@/assets/assistente/robo-cabeca.png';

const GUARDAR = 'chat-ajuda';
const SUGESTOES = [
  'Como faço uma nova ficha de EPI?',
  'Como envio o link de assinatura?',
  'Como dou entrada no estoque?',
  'Por que não vejo um colaborador?',
];

/** **negrito** e listas simples nas respostas, sem HTML vindo de fora. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linha, i) => {
        const item = /^\s*([-*•]|\d+[.)])\s+/.exec(linha);
        const conteudo = item ? linha.slice(item[0].length) : linha;
        const partes = conteudo.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <Fragment key={j}>{p}</Fragment>);
        if (!linha.trim()) return <div key={i} className="h-2" />;
        return (
          <p key={i} className={cn(item && 'pl-4 relative')}>
            {item && <span className="absolute left-0">{/\d/.test(item[1]) ? item[1] : '•'}</span>}
            {partes}
          </p>
        );
      })}
    </>
  );
}

/** "Bom dia, Matheus!" — primeiro nome com só a inicial maiúscula (nomes da Senior vêm em caixa alta). */
function saudacao(nome?: string) {
  const h = new Date().getHours();
  const periodo = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiro = nome && !nome.includes('@') ? nome.trim().split(/\s+/)[0] : '';
  return primeiro ? `${periodo}, ${primeiro.charAt(0).toUpperCase()}${primeiro.slice(1).toLowerCase()}!` : `${periodo}!`;
}

function Avatar({ className }: { className?: string }) {
  return (
    <img src={roboCabeca} alt="" draggable={false}
      className={cn('rounded-full bg-gradient-to-b from-slate-100 to-slate-300 object-cover shrink-0', className)} />
  );
}

/** Botão flutuante "Tirar dúvidas" com o assistente (robô do Grupo 5 Estrelas). */
export default function ChatAjuda() {
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const [conversa, setConversa] = useState<MensagemChat[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(GUARDAR) ?? '[]'); } catch { return []; }
  });
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [guia, setGuia] = useState<string | null>(null);
  const fimGuia = useCallback(() => setGuia(null), []);
  const mostrar = useCallback((destino: string) => { setAberto(false); setGuia(destino); }, []);
  const [cumprimento, setCumprimento] = useState<string | null>(null);

  // Ao entrar no sistema: acena e cumprimenta uma vez por login (some sozinho em 12 s).
  useEffect(() => {
    if (!user) return;
    const chave = `chat-ajuda-saudou:${user.id}`;
    try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1'); } catch { /* sem armazenamento */ }
    setCumprimento(saudacao(user.nome));
    const t = setTimeout(() => setCumprimento(null), 12000);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    try { sessionStorage.setItem(GUARDAR, JSON.stringify(conversa)); } catch { /* sem armazenamento */ }
    fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversa, aberto, enviando]);

  async function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || enviando) return;
    const nova: MensagemChat[] = [...conversa, { papel: 'usuario', texto: p }];
    setConversa(nova);
    setTexto('');
    setErro(null);
    setEnviando(true);
    try {
      const { texto: resposta, guia: destino } = separarGuia(await perguntarAjuda(nova, pathname));
      setConversa(c => [...c, { papel: 'assistente', texto: resposta, guia: destino }]);
      // Resposta com destino: o robô vai direto mostrar onde é (dá um instante para ler).
      if (destino) setTimeout(() => mostrar(destino), 1500);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao perguntar');
    } finally {
      setEnviando(false);
    }
  }

  if (guia) return <GuiaRobo alvo={guia} onFim={fimGuia} />;

  if (!aberto) {
    return (
      <div className="fixed bottom-1 right-2 z-40 flex items-end gap-1">
        {cumprimento ? (
          <div className="relative mb-20 sm:mb-24 max-w-[230px] rounded-2xl rounded-br-sm bg-white/95 dark:bg-slate-900/95 px-4 py-3 text-sm text-foreground shadow-xl border animate-in fade-in slide-in-from-bottom-2 duration-500">
            <button onClick={() => setCumprimento(null)} title="Fechar"
              className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="font-semibold pr-4">{cumprimento}</p>
            <p className="text-muted-foreground mt-0.5">Sou o assistente do Grupo 5 Estrelas. Se tiver alguma dúvida sobre o sistema, é só clicar em mim.</p>
          </div>
        ) : (
          <button onClick={() => setAberto(true)}
            className="mb-16 sm:mb-20 hidden sm:block rounded-xl rounded-br-sm bg-white/90 dark:bg-slate-900/90 px-3 py-1.5 text-sm font-medium text-foreground shadow-md border hover:bg-white transition-colors">
            Dúvidas?
          </button>
        )}
        <button onClick={() => { setCumprimento(null); setAberto(true); }} title="Tirar dúvidas sobre o sistema"
          className="focus:outline-none transition-transform hover:scale-105">
          <img src={robo} alt="Assistente de dúvidas" draggable={false}
            className={cn('h-20 sm:h-28 w-auto drop-shadow-xl origin-bottom', cumprimento ? 'animate-acenar' : 'animate-flutuar')} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] sm:w-96 h-[min(600px,calc(100vh-6rem))] flex flex-col rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Avatar className="h-9 w-9" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Tirar dúvidas</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Assistente sobre o uso do sistema</p>
        </div>
        {conversa.length > 0 && (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Nova conversa"
            onClick={() => { setConversa([]); setErro(null); }} disabled={enviando}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Fechar" onClick={() => setAberto(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {!conversa.length && (
          <div className="space-y-2">
            <img src={robo} alt="" draggable={false} className="h-32 w-auto mx-auto drop-shadow-lg" />
            <p className="text-muted-foreground text-center">{saudacao(user?.nome)} Sou o assistente do Grupo 5 Estrelas. Pergunte como usar qualquer tela do sistema. Alguns exemplos:</p>
            {SUGESTOES.map(s => (
              <button key={s} onClick={() => enviar(s)}
                className="block w-full text-left rounded-lg border px-3 py-2 hover:bg-muted transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}
        {conversa.map((m, i) => (
          <div key={i} className={cn('flex items-end gap-1.5', m.papel === 'usuario' ? 'justify-end' : 'justify-start')}>
            {m.papel === 'assistente' && <Avatar className="h-7 w-7" />}
            <div className={cn('max-w-[85%] rounded-xl px-3 py-2 space-y-0.5 break-words',
              m.papel === 'usuario' ? 'bg-primary text-primary-foreground whitespace-pre-wrap' : 'bg-muted')}>
              {m.papel === 'usuario' ? m.texto : <Texto texto={m.texto} />}
              {m.guia && (
                <button onClick={() => mostrar(m.guia!)}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/20">
                  <MapPin className="h-3 w-3" /> Me mostre onde é
                </button>
              )}
            </div>
          </div>
        ))}
        {enviando && (
          <div className="flex items-center gap-2 text-muted-foreground"><Avatar className="h-7 w-7" /><Loader2 className="h-4 w-4 animate-spin" /> Pensando…</div>
        )}
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <div ref={fim} />
      </div>

      <form className="border-t p-2 flex gap-2 items-end" onSubmit={e => { e.preventDefault(); enviar(texto); }}>
        <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={1500}
          placeholder="Escreva sua dúvida (não informe CPF ou dados pessoais)"
          className="min-h-0 resize-none text-sm"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
        <Button type="submit" size="icon" disabled={enviando || !texto.trim()} title="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
