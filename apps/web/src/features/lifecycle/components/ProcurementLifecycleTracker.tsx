import { useEffect, useState } from 'react';
import { fetchLifecycleSignals } from '../api/fetch-lifecycle';
import {
  currentLifecycleStage,
  currentMacroPhase,
  deriveLifecycleStages,
  deriveMacroPhases,
  type LifecycleStage,
  type MacroPhase,
} from '../types/lifecycle';

function getPhaseStyles(phase: MacroPhase) {
  if (phase.state === 'DONE') {
    return {
      card: 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20',
      marker: 'border-emerald-800 bg-emerald-800 text-white shadow-sm font-bold',
      badge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800/60',
      bar: 'bg-emerald-800 dark:bg-emerald-500',
      badgeText: 'Completed',
    };
  }
  if (phase.state === 'CURRENT') {
    if (phase.progressPercent >= 100) {
      return {
        card: 'border-emerald-700 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-600/30',
        marker: 'bg-emerald-800 dark:bg-emerald-600 text-white font-bold',
        badge: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800/60',
        bar: 'bg-emerald-800 dark:bg-emerald-500',
        badgeText: '100% (Delivered)',
      };
    }
    if (phase.progressPercent >= 75) {
      return {
        card: 'border-lime-500 dark:border-lime-700 bg-lime-50/60 dark:bg-lime-950/30 ring-1 ring-lime-500/30',
        marker: 'bg-lime-500 text-white font-bold',
        badge: 'bg-lime-100 dark:bg-lime-950/60 text-lime-900 dark:text-lime-300 font-bold border border-lime-300 dark:border-lime-800/60',
        bar: 'bg-lime-500',
        badgeText: '75% (Near Complete)',
      };
    }
    if (phase.progressPercent >= 50) {
      return {
        card: 'border-blue-500 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-500/30',
        marker: 'bg-blue-500 text-white font-bold',
        badge: 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-800/60',
        bar: 'bg-blue-500',
        badgeText: '50% In Progress',
      };
    }
    if (phase.progressPercent >= 25) {
      return {
        card: 'border-yellow-400 dark:border-yellow-600 bg-yellow-50/60 dark:bg-yellow-950/30 ring-1 ring-yellow-400/30',
        marker: 'bg-yellow-400 text-yellow-950 font-bold',
        badge: 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-900 dark:text-yellow-300 font-bold border border-yellow-300 dark:border-yellow-800/60',
        bar: 'bg-yellow-400',
        badgeText: '25% (Started)',
      };
    }
    return {
      card: 'border-primary/50 bg-primary/5 ring-1 ring-primary/20',
      marker: 'border-primary bg-primary text-primary-foreground font-bold',
      badge: 'bg-primary/20 text-primary font-bold',
      bar: 'bg-primary',
      badgeText: 'In Progress',
    };
  }
  if (phase.state === 'CANCELLED') {
    return {
      card: 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20',
      marker: 'border-red-400 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold',
      badge: 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 font-bold border border-red-200 dark:border-red-800/60',
      bar: 'bg-red-500',
      badgeText: 'Cancelled',
    };
  }
  return {
    card: 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 opacity-80',
    marker: 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    bar: 'bg-slate-300 dark:bg-slate-700',
    badgeText: 'Upcoming',
  };
}

export interface ProcurementLifecycleTrackerProps {
  rfqId: string;
  /** Drops the heading and caption for embedding inside another card. */
  compact?: boolean;
}

export function ProcurementLifecycleTracker({
  rfqId,
  compact = false,
}: ProcurementLifecycleTrackerProps) {
  const [stages, setStages] = useState<LifecycleStage[]>([]);
  const [macroPhases, setMacroPhases] = useState<MacroPhase[]>([]);
  const [showMicroSteps, setShowMicroSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const result = await fetchLifecycleSignals(rfqId);
      if (cancelled) return;
      if (result.ok) {
        const derivedStages = deriveLifecycleStages(result.signals);
        setStages(derivedStages);
        setMacroPhases(deriveMacroPhases(derivedStages, result.signals));
        setError(null);
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rfqId]);

  if (isLoading) {
    return (
      <section className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
        Loading procurement lifecycle status…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
        {error}
      </section>
    );
  }

  const currentPhase = currentMacroPhase(macroPhases);
  const currentMicro = currentLifecycleStage(stages);

  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm" data-testid="lifecycle-tracker">
      {!compact && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Procurement Lifecycle OS
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                Phase {currentPhase?.number ?? 1} of 4: {currentPhase?.title}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Current Focus: <strong className="text-foreground">{currentMicro?.label ?? 'Not started'}</strong> · {currentPhase?.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMicroSteps((v) => !v)}
            className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            {showMicroSteps ? '▲ Hide Micro-Steps' : '▼ View 9 Micro-Steps'}
          </button>
        </header>
      )}

      {/* 4 Macro-Phases Executive Stepper */}
      <div className="grid gap-3 sm:grid-cols-4">
        {macroPhases.map((phase) => {
          const style = getPhaseStyles(phase);
          return (
            <div
              key={phase.id}
              className={`rounded-lg border p-3.5 transition ${style.card}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${style.marker}`}
                >
                  {phase.state === 'DONE' ? '✓' : phase.number}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.badge}`}
                >
                  {style.badgeText}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-foreground">{phase.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{phase.description}</p>

              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full transition-all duration-300 ${style.bar}`}
                  style={{ width: `${phase.progressPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Expandable 9 Granular Micro-Steps */}
      {showMicroSteps && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            Granular Audit Trail &amp; Micro-Step Engine:
          </p>
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9">
            {stages.map((stage, idx) => (
              <li
                key={stage.id}
                className={`rounded-md border p-2 text-center text-[10px] transition ${
                  stage.state === 'DONE'
                    ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-medium'
                    : stage.state === 'CURRENT'
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                      : 'border-border bg-card text-muted-foreground opacity-60'
                }`}
              >
                <div className="font-bold">Step {idx + 1}</div>
                <div className="mt-0.5 line-clamp-2">{stage.label}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
