import type { ReactNode } from 'react';
import { cn } from './cn';
import { resolveCanonicalStatus, CanonicalStatusKey } from '@otp/domain';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40',
  success: 'bg-accent text-accent-foreground border border-accent-foreground/10',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200/50 dark:border-red-800/40',
};

export interface BadgeProps {
  tone?: BadgeTone;
  statusKey?: CanonicalStatusKey | string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Badge({ tone, statusKey, icon, className, children }: BadgeProps) {
  if (statusKey) {
    const canonical = resolveCanonicalStatus(statusKey);
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border',
          canonical.badgeClass,
          className,
        )}
      >
        <span aria-hidden="true" className="text-xs select-none">
          {icon ?? canonical.icon}
        </span>
        <span>{children ?? canonical.label}</span>
      </span>
    );
  }

  const effectiveTone = tone || 'neutral';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[effectiveTone],
        className,
      )}
    >
      {icon && <span aria-hidden="true" className="text-xs select-none">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
