import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RfqReviewValidation } from '../types/rfq-review';

interface RfqValidationBannerProps {
  validation: RfqReviewValidation;
  requirementId: string;
}

export function RfqValidationBanner({
  validation,
  requirementId,
}: RfqValidationBannerProps) {
  const { errors, warnings, isValid, state, checklist = [] } = validation;
  const [showAllChecks, setShowAllChecks] = useState(false);

  const readinessState = state || (errors.length > 0 ? 'BLOCKED' : warnings.length > 0 ? 'WARNING' : 'READY');

  if (readinessState === 'READY' && !showAllChecks) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-200 shadow-2xs space-y-2 transition-all"
        data-testid="rfq-validation-ready"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">✅</span>
            <span className="font-bold">Ready to Broadcast — All required sourcing parameters and quorum verified.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllChecks(true)}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer mobile-touch-target px-2 py-1"
            >
              View Pre-Flight Checklist ({checklist.length}) ↓
            </button>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 text-[10px] font-bold border border-emerald-300 shrink-0">
              READY
            </span>
          </div>
        </div>
      </div>
    );
  }

  const passCount = checklist.filter((c) => c.status === 'PASS').length;
  const warnCount = checklist.filter((c) => c.status === 'WARN').length;
  const failCount = checklist.filter((c) => c.status === 'FAIL').length;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3 text-foreground" data-testid="rfq-validation-checklist">
      {/* Header bar with readiness badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-base">
            {readinessState === 'BLOCKED' ? '⛔' : readinessState === 'WARNING' ? '⚠️' : '✅'}
          </span>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-foreground">
              {readinessState === 'BLOCKED'
                ? `Broadcast Blocked (${failCount} Issue${failCount === 1 ? '' : 's'} to Resolve)`
                : readinessState === 'WARNING'
                ? `Ready to Broadcast (${warnCount} Advisory Recommendation${warnCount === 1 ? '' : 's'})`
                : 'Pre-Flight Readiness Checklist'}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {readinessState === 'BLOCKED'
                ? 'Mandatory procurement parameters must be completed before launching broadcast.'
                : 'Review sourcing parameters and advisory guidelines before launching competitive quoting.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {readinessState === 'BLOCKED' && (
            <span className="rounded-full bg-red-100 dark:bg-red-950/60 px-2.5 py-0.5 text-[10px] font-bold text-red-800 dark:text-red-300 border border-red-300">
              BLOCKED
            </span>
          )}
          {readinessState === 'WARNING' && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
              WARNING (PASS)
            </span>
          )}
          {readinessState === 'READY' && (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
              READY
            </span>
          )}
        </div>
      </div>

      {/* Blocking Errors alert if any */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200 space-y-1.5">
          <span className="font-bold flex items-center gap-1 text-[11px]">
            <span>⛔</span> Required to Broadcast:
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] leading-relaxed">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Itemized pre-flight checklist grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
        {checklist.map((item) => {
          const isPass = item.status === 'PASS';
          const isWarn = item.status === 'WARN';
          const isFail = item.status === 'FAIL';

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition ${
                isFail
                  ? 'border-red-200 bg-red-50/50 dark:bg-red-950/30'
                  : isWarn
                  ? 'border-amber-200/80 bg-amber-50/30 dark:bg-amber-950/20'
                  : 'border-muted bg-muted/20'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 flex-1 pr-2">
                <span className="shrink-0 text-xs mt-0.5">
                  {isPass ? '✅' : isWarn ? '⚠️' : '❌'}
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-foreground block truncate">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {item.message}
                  </span>
                </div>
              </div>

              {item.actionUrl && (
                <Link
                  to={item.actionUrl}
                  className="min-h-[48px] px-2.5 py-1 text-[10px] font-bold rounded border bg-card hover:bg-muted text-foreground transition inline-flex items-center justify-center shrink-0 mobile-touch-target"
                >
                  {item.actionLabel || 'Edit ✎'}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {readinessState === 'READY' && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setShowAllChecks(false)}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer mobile-touch-target px-2 py-1"
          >
            Collapse Checklist ↑
          </button>
        </div>
      )}
    </div>
  );
}
