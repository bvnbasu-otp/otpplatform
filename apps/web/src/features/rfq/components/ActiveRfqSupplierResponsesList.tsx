import { Link } from 'react-router-dom';
import type { RfqMonitoringSupplierResponse } from '../types/rfq-monitoring';

interface ActiveRfqSupplierResponsesListProps {
  rfqId: string;
  responses: RfqMonitoringSupplierResponse[];
}

function formatResponseTimestamp(iso: string | null | undefined, prefix: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return `${prefix} just now`;
  if (diffMinutes < 60) return `${prefix} ${diffMinutes}m ago`;
  if (diffHours < 24) return `${prefix} ${diffHours}h ago`;
  if (diffDays === 1) return `${prefix} yesterday`;
  return `${prefix} ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
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
      aria-labelledby="supplier-feed-title"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Live Supplier Feed ({quotedCount}/{responses.length})
          </span>
          <h2 id="supplier-feed-title" className="text-sm sm:text-base font-bold text-foreground mt-1">
            Identity-Protected Inbound Activity
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Suppliers are represented by protected aliases. Full identity remains locked until award.
          </p>
        </div>

        <Link
          to={`/rfq/${rfqId}/clarification`}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0 self-start"
          title="Open Supplier Clarification Thread"
          data-testid="supplier-qa-shortcut-btn"
        >
          <span>Q&amp;A Thread 💬</span>
        </Link>
      </div>

      {responses.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground bg-muted/20 space-y-2"
          data-testid="empty-suppliers-state"
        >
          <span className="text-2xl block">📡</span>
          <p className="font-semibold text-foreground">No supplier responses recorded yet</p>
          <p className="text-[11px]">Enquiry broadcast is active. Inbound quotes expected with a 30-min supplier initial target.</p>
        </div>
      ) : (
        <div className="space-y-2.5" role="feed" aria-label="Inbound supplier quote responses">
          {responses.map((res) => {
            const hasQuote = res.status === 'QUOTED' && res.quote;
            const isDeclined = res.status === 'DECLINED';
            const isViewed = res.status === 'VIEWED';

            const activityTimeText =
              hasQuote && res.quote?.submittedAt
                ? formatResponseTimestamp(res.quote.submittedAt, 'Submitted')
                : isDeclined && res.declinedAt
                ? formatResponseTimestamp(res.declinedAt, 'Declined')
                : isViewed && res.viewedAt
                ? formatResponseTimestamp(res.viewedAt, 'Viewed')
                : res.invitedAt
                ? formatResponseTimestamp(res.invitedAt, 'Invited')
                : null;

            return (
              <article
                key={res.invitationId}
                className="rounded-xl border bg-card/60 p-3 shadow-2xs space-y-2 hover:bg-muted/20 transition"
                data-testid={`supplier-response-card-${res.anonymousLabel.replace(/\s+/g, '-').toLowerCase()}`}
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

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="text-amber-500 font-bold">
                        {'★'.repeat(res.matchLevel === 'EXCELLENT' ? 5 : res.matchLevel === 'STRONG' ? 4 : 3)}
                      </span>
                      <span>{res.matchScore}% Match Score</span>
                      {activityTimeText && (
                        <>
                          <span>•</span>
                          <span className="text-muted-foreground/80 font-medium">{activityTimeText}</span>
                        </>
                      )}
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
                      data-testid={`compare-matrix-btn-${res.anonymousLabel.replace(/\s+/g, '-').toLowerCase()}`}
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
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
