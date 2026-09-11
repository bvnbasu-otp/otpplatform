import React, { useState } from 'react';
import { formatWindow, phaseSteps, timeRemaining, type RfqPhase } from '../types/phase';
import { isClosingSoon, quotingMessage } from '../types/phase';

interface PhaseTimelineProps {
  phase: RfqPhase;
  /** Shown to suppliers; a buyer already knows why their own enquiry is closed. */
  showQuotingNotice?: boolean;
  children?: React.ReactNode;
}

const STATE_STYLES: Record<string, string> = {
  DONE: 'border-muted bg-muted/30 text-muted-foreground',
  CURRENT: 'border-primary bg-primary/5',
  UPCOMING: 'border-dashed border-muted bg-transparent text-muted-foreground',
  SKIPPED: 'border-dashed border-muted bg-transparent text-muted-foreground',
};

/**
 * The four phases and where this enquiry is in them.
 */
export function PhaseTimeline({ phase, showQuotingNotice, children }: PhaseTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const steps = phaseSteps(phase);
  const remaining = timeRemaining(phase.secondsRemaining);
  const notice = showQuotingNotice ? quotingMessage(phase) : null;

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 text-xs shadow-xs" data-testid="phase-timeline">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⏱️</span>
          <div>
            <h2 className="text-xs font-bold text-foreground">
              {phase.ordinal === 0 ? phase.label : `Phase ${phase.ordinal}: ${phase.label}`}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {formatWindow(phase.startsAt, phase.endsAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {remaining && (
            <span
              className={[
                'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                phase.overdue
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : isClosingSoon(phase)
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {phase.overdue ? 'Window closed' : remaining}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            {isExpanded ? '▲ Hide Timeline' : '▼ View 4 Phases'}
          </button>
        </div>
      </header>

      {isExpanded && (
        <ol className="mt-3 grid gap-2 sm:grid-cols-4 animate-in fade-in-50">
          {steps.map((step) => (
            <li
              key={step.ordinal}
              aria-current={step.state === 'CURRENT' ? 'step' : undefined}
              className={`rounded-lg border p-2.5 text-xs ${STATE_STYLES[step.state]}`}
            >
              <p className="font-bold">
                {step.ordinal}. {step.title}
              </p>
              <p className="mt-0.5 text-[11px]">{step.purpose}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {step.state === 'SKIPPED'
                  ? 'No window was granted'
                  : formatWindow(step.startsAt, step.endsAt)}
              </p>
            </li>
          ))}
        </ol>
      )}

      {notice && (
        <p className="mt-2.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{notice}</p>
      )}

      {children}
    </section>
  );
}
