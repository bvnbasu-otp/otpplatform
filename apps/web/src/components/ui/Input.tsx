import type { InputHTMLAttributes } from 'react';
import { controlClasses } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, className)}
      {...rest}
    />
  );
}
