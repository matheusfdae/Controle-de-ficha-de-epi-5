import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  action?: ReactNode;
}

const variantClasses = {
  default: '',
  primary: 'stat-card-primary',
  success: 'stat-card-success',
  warning: 'stat-card-warning',
  destructive: 'stat-card-destructive',
};

const iconBg = {
  default: 'bg-muted/80 text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
};

export function StatCard({ title, value, subtitle, icon, variant = 'default', action }: StatCardProps) {
  return (
    <div className={cn('stat-card', variantClasses[variant])}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</p>
          <p className="text-3xl font-extrabold tracking-tight text-foreground font-display">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {action && <div className="mt-2">{action}</div>}
        </div>
        <div className={cn('p-3 rounded-xl', iconBg[variant])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
