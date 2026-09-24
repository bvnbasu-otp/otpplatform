import { useState, useEffect } from 'react';
import { validatePan, type PanValidationResult } from '@otp/domain';

export interface PanAutofillFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  className?: string;
  placeholder?: string;
}

export function PanAutofillField({
  id,
  value,
  onChange,
  describedBy,
  className = '',
  placeholder = 'AABCS1429B',
}: PanAutofillFieldProps) {
  const [panDetails, setPanDetails] = useState<PanValidationResult | null>(null);

  const cleanPan = value.trim().toUpperCase();

  useEffect(() => {
    if (cleanPan.length === 10) {
      const validation = validatePan(cleanPan);
      setPanDetails(validation);
    } else {
      setPanDetails(null);
    }
  }, [cleanPan]);

  return (
    <div className="space-y-1.5" data-testid="pan-autofill-container">
      <input
        id={id}
        value={value}
        maxLength={10}
        onChange={(e) => {
          const nextVal = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
          onChange(nextVal);
        }}
        aria-describedby={describedBy}
        placeholder={placeholder}
        className={`${className} font-mono uppercase tracking-wider`}
      />

      {cleanPan.length > 0 && (
        <div className="text-xs">
          {cleanPan.length === 10 && panDetails?.isValid ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/90 p-2 text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="flex items-center justify-between">
                <span className="font-bold">✓ Valid Permanent Account Number</span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-800/60">
                  {panDetails.entityType}
                </span>
              </div>
            </div>
          ) : cleanPan.length === 10 && !panDetails?.isValid ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              ✕ {panDetails?.error || 'Invalid PAN structure'}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              {10 - cleanPan.length} characters remaining (e.g. 5 letters, 4 digits, 1 letter)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
