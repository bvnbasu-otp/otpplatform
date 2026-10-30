import React from 'react';

export interface WizardProgressProps {
  step: number;
  total: number;
  label?: string;
  onBack?: () => void;
}

export function WizardProgress({ step, total, label, onBack }: WizardProgressProps) {
  const percentage = Math.min(Math.max((step / total) * 100, 0), 100);

  return (
    <div className="w-full space-y-2 mb-4" data-testid="wizard-progress">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground rounded-md transition"
              aria-label="Go back"
              data-testid="wizard-back-button"
            >
              <span className="material-symbols-outlined text-lg leading-none">arrow_back</span>
            </button>
          )}
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-bold">
            Step {step} of {total}
          </span>
        </div>
        {label && <span className="text-[11px] text-muted-foreground truncate">{label}</span>}
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
