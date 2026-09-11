import { useId } from 'react';
import { cn } from './cn';

export interface RadioCardOption {
  value: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
}

export interface RadioCardGroupProps {
  legend: string;
  /** Hide the legend visually where the surrounding Field already labels it. */
  hideLegend?: boolean;
  name?: string;
  options: RadioCardOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  columns?: 1 | 2 | 3;
  className?: string;
}

/**
 * Choices as cards. Built on real radio inputs so arrow keys, tab order and
 * screen readers behave the way people expect, with the card as the label.
 */
export function RadioCardGroup({
  legend,
  hideLegend = false,
  name,
  options,
  value,
  onValueChange,
  columns = 2,
  className,
}: RadioCardGroupProps) {
  const generatedName = useId();
  const groupName = name ?? generatedName;

  return (
    <fieldset className={cn('mt-1', className)}>
      <legend className={cn('text-sm font-medium', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      <div
        className={cn(
          'mt-2 grid gap-2',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer gap-2 rounded-lg border p-3 text-sm',
                selected ? 'border-primary bg-accent' : 'bg-card hover:bg-muted',
                option.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onValueChange(option.value)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
