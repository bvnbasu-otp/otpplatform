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
  const { errors, warnings, isValid } = validation;

  if (isValid && warnings.length === 0) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 shadow-2xs"
        data-testid="rfq-validation-ready"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">✅</span>
          <span className="font-bold">Ready to Publish — All required sourcing parameters validated.</span>
        </div>
        <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 text-[10px] font-bold border border-emerald-300">
          Validated
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="rfq-validation-checklist">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-800 dark:text-red-200 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              <span>⛔</span> Needs Attention ({errors.length} Blocking Issue{errors.length === 1 ? '' : 's'})
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded border border-red-300">
              Cannot Publish
            </span>
          </div>

          <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> Sourcing Recommendations ({warnings.length})
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded border border-amber-300">
              Advisory Only
            </span>
          </div>

          <ul className="list-disc pl-4 space-y-0.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
            {warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
