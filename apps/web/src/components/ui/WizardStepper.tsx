import { cn } from './cn';

export interface WizardStep {
  id: string;
  label: string;
}

export interface WizardStepperProps {
  steps: WizardStep[];
  /** Zero-based index of the step being shown. */
  currentIndex: number;
  /** Steps the buyer has completed, and may jump back to. */
  furthestIndex?: number;
  onStepSelect?: (index: number) => void;
  className?: string;
}

/**
 * Progress across the intake flow. A step is only reachable once it has been
 * visited, so the buyer can go back and correct an answer without being able to
 * skip a question the next step depends on.
 */
export function WizardStepper({
  steps,
  currentIndex,
  furthestIndex = currentIndex,
  onStepSelect,
  className,
}: WizardStepperProps) {
  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {steps.map((step, index) => {
          const state =
            index === currentIndex
              ? 'current'
              : index < currentIndex || index <= furthestIndex
                ? 'done'
                : 'upcoming';
          const reachable = index <= furthestIndex && index !== currentIndex;

          const content = (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
                state === 'current' && 'bg-primary text-primary-foreground',
                state === 'done' && 'bg-accent text-accent-foreground',
                state === 'upcoming' && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold',
                  state === 'current' && 'bg-primary-foreground/20',
                  state === 'done' && 'bg-accent-foreground/15',
                  state === 'upcoming' && 'border',
                )}
              >
                {index + 1}
              </span>
              {step.label}
            </span>
          );

          return (
            <li key={step.id} aria-current={state === 'current' ? 'step' : undefined}>
              {reachable && onStepSelect ? (
                <button type="button" onClick={() => onStepSelect(index)}>
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
