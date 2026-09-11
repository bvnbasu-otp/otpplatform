import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { controlClasses } from './Field';

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Rendered inside the field, e.g. KG or HP. */
  unit?: string | null;
  invalid?: boolean;
}

/**
 * A number field that reports a number, and an empty field as null rather than
 * as zero — "how many?" left blank is not an order for none.
 *
 * The typed text is held locally so half-finished input like "0." or "-" is not
 * rewritten under the buyer's cursor.
 */
export function NumberInput({
  value,
  onValueChange,
  unit,
  invalid,
  className,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    const asNumber = text.trim() === '' ? null : Number(text);
    if (asNumber !== value) {
      setText(value === null ? '' : String(value));
    }
    // Only resynchronise when the value arrives from outside this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);

    const trimmed = raw.trim();
    if (trimmed === '') {
      onValueChange(null);
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onValueChange(parsed);
  }

  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={controlClasses(invalid, cn(unit && 'pr-14', className))}
        {...rest}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center pt-1 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}
