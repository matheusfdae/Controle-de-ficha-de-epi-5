import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Campo de quantidade que só grava ao terminar a edição (sair do campo ou
 * Enter); Esc desfaz. Antes cada tecla gravava e gerava uma movimentação:
 * digitar "120" virava entradas de 1, 11 e 108 no histórico.
 */
export default function EstoqueInput({ value, onCommit, className }: {
  value: number;
  onCommit: (novo: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editando, setEditando] = useState(false);
  const cancelado = useRef(false);

  // Atualizações vindas de fora (realtime, outra aba) não atropelam a digitação.
  useEffect(() => { if (!editando) setDraft(String(value)); }, [value, editando]);

  const commit = () => {
    setEditando(false);
    if (cancelado.current) { cancelado.current = false; setDraft(String(value)); return; }
    const n = parseInt(draft, 10);
    if (!Number.isInteger(n) || n < 0) { setDraft(String(value)); return; }
    if (n !== value) onCommit(n);
  };

  return (
    <Input type="number" min={0} inputMode="numeric" value={draft} className={cn('w-28', className)}
      onFocus={() => setEditando(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { cancelado.current = true; e.currentTarget.blur(); }
      }} />
  );
}
