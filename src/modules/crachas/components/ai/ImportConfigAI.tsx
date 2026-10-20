import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-config-ai`;

const QUICK_ACTIONS = [
  { label: '🔍 Analisar mapeamento', prompt: 'Analise os mapeamentos atuais da minha planilha. Estão corretos e completos? Quais campos estão faltando?' },
  { label: '📋 Sugerir configuração', prompt: 'Com base nos modelos de crachá que tenho, sugira a configuração ideal de importação. Quais colunas da planilha devo mapear e para quais campos?' },
  { label: '⚠️ Diagnosticar problemas', prompt: 'Por que os dados da planilha não estão aparecendo nos crachás? Verifique se há campos usados nos modelos que não estão mapeados.' },
  { label: '📊 Campos obrigatórios', prompt: 'Quais campos são obrigatórios para gerar crachás? Quais colaboradores estão com dados incompletos?' },
];

export function ImportConfigAI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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
      setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${e.message || 'Tente novamente.'}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  const send = useCallback(() => sendMessage(input), [input, sendMessage]);
  const clearChat = () => setMessages([]);
  const showWelcome = messages.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col" style={{ height: '520px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-muted/30">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Assistente de Importação</p>
          <p className="text-[11px] text-muted-foreground">Defina como os dados da planilha serão importados</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Limpar">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {showWelcome && (
          <div className="flex flex-col items-center text-center py-3">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-3 bg-primary/10 border border-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1">Configure a importação com IA</h3>
            <p className="text-xs text-muted-foreground max-w-[300px] leading-relaxed mb-4">
              Descreva como quer mapear os campos da planilha para os crachás, ou use uma ação rápida.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => sendMessage(a.prompt)}
                  className="text-left text-xs px-3 py-2.5 rounded-xl border border-border bg-background hover:bg-muted hover:border-primary/20 transition-all text-foreground font-medium leading-snug"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-lg'
                  : 'bg-muted/70 text-foreground rounded-bl-lg border border-border/40'
              )}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="h-6 w-6 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-1">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2">
            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-muted/70 rounded-2xl rounded-bl-lg px-4 py-2.5 border border-border/40">
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
      <div className="border-t border-border p-3 bg-background/50">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ex: Mapeie a coluna 'Nome' para o campo nome completo..."
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={send}
            disabled={isLoading || !input.trim()}
            className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
