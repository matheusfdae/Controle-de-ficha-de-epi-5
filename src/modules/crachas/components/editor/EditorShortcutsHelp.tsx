import { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['Ctrl', 'Z'], description: 'Desfazer' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Refazer' },
  { keys: ['Ctrl', 'Y'], description: 'Refazer (alternativo)' },
  { keys: ['Ctrl', 'S'], description: 'Salvar template' },
  { keys: ['Ctrl', 'D'], description: 'Duplicar elemento selecionado' },
  { keys: ['Ctrl', 'C'], description: 'Copiar elemento' },
  { keys: ['Ctrl', 'V'], description: 'Colar elemento' },
  { keys: ['Delete'], description: 'Remover elemento' },
  { keys: ['Backspace'], description: 'Remover elemento (alternativo)' },
  { keys: ['↑', '↓', '←', '→'], description: 'Mover elemento (0,5 mm)' },
  { keys: ['Shift', '+', 'Setas'], description: 'Mover elemento (5 mm)' },
  { keys: ['?'], description: 'Abrir esta ajuda' },
];

export function EditorShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title="Atalhos de teclado (?)"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Atalhos de teclado
            </DialogTitle>
            <DialogDescription>
              Trabalhe mais rápido no editor com os atalhos abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            {SHORTCUTS.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                <span className="text-sm text-foreground">{s.description}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <kbd
                      key={j}
                      className="px-2 py-1 text-[11px] font-mono font-semibold rounded-md bg-muted border border-border text-foreground shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
