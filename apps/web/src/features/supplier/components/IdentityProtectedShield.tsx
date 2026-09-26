import type { ReactNode } from 'react';
import { IDENTITY_SHIELD_EXPLANATION, IDENTITY_SHIELD_LABEL } from '../lib/identity-shield';

export interface IdentityProtectedShieldProps {
  /** banner: label + explanation card. badge: compact pill. note: one-line footnote. */
  variant?: 'banner' | 'badge' | 'note';
  /** Rendered on the banner's header row, e.g. a reliability pill. */
  aside?: ReactNode;
  className?: string;
}

export function IdentityProtectedShield({
  variant = 'banner',
  aside,
  className = '',
}: IdentityProtectedShieldProps) {
  if (variant === 'badge') {
    return (
      <span
        data-testid="identity-protected-shield"
        data-variant="badge"
        title={IDENTITY_SHIELD_EXPLANATION}
        className={`inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold ${className}`}
      >
        <span aria-hidden="true">🛡️</span>
        <span>{IDENTITY_SHIELD_LABEL}</span>
      </span>
    );
  }

  if (variant === 'note') {
    return (
      <p
        data-testid="identity-protected-shield"
        data-variant="note"
        className={`text-[11px] text-muted-foreground leading-relaxed ${className}`}
      >
        <span aria-hidden="true">🛡️ </span>
        <strong className="text-foreground">{IDENTITY_SHIELD_LABEL}:</strong>{' '}
        {IDENTITY_SHIELD_EXPLANATION}
      </p>
    );
  }

  return (
    <div
      data-testid="identity-protected-shield"
      data-variant="banner"
      className={`rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <span aria-hidden="true">🛡️</span>
          <span>{IDENTITY_SHIELD_LABEL}</span>
        </div>
        {aside}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{IDENTITY_SHIELD_EXPLANATION}</p>
    </div>
  );
}
