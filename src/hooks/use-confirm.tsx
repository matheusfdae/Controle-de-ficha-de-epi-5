import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}

/** Substitui window.confirm() por um AlertDialog estilizado, mantendo a mesma
 * chamada imperativa (`if (!(await confirm('texto'))) return;`). */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>();

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    setOptions(typeof opts === 'string' ? { description: opts } : opts);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const handle = (value: boolean) => {
    setOptions(null);
    resolver.current?.(value);
  };

  const ConfirmDialog = () => (
    <AlertDialog open={!!options} onOpenChange={(o) => !o && handle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title || 'Confirmar ação'}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handle(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={options?.destructive !== false ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            onClick={() => handle(true)}
          >
            {options?.confirmLabel || 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
