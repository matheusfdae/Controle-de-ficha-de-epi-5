import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export default PageHeader;
