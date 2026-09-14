import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'action' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
  // The one loud colour on the page. Reserved for the thing the screen exists
  // to get done, so it stays findable on a form-dense layout.
  action:
    'bg-action text-action-foreground hover:bg-action-hover disabled:opacity-50',
  secondary: 'border bg-card hover:bg-muted disabled:opacity-50',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50',
  danger: 'border border-red-200 dark:border-red-900/60 bg-card text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs min-h-[44px]',
  md: 'px-4 py-2 text-sm min-h-[44px]',
  lg: 'px-5 py-2.5 text-sm min-h-[44px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a pending label and blocks further clicks. */
  busy?: boolean;
  busyLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  busyLabel = 'Working…',
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
