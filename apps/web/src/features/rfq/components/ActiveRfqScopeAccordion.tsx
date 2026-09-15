import { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  RfqMonitoringRequirementSummary,
  RfqMonitoringGovernance,
} from '../types/rfq-monitoring';

interface ActiveRfqScopeAccordionProps {
  requirement: RfqMonitoringRequirementSummary;
  governance: RfqMonitoringGovernance;
  attachmentsCount: number;
}

export function ActiveRfqScopeAccordion({
  requirement,
  governance,
  attachmentsCount,
}: ActiveRfqScopeAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    id,
    title,
    description,
    categoryName,
    requirementMode,
    deliveryCity,
    deliveryPincode,
    deliveryLine1,
    siteNotes,
    budgetFormatted,
    requiredByText,
    quantityText,
    paymentTerms,
    priceIncludesGst,
    priceIncludesTransport,
    geographicReach,
    qualityNotes,
    buyerInstructions,
  } = requirement;

  const locationDisplay = [deliveryCity, deliveryPincode].filter(Boolean).join(' • ') || 'Location flexible';

  return (
    <section
      className="rounded-xl border bg-card shadow-2xs transition-all text-foreground overflow-hidden"
      data-testid="active-rfq-scope-accordion"
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/20 transition min-h-[48px] mobile-touch-target"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground border">
            Specifications &amp; Scope
          </span>
          <span className="text-xs sm:text-sm font-bold text-foreground">
            What Suppliers Are Quoting
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-primary">
          <span>{isOpen ? 'Hide Spec ▲' : 'View Spec ▼'}</span>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 pt-0 border-t space-y-3.5 text-xs">
          <div className="space-y-1 pt-3">
            <h3 className="font-black text-foreground text-sm">{title}</h3>
            {description && (
              <p className="text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed whitespace-pre-wrap">
                &ldquo;{description}&rdquo;
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/30 p-2.5 border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                📍 Delivery &amp; Site Location
              </span>
              <p className="font-semibold text-foreground">{locationDisplay}</p>
              {deliveryLine1 && <p className="text-[11px] text-muted-foreground">{deliveryLine1}</p>}
              {siteNotes && <p className="text-[10px] text-muted-foreground italic">Site notes: {siteNotes}</p>}
            </div>

            <div className="rounded-lg bg-muted/30 p-2.5 border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                💰 Commercial Terms &amp; Baseline
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
              {quantityText && <p className="text-[11px] text-foreground font-semibold">📦 {quantityText}</p>}
              <p className="text-[10px] text-muted-foreground">
                Payment: {paymentTerms}
                {priceIncludesGst ? ' • Incl. GST' : ''}
                {priceIncludesTransport ? ' • Incl. Transport' : ''}
              </p>
            </div>
          </div>

          {buyerInstructions && (
            <div className="text-[11px] text-foreground bg-muted/20 p-2.5 rounded-lg border">
              <strong>Quoting Instructions:</strong> {buyerInstructions}
            </div>
          )}

          {qualityNotes && (
            <div className="text-[11px] text-muted-foreground bg-muted/20 p-2 rounded-lg border">
              <strong>Quality &amp; Inspection:</strong> {qualityNotes}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <span>📎 {attachmentsCount} Drawing/BoQ File(s) (Metadata Stripped)</span>
            <Link
              to={`/requirements/${id}`}
              className="text-primary hover:underline font-bold"
            >
              Full Spec Details ↗
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
