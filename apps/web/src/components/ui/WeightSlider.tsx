import { useId } from 'react';
import { cn } from './cn';

export interface WeightSliderProps {
  label: string;
  description?: string | null;
  /** The buyer's raw weight, which need not add up to anything. */
  value: number;
  onValueChange: (value: number) => void;
  /** The share of the decision this weight represents once normalised. */
  percent: number;
  max?: number;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * One criterion's weight. The buyer moves a raw number; the percentage beside
 * it is what that number actually means once every criterion is taken together,
 * which is the only figure that decides anything.
 */
export function WeightSlider({
  label,
  description,
  value,
  onValueChange,
  percent,
  max = 100,
  onRemove,
  disabled,
  className,
}: WeightSliderProps) {
  const id = useId();

  return (
    <div className={cn('py-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              percent === 0 && 'text-muted-foreground',
            )}
          >
            {percent}%
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div className="mt-1.5 flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(Number(e.target.value))}
          className="h-1.5 w-full accent-[hsl(var(--primary))]"
        />
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(Math.max(0, Number(e.target.value) || 0))}
          aria-label={`${label} weight`}
          className="w-16 rounded-md border px-2 py-1 text-right text-sm tabular-nums"
        />
      </div>
    </div>
  );
}
