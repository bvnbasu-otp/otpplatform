import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ChipProps {
  children: ReactNode;
  /** Renders a remove control; omit for a read-only chip. */
  onRemove?: () => void;
  removeLabel?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * A small removable token: a matched keyword, a declared capability, a service
 * area. Clickable and removable chips are separate concerns, so a chip with
 * both is still one tab stop for the chip and one for its remove button.
 */
export function Chip({
  children,
  onRemove,
  removeLabel,
  selected,
  onClick,
  className,
}: ChipProps) {
  const body = (
    <span className="truncate">{children}</span>
  );

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
        selected ? 'border-primary bg-accent text-accent-foreground' : 'bg-card',
        className,
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          className="max-w-full truncate hover:underline"
        >
          {body}
        </button>
      ) : (
        body
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
    </span>
  );
}
