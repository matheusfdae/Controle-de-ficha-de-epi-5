import { cn } from '@/lib/utils';
import { STATUS_ROTULO, type StatusTroca } from '../lib/trocaPostoService';

const COR: Record<StatusTroca, string> = {
  pendente: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  aprovada: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100',
  recusada: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  cancelada: 'bg-muted text-muted-foreground',
  enviada: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  erro_envio: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100',
  desfeita: 'bg-muted text-muted-foreground line-through',
};

export default function SeloStatusTroca({ status }: { status: StatusTroca }) {
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', COR[status])}>{STATUS_ROTULO[status]}</span>;
}
