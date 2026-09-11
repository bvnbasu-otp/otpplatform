import type { IdentityProtectedQuote } from '@otp/domain';

function formatInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return score.toFixed(1);
}

/**
 * Reliability figures arrive banded from the view — rating to the half star,
 * on-time to the nearest five percent — so that a distinctive exact number
 * cannot be used to recognise a quoting supplier from one RFQ to the next.
 */
function formatBand(
  value: number | null | undefined,
  render: (value: number) => string,
): string {
  return value === null || value === undefined ? '—' : render(value);
}

export interface IdentityProtectedQuoteComparisonTableProps {
  quotes: IdentityProtectedQuote[];
  isLoading?: boolean;
  error?: string | null;
  rfqStatus?: string | null;
  onSelectForAward?: (quote: IdentityProtectedQuote) => void;
}

/**
 * Identity-protected quote comparison — typed strictly to IdentityProtectedQuote.
 * Constitution: no supplier identity fields rendered pre-reveal.
 * Provides responsive card layout on mobile (< 640px) and dense table on desktop.
 */
export function IdentityProtectedQuoteComparisonTable({
  quotes,
  isLoading = false,
  error = null,
  rfqStatus = null,
  onSelectForAward,
}: IdentityProtectedQuoteComparisonTableProps) {
  if (isLoading) {
    return (
      <div
        className="rounded-lg border bg-card p-8 text-center text-muted-foreground"
        data-testid="identity-protected-quotes-loading"
      >
        Loading identity-protected quotes…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300"
        data-testid="identity-protected-quotes-error"
      >
        {error}
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div
        className="rounded-lg border bg-card p-8 text-center text-muted-foreground"
        data-testid="identity-protected-quotes-empty"
      >
        No quotes available for fair anonymous comparison yet.
      </div>
    );
  }

  const lowestTotal = Math.min(...quotes.map((q) => q.totalCost));

  return (
    <div data-testid="identity-protected-quotes-table">
      {/* 1. Mobile Responsive Card View (< 640px) */}
      <div className="space-y-3 sm:hidden" data-testid="identity-protected-quotes-mobile-cards">
        {quotes.map((quote, idx) => {
          const isSelectedWinner = quote.status === 'SELECTED';
          const isLowest = quote.totalCost === lowestTotal;

          return (
            <div
              key={quote.quoteId}
              className={`rounded-xl border p-3.5 shadow-2xs transition ${
                isSelectedWinner
                  ? 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30'
                  : isLowest
                  ? 'border-primary/40 bg-primary/5'
                  : 'bg-card'
              }`}
              data-testid={`identity-protected-quote-card-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
            >
              {/* Header: Rank + Alias + GST Badge + Winner Status */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-black text-primary">
                    #{idx + 1}
                  </span>
                  <span className="font-mono font-bold text-xs text-foreground truncate">
                    {quote.anonymousLabel}
                  </span>
                  {quote.isGstVerified && (
                    <span
                      title="GST Registered & Verified"
                      className="inline-flex items-center gap-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-extrabold border border-emerald-200 shrink-0"
                    >
                      ✓ GST
                    </span>
                  )}
                </div>

                {isSelectedWinner ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0">
                    🏆 Winner
                  </span>
                ) : (
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Score: </span>
                    <span className="font-bold text-xs text-foreground tabular-nums bg-muted px-1.5 py-0.5 rounded">
                      {formatScore(quote.evaluationScore)}
                    </span>
                  </div>
                )}
              </div>

              {/* Price Row: Total Cost Highlighted */}
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Total Quoted (incl. GST)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold text-foreground tabular-nums">
                      {formatInr(quote.totalCost)}
                    </span>
                    {isLowest && (
                      <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 px-1.5 py-0.2 text-[9px] font-bold">
                        ⚡ Lowest (L1)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[10px] text-muted-foreground tabular-nums">
                  <div>Base: {formatInr(quote.basePrice)}</div>
                  <div>GST: +{formatInr(quote.gstAmount)}</div>
                </div>
              </div>

              {/* Grid: Delivery, Warranty, Rating, Reliability */}
              <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-muted/40 p-2 text-center text-[10px] mb-2.5">
                <div>
                  <div className="text-muted-foreground font-semibold">Delivery</div>
                  <div className="font-bold text-foreground mt-0.5">{quote.deliveryDays} Days</div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">Warranty</div>
                  <div className="font-bold text-foreground mt-0.5">{quote.warrantyMonths} Mo</div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">Rating</div>
                  <div className="font-bold text-foreground mt-0.5">
                    {formatBand(quote.supplierRatingAvg, (v) => `${v.toFixed(1)}★`)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">On-Time</div>
                  <div className="font-bold text-foreground mt-0.5">
                    {formatBand(quote.pastPerformanceScore, (v) => `${v}%`)}
                  </div>
                </div>
              </div>

              {/* Actions on Mobile Card */}
              {onSelectForAward && rfqStatus !== 'AWARDED' && (
                <button
                  type="button"
                  onClick={() => onSelectForAward(quote)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
                >
                  <span>⚡</span>
                  <span>Select &amp; Award Recommendation</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. Desktop & Tablet Table View (>= 640px) */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium text-right">Base</th>
              <th className="px-4 py-3 font-medium text-right">GST</th>
              <th className="px-4 py-3 font-medium text-right">Transport</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">Delivery</th>
              <th className="px-4 py-3 font-medium text-right">Warranty</th>
              <th className="px-4 py-3 font-medium text-right">Rating</th>
              <th className="px-4 py-3 font-medium text-right">On time</th>
              <th className="px-4 py-3 font-medium text-right">Score</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {onSelectForAward && rfqStatus !== 'AWARDED' && (
                <th className="px-4 py-3 font-medium text-right">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const isSelectedWinner = quote.status === 'SELECTED';
              const isLowest = quote.totalCost === lowestTotal;
              return (
                <tr
                  key={quote.quoteId}
                  className={`border-b last:border-0 ${isSelectedWinner ? 'bg-emerald-500/10 dark:bg-emerald-950/20 font-medium' : isLowest ? 'bg-accent/60' : ''}`}
                  data-testid={`identity-protected-quote-row-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{quote.anonymousLabel}</span>
                      {isSelectedWinner && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 px-2 py-0.2 text-[10px] font-black">
                          🏆 Winner
                        </span>
                      )}
                      {quote.isGstVerified && (
                        <span
                          title="Government-Registered Taxpayer with Active GSTIN (Shielded during comparison)"
                          className="inline-flex items-center gap-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                        >
                          ✓ GST Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatInr(quote.basePrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatInr(quote.gstAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatInr(quote.transportCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatInr(quote.totalCost)}
                    {isLowest && (
                      <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                        Lowest
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{quote.deliveryDays}d</td>
                  <td className="px-4 py-3 text-right tabular-nums">{quote.warrantyMonths}mo</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBand(quote.supplierRatingAvg, (v) => `${v.toFixed(1)}★`)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBand(quote.pastPerformanceScore, (v) => `${v}%`)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatScore(quote.evaluationScore)}
                  </td>
                  <td className="px-4 py-3">
                    {isSelectedWinner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 whitespace-nowrap">
                        🏆 AWARDED WINNER
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{quote.status}</span>
                    )}
                  </td>
                  {onSelectForAward && rfqStatus !== 'AWARDED' && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectForAward(quote)}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-xs flex items-center gap-1 ml-auto"
                      >
                        <span>⚡</span> Select &amp; Award
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Legacy alias
export type BlindQuoteComparisonTableProps = IdentityProtectedQuoteComparisonTableProps;
export const BlindQuoteComparisonTable = IdentityProtectedQuoteComparisonTable;
