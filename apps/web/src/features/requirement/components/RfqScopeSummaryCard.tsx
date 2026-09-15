import { Link } from 'react-router-dom';
import type { RfqReviewRequirement } from '../types/rfq-review';

interface RfqScopeSummaryCardProps {
  requirement: RfqReviewRequirement;
}

export function RfqScopeSummaryCard({ requirement }: RfqScopeSummaryCardProps) {
  const {
    id,
    title,
    description,
    categoryName,
    requirementMode,
    quantity,
    unit,
    deliveryCity,
    deliveryPincode,
    deliveryLine1,
    siteNotes,
    requiredByText,
    budgetFormatted,
    paymentTerms,
    priceIncludesTransport,
    priceIncludesGst,
    geographicReach,
    qualityNotes,
  } = requirement;

  const locationDisplay = [deliveryCity, deliveryPincode].filter(Boolean).join(' • ') || 'Location flexible';

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="rfq-scope-summary-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              1. Requirement &amp; Scope
            </span>
            {categoryName && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                {categoryName.replace(/_/g, ' ')}
              </span>
            )}
            {requirementMode && (
              <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground border">
                {requirementMode}
              </span>
            )}
          </div>

          <h2 className="text-sm sm:text-base font-black text-foreground leading-snug break-words">
            {title}
          </h2>
        </div>

        <Link
          to={`/requirements/${id}`}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0"
          title="Edit Requirement Specifications"
        >
          <span>Edit Spec ✎</span>
        </Link>
      </div>

      {description && (
        <div className="rounded-lg bg-muted/20 p-2.5 text-xs text-foreground border leading-relaxed whitespace-pre-wrap">
          &ldquo;{description}&rdquo;
        </div>
      )}

      {/* Scope Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/30 p-2.5 border space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            📍 Delivery &amp; Site Location
          </span>
          <p className="font-semibold text-foreground">{locationDisplay}</p>
          {deliveryLine1 && <p className="text-[11px] text-muted-foreground">{deliveryLine1}</p>}
          {siteNotes && <p className="text-[10px] text-muted-foreground italic">Site Notes: {siteNotes}</p>}
          {geographicReach && (
            <span className="inline-block mt-1 text-[10px] font-medium text-purple-700 dark:text-purple-300">
              🌐 {geographicReach.replace(/_/g, ' ')} Reach
            </span>
          )}
        </div>

        <div className="rounded-lg bg-muted/30 p-2.5 border space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            💰 Commercial Baseline &amp; TAT
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {budgetFormatted ? (
              <span className="font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-[11px]">
                🔒 Ceiling: {budgetFormatted} (Private)
              </span>
            ) : (
              <span className="text-muted-foreground text-[11px]">Open market rates</span>
            )}
            {requiredByText && (
              <span className="font-medium text-foreground text-[11px]">
                • {requiredByText}
              </span>
            )}
          </div>
          {quantity && (
            <p className="text-[11px] font-semibold text-foreground">
              📦 Quantity: {quantity} {unit ?? 'units'}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Payment: {paymentTerms}
            {priceIncludesGst ? ' • Incl. GST' : ''}
            {priceIncludesTransport ? ' • Incl. Transport' : ''}
          </p>
        </div>
      </div>

      {qualityNotes && (
        <div className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded-lg border">
          <strong>Quality &amp; Inspection:</strong> {qualityNotes}
        </div>
      )}
    </section>
  );
}
