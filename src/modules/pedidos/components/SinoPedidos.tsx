import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { ACAO_DA_ETAPA, formatarMoeda, minhasTarefas, type Tarefa } from '../lib/pedidosService';

/**
 * Sino de pedidos no topo do sistema: lista o que espera o usuário (pelo papel
 * dele no fluxo) e avisa quando chega pedido novo na etapa dele — aviso na
 * tela e, se ele permitir, notificação do navegador com a aba em segundo plano.
 * Confere a cada minuto e quando a janela volta ao foco.
 */

const INTERVALO = 60 * 1000;
const chave = (t: Pick<Tarefa, 'id' | 'status'>) => `${t.id}:${t.status}`;
const lerVistos = (uid: string): Set<string> | null => {
  try { const v = localStorage.getItem(`pedidos-vistos:${uid}`); return v ? new Set(JSON.parse(v)) : null; } catch { return null; }
};
const gravarVistos = (uid: string, s: Set<string>) => {
  try { localStorage.setItem(`pedidos-vistos:${uid}`, JSON.stringify([...s])); } catch { /* sem storage */ }
};
const temNotificacao = () => typeof window !== 'undefined' && 'Notification' in window;
const quando = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

export default function SinoPedidos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [novas, setNovas] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState(false);
  const [permissao, setPermissao] = useState(temNotificacao() ? Notification.permission : 'denied');
  const pediuPermissao = useRef(false);

  const abrirPedido = useCallback((id: string) => {
    setAberto(false);
    navigate(`/pedidos?pedido=${id}`);
  }, [navigate]);

  const verificar = useCallback(async () => {
    if (!user) return;
    let lista: Tarefa[];
    try { lista = await minhasTarefas(); } catch { return; }
    setTarefas(lista);
    window.dispatchEvent(new CustomEvent('pedidos-pendencias', { detail: lista.length }));

    const vistos = lerVistos(user.id);
    const atuais = new Set(lista.map(chave));
    // Primeira vez neste navegador: só guarda o que já existe, sem avisar.
    if (!vistos) { gravarVistos(user.id, atuais); return; }
    const chegaram = lista.filter(t => !vistos.has(chave(t)));
    gravarVistos(user.id, atuais);
    if (!chegaram.length) return;

    setNovas(n => new Set([...n, ...chegaram.map(chave)]));
    const primeiro = chegaram[0];
    const titulo = chegaram.length === 1
      ? `Novo pedido: ${primeiro.codigo}`
      : `${chegaram.length} pedidos novos esperando por você`;
    const texto = chegaram.length === 1
      ? `${ACAO_DA_ETAPA[primeiro.status] ?? 'Ver'} · ${primeiro.posto} · ${formatarMoeda(primeiro.valor)}`
      : chegaram.slice(0, 3).map(t => `${t.codigo} (${ACAO_DA_ETAPA[t.status]?.toLowerCase() ?? 'ver'})`).join(', ');
    toast.info(titulo, {
      description: texto, duration: 15000,
      action: { label: 'Abrir', onClick: () => (chegaram.length === 1 ? abrirPedido(primeiro.id) : navigate('/pedidos')) },
    });
    if (temNotificacao() && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      const n = new Notification(titulo, { body: texto, tag: 'pedidos-material', icon: '/favicon.ico' });
      n.onclick = () => { window.focus(); if (chegaram.length === 1) abrirPedido(primeiro.id); else navigate('/pedidos'); n.close(); };
    }
  }, [user, abrirPedido, navigate]);

  useEffect(() => {
    if (!user) return;
    verificar();
    const t = setInterval(verificar, INTERVALO);
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('pedidos-atualizados', verificar);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('pedidos-atualizados', verificar); };
  }, [user, verificar]);

  // Quem tem tarefa e ainda não respondeu: oferece a notificação do navegador uma vez.
  useEffect(() => {
    if (!tarefas.length || permissao !== 'default' || pediuPermissao.current) return;
    pediuPermissao.current = true;
    toast('Quer ser avisado quando chegar pedido?', {
      description: 'O navegador mostra um aviso mesmo com o sistema em outra aba.', duration: 20000,
      action: { label: 'Ativar', onClick: () => Notification.requestPermission().then(setPermissao) },
    });
  }, [tarefas.length, permissao]);

  // Só aparece quando há pedido esperando pelo usuário.
  if (!tarefas.length && !novas.size) return null;

  const Icone = novas.size ? BellRing : Bell;
  return (
    <Popover open={aberto} onOpenChange={o => { setAberto(o); if (!o) setNovas(new Set()); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${tarefas.length} pedido(s) esperando por você`}>
          <Icone className={`h-4 w-4 ${novas.size ? 'text-primary' : ''}`} />
          {tarefas.length > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold leading-4 text-center
              ${novas.size ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
              {tarefas.length > 99 ? '99+' : tarefas.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-semibold">Pedidos esperando por você</p>
          {permissao === 'default' && temNotificacao() && (
            <button type="button" className="text-xs text-primary hover:underline"
              onClick={() => Notification.requestPermission().then(setPermissao)}>Ativar avisos do navegador</button>
          )}
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y">
          {tarefas.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nada esperando por você.</li>}
          {tarefas.slice(0, 30).map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => abrirPedido(t.id)}
                className={`w-full text-left px-3 py-2 hover:bg-muted/60 ${novas.has(chave(t)) ? 'bg-primary/5' : ''}`}>
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{t.codigo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{quando(t.desde)}</span>
                </span>
                <span className="block text-xs text-muted-foreground truncate">{t.posto} · {formatarMoeda(t.valor)}</span>
                <span className={`block text-xs font-medium ${t.excede_teto && t.status === 'aguardando_aprovacao' ? 'text-destructive' : 'text-primary'}`}>
                  {novas.has(chave(t)) && 'Novo · '}{ACAO_DA_ETAPA[t.status] ?? 'Ver'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t px-3 py-2">
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setAberto(false); navigate('/pedidos'); }}>
            Ver todos os pedidos
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
