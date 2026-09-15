import { Link } from 'react-router-dom';
import type { RfqMonitoringSupplierResponse } from '../types/rfq-monitoring';

interface ActiveRfqSupplierResponsesListProps {
  rfqId: string;
  responses: RfqMonitoringSupplierResponse[];
}

export function ActiveRfqSupplierResponsesList({
  rfqId,
  responses,
}: ActiveRfqSupplierResponsesListProps) {
  const quotedCount = responses.filter((r) => r.status === 'QUOTED').length;

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="active-rfq-supplier-responses-list"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Live Supplier Responses ({quotedCount}/{responses.length})
          </span>
          <h2 className="text-sm sm:text-base font-bold text-foreground mt-1">
            Identity-Protected Inbound Activity
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Suppliers are represented by protected aliases. Full identity remains locked until award.
          </p>
        </div>

        <Link
          to={`/rfq/${rfqId}/clarification`}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0"
          title="Open Supplier Clarification Thread"
        >
          <span>Q&amp;A Thread 💬</span>
        </Link>
      </div>

      {responses.length === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground bg-muted/20">
          No suppliers invited yet. Discover suppliers to launch competitive sourcing.
        </div>
      ) : (
        <div className="space-y-2.5">
          {responses.map((res) => {
            const hasQuote = res.status === 'QUOTED' && res.quote;
            const isDeclined = res.status === 'DECLINED';
            const isViewed = res.status === 'VIEWED';

            return (
              <div
                key={res.invitationId}
                className="rounded-xl border bg-card/60 p-3 shadow-2xs space-y-2 hover:bg-muted/20 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-xs sm:text-sm text-foreground">
                        {res.anonymousLabel}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-semibold text-muted-foreground border">
                        {res.networkLabel}
                      </span>
                      {res.isLocal && (
                        <span className="text-[9px] font-medium text-purple-700 dark:text-purple-300">
                          📍 Local {res.distanceKm ? `(${res.distanceKm} km)` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="text-amber-500 font-bold">
                        {'★'.repeat(res.matchLevel === 'EXCELLENT' ? 5 : res.matchLevel === 'STRONG' ? 4 : 3)}
                      </span>
                      <span>{res.matchScore}% Match Score</span>
                    </div>
                  </div>

                  {/* Status Pill */}
                  <div>
                    {hasQuote && (
                      <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0 inline-flex items-center gap-1">
                        <span>✓</span>
                        <span>Quote Submitted</span>
                      </span>
                    )}
                    {isViewed && (
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0 inline-flex items-center gap-1">
                        <span>👁️</span>
                        <span>Viewed RFQ</span>
                      </span>
                    )}
                    {isDeclined && (
                      <span className="rounded-md bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                        ✕ Declined
                      </span>
                    )}
                    {!hasQuote && !isViewed && !isDeclined && (
                      <span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground border shrink-0">
                        ⏳ Awaiting Quote
                      </span>
                    )}
                  </div>
                </div>

                {/* Quote Parameters Summary if Submitted */}
                {hasQuote && res.quote && (
                  <div className="rounded-lg bg-muted/30 p-2 text-xs border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <span className="font-bold text-foreground">
                        💰 ₹{Number(res.quote.totalCost).toLocaleString('en-IN')} (Sealed)
                      </span>
                      <span className="text-muted-foreground">
                        ⏱️ Delivery: <strong>{res.quote.deliveryDays} Days</strong>
                      </span>
                      <span className="text-muted-foreground">
                        🛡️ Warranty: <strong>{res.quote.warrantyMonths} Months</strong>
                      </span>
                    </div>

                    <Link
                      to={`/rfq/${rfqId}/evaluation`}
                      className="min-h-[48px] inline-flex items-center text-[11px] font-bold text-primary hover:underline mobile-touch-target px-2"
                    >
                      Compare in Matrix →
                    </Link>
                  </div>
                )}

                {isDeclined && res.declineReason && (
                  <p className="text-[11px] text-muted-foreground italic bg-muted/20 p-1.5 rounded">
                    Reason: {res.declineReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
