import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot, User, Loader2, Sparkles, CreditCard, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/badge-assistant`;

const QUICK_ACTIONS = [
  { label: '🎫 Gerar crachás', prompt: 'Quero gerar crachás com os dados da planilha. Verifique se o modelo está configurado corretamente com os campos vinculados e se os colaboradores têm os dados necessários preenchidos. Me dê o passo a passo.' },
  { label: '🔍 Verificar dados', prompt: 'Verifique a completude dos dados dos colaboradores: quais campos estão faltando, quem está sem foto, sem RG, sem CPF? Quais colaboradores estão prontos para gerar crachá?' },
  { label: '📊 Resumo do sistema', prompt: 'Me dê um resumo completo do estado atual do sistema: quantos colaboradores, fotos, crachás vencidos, modelos configurados e status da sincronização.' },
  { label: '⚙️ Validar modelo', prompt: 'Valide os modelos de crachá cadastrados: verifique se os elementos têm field_bindings corretos para puxar dados da planilha. Liste quais campos estão vinculados e quais estão faltando.' },
];

export function BadgeAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = '';

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao conectar com o assistente');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ') || line.trim() === '' || line.startsWith(':')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              const snap = assistantSoFar;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && prev.length > 1 && prev[prev.length - 2]?.role === 'user') {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: snap } : m));
                }
                return [...prev, { role: 'assistant', content: snap }];
              });
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Desculpe, ocorreu um erro: ${e.message || 'Tente novamente.'}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  const send = useCallback(() => sendMessage(input), [input, sendMessage]);

  const clearChat = () => setMessages([]);

  const showWelcome = messages.length === 0;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-50 rounded-2xl shadow-xl flex items-center transition-all duration-300 hover:shadow-2xl group',
          open
            ? 'h-11 w-11 justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            : 'h-14 gap-3 px-5 text-primary-foreground hover:scale-[1.03]'
        )}
        style={!open ? { background: 'var(--gradient-primary)', boxShadow: '0 8px 32px -8px hsl(var(--primary) / 0.45)' } : undefined}
      >
        {open ? (
          <X className="h-5 w-5" />
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-tight">Assistente IA</span>
          </>
        )}
      </button>

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-[4.5rem] right-6 z-50 w-[400px] rounded-2xl border border-border/60 bg-card flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{
            maxHeight: 'min(580px, calc(100vh - 120px))',
            boxShadow: '0 25px 60px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header */}
          <div
            className="relative flex items-center gap-3 px-5 py-4"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            <div className="relative h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <CreditCard className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="relative flex-1">
              <p className="text-[15px] font-bold text-primary-foreground tracking-tight font-display">CracháPro IA</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-300 animate-pulse" />
                <p className="text-[11px] text-primary-foreground/50 font-medium">Online • Assistente Inteligente</p>
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="relative p-2 rounded-lg hover:bg-white/10 text-primary-foreground/40 hover:text-primary-foreground/80 transition-colors"
                title="Limpar conversa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[280px]">
            {showWelcome && (
              <div className="flex flex-col items-center text-center py-4 animate-in fade-in duration-500">
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4 bg-primary/10 border border-primary/10">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1 font-display">Como posso ajudar?</h3>
                <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                  Tire dúvidas sobre crachás, modelos, mapeamento de dados e mais.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-5 w-full">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => sendMessage(a.prompt)}
                      className="text-left text-xs px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted hover:border-primary/20 transition-all duration-200 text-foreground font-medium leading-snug group"
                    >
                      <span className="group-hover:translate-x-0.5 transition-transform inline-block">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1 ring-1 ring-primary/5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'text-primary-foreground rounded-br-lg'
                      : 'bg-muted/70 text-foreground rounded-bl-lg border border-border/40'
                  )}
                  style={m.role === 'user' ? { background: 'var(--gradient-primary)' } : undefined}
                >
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1 ring-1 ring-border/50">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-2.5 animate-in fade-in duration-300">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted/70 rounded-2xl rounded-bl-lg px-4 py-3 border border-border/40">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border/60 p-3 bg-background/50 backdrop-blur-sm">
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Pergunte sobre crachás..."
                className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/30 transition-all"
                disabled={isLoading}
              />
              <button
                onClick={send}
                disabled={isLoading || !input.trim()}
                className="h-10 w-10 rounded-xl flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0"
                style={{ background: 'var(--gradient-primary)', boxShadow: '0 4px 12px -4px hsl(var(--primary) / 0.3)' }}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/40 mt-2 font-medium">
              CracháPro IA • Respostas podem conter imprecisões
            </p>
          </div>
        </div>
      )}
    </>
  );
}
