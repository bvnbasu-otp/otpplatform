import type { SelectHTMLAttributes } from 'react';
import { controlClasses } from './Field';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  /** Shown as a disabled first row when the value is empty. */
  placeholder?: string;
  invalid?: boolean;
}

export function Select({
  options,
  placeholder,
  invalid,
  className,
  value,
  ...rest
}: SelectProps) {
  return (
    <select
      value={value ?? ''}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, className)}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
