import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FieldProps {
  label: string;
  /** Rendered with the control's id, so screen readers announce the help text. */
  help?: string | null;
  error?: string | null;
  required?: boolean;
  /** Shown next to the label, e.g. the unit a number is expressed in. */
  hint?: string | null;
  /**
   * Tighter type and spacing, for a long form that has to fit in one view.
   * Density is a property of the form, not of the field, so a caller sets it
   * once per form rather than choosing per control.
   */
  dense?: boolean;
  className?: string;
  children: (ids: FieldIds) => ReactNode;
}

export interface FieldIds {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

/**
 * Label, help text and error message wired to whatever control the caller
 * renders. Taking children as a function keeps the ids honest: the control
 * cannot forget to accept the id that the label points at.
 */
export function Field({
  label,
  help,
  error,
  required,
  hint,
  dense,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const note = dense ? 'text-[0.65rem]' : 'text-xs';

  return (
    <div className={cn('block', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={cn('font-medium', dense ? 'text-xs' : 'text-sm')}>
          {label}
          {required && (
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {hint && <span className={cn(note, 'text-muted-foreground')}>{hint}</span>}
      </div>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {help && !error && (
        <p id={helpId} className={cn('mt-1 text-muted-foreground', note)}>
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className={cn('mt-1 text-red-600', note)}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The control classes every input-like primitive shares.
 *
 * `dense` matches Field's own dense mode; the two are set together or the label
 * and its control end up at different scales.
 */
export function controlClasses(
  invalid?: boolean,
  className?: string,
  dense?: boolean,
): string {
  return cn(
    'w-full rounded-md border border-input bg-card text-foreground placeholder:text-muted-foreground/60 min-h-[44px]',
    dense ? 'mt-0.5 px-2.5 py-1.5 text-[0.8rem]' : 'mt-1 px-3 py-2 text-sm',
    'focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-primary',
    'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
    invalid && 'border-red-400 dark:border-red-500',
    className,
  );
}
