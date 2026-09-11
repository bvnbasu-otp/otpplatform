import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  description?: string | null;
  onCheckedChange: (checked: boolean) => void;
}

export function Checkbox({
  label,
  description,
  checked,
  onCheckedChange,
  className,
  disabled,
  ...rest
}: CheckboxProps) {
  const id = useId();

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked ?? false}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border"
        {...rest}
      />
      <label htmlFor={id} className={cn('text-sm', disabled && 'text-muted-foreground')}>
        <span className="font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">{description}</span>
        )}
      </label>
    </div>
  );
}
