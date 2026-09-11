import type { ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Rendered on the title row, for actions such as Reset or Edit. */
  action?: ReactNode;
  padded?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({
  title,
  description,
  action,
  padded = true,
  className,
  children,
}: CardProps) {
  const hasHeader = Boolean(title || action);

  return (
    <section className={cn('rounded-lg border bg-card', padded && 'p-4', className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children && <div className={cn(hasHeader && 'mt-3')}>{children}</div>}
    </section>
  );
}
