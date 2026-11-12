import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Liga/desliga o robô assistente ("Dúvidas?"). Fica guardado por usuário neste
 * navegador; o botão do topo e o do chat ficam sincronizados por um evento.
 */
const EVENTO = 'robo-assistente';
const chave = (userId?: string) => `robo-assistente-desligado:${userId ?? 'anonimo'}`;

function lerDesligado(userId?: string) {
  try { return localStorage.getItem(chave(userId)) === '1'; } catch { return false; }
}

export function useRoboAssistente() {
  const { user } = useAuth();
  const [desligado, setDesligado] = useState(() => lerDesligado(user?.id));

  useEffect(() => {
    setDesligado(lerDesligado(user?.id));
    const atualizar = () => setDesligado(lerDesligado(user?.id));
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener('storage', atualizar);
    return () => { window.removeEventListener(EVENTO, atualizar); window.removeEventListener('storage', atualizar); };
  }, [user?.id]);

  const definir = useCallback((ligado: boolean) => {
    try {
      if (ligado) localStorage.removeItem(chave(user?.id));
      else localStorage.setItem(chave(user?.id), '1');
    } catch { /* sem armazenamento: vale só até recarregar */ }
    setDesligado(!ligado);
    window.dispatchEvent(new Event(EVENTO));
  }, [user?.id]);

  return { ligado: !desligado, definir };
}

/** Desliga e avisa, com "Desfazer" e onde ligar de novo. */
export function desligarRoboComAviso(definir: (ligado: boolean) => void) {
  definir(false);
  toast('Assistente desligado', {
    description: 'Para ligar de novo, use o botão do robô no topo da tela.',
    action: { label: 'Desfazer', onClick: () => definir(true) },
  });
}
