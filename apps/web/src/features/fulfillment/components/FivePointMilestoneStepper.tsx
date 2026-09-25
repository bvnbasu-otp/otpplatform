import React from 'react';
import { Link } from 'react-router-dom';
import {
  deriveFivePointMilestoneProjection,
  type CustomerMilestoneItem,
  type FivePointMilestoneSummary,
  type DeriveFivePointMilestoneParams,
} from '@otp/domain';

export interface FivePointMilestoneStepperProps {
  projection?: FivePointMilestoneSummary;
  params?: DeriveFivePointMilestoneParams;
  onActionClick?: (milestone: CustomerMilestoneItem) => void;
  compact?: boolean;
}

export function FivePointMilestoneStepper({
  projection: directProjection,
  params,
  onActionClick,
  compact = false,
}: FivePointMilestoneStepperProps) {
  const summary: FivePointMilestoneSummary =
    directProjection ||
    deriveFivePointMilestoneProjection(params || { buyerPersona: 'INDIVIDUAL' });

  const { milestones, goldenState, activeMilestoneNumber, overallProgressPercent, isStalled, stalledReason } = summary;

  return (
    <div
      data-testid="five-point-milestone-stepper"
      className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 shadow-2xs space-y-3.5"
    >
      {/* Header with Title and Overall Progress */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
        <div>
          <span className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground block">
            Procurement Lifecycle Progress
          </span>
          <h3 className="text-sm font-black text-foreground flex items-center gap-2">
            <span>Milestone Stepper: Step {activeMilestoneNumber} of 5</span>
            {isStalled ? (
              <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 px-2 py-0.5 text-[10px] font-black text-rose-800 dark:text-rose-300 border border-rose-300">
                ⚠️ Stalled Exception
              </span>
            ) : (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary border border-primary/20">
                {goldenState.replace('_', ' ')}
              </span>
            )}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground font-semibold block">Total Progress</span>
            <span className="text-xs font-mono font-black text-primary">{overallProgressPercent}%</span>
          </div>
          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden border border-border/60">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${overallProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stalled Alert Banner */}
      {isStalled && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 p-2.5 text-xs text-rose-950 dark:text-rose-200 flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <strong className="font-bold">Workflow Stalled:</strong>{' '}
            <span className="text-[11px]">{stalledReason || 'Action required to proceed to the next milestone.'}</span>
          </div>
        </div>
      )}

      {/* 5-Point Stepper Grid / Timeline */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
        {milestones.map((m) => {
          const isDone = m.status === 'COMPLETED';
          const isCurrent = m.isCurrent;

          let cardBg = 'bg-muted/30 border-border/60 opacity-80';
          let circleBg = 'bg-muted text-muted-foreground border-border';
          let statusColor = 'text-muted-foreground';

          if (isDone) {
            cardBg = 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60';
            circleBg = 'bg-emerald-600 text-white border-emerald-500';
            statusColor = 'text-emerald-700 dark:text-emerald-300';
          } else if (isCurrent) {
            cardBg = 'bg-primary/5 border-primary/40 ring-1 ring-primary/20';
            circleBg = 'bg-primary text-primary-foreground border-primary';
            statusColor = 'text-primary font-bold';
          }

          return (
            <div
              key={m.key}
              data-testid={`milestone-step-${m.milestoneNumber}`}
              className={`rounded-xl border p-2.5 space-y-2 transition flex flex-col justify-between ${cardBg}`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black border ${circleBg}`}
                  >
                    {isDone ? '✓' : m.milestoneNumber}
                  </span>
                  <span
                    className={`text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-md border ${
                      isDone
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                        : isCurrent
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {m.badgeText}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-black text-foreground">{m.label}</h4>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight mt-0.5">
                    {m.tagline}
                  </p>
                </div>
              </div>

              <div className="pt-1 border-t border-border/40">
                {m.actionUrl ? (
                  <Link
                    to={m.actionUrl}
                    onClick={() => onActionClick?.(m)}
                    className={`block w-full text-center text-[10px] font-bold py-1 px-2 rounded-lg transition mobile-touch-target ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs'
                        : isDone
                        ? 'bg-muted/60 text-foreground hover:bg-muted'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {m.actionLabel}
                  </Link>
                ) : (
                  <span className="block text-center text-[10px] text-muted-foreground italic py-1">
                    {m.badgeText}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
