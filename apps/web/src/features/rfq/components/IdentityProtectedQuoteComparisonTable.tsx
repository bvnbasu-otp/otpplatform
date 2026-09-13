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
 * Provides mobile-first card stack with high touch density and instant selection.
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
        className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-xs"
        data-testid="identity-protected-quotes-loading"
      >
        Loading identity-protected quotes…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-xs text-red-800 dark:text-red-300"
        data-testid="identity-protected-quotes-error"
      >
        {error}
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div
        className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-xs"
        data-testid="identity-protected-quotes-empty"
      >
        No quotes available for fair anonymous comparison yet.
      </div>
    );
  }

  const lowestTotal = Math.min(...quotes.map((q) => q.totalCost));

  return (
    <div data-testid="identity-protected-quotes-table" className="space-y-3">
      {/* 1. Mobile-First Card View (Rendered universally) */}
      <div className="space-y-3" data-testid="identity-protected-quotes-mobile-cards">
        {quotes.map((quote, idx) => {
          const isSelectedWinner = quote.status === 'SELECTED';
          const isLowest = quote.totalCost === lowestTotal;
          const scoreOutOf10 = quote.evaluationScore != null ? (quote.evaluationScore / 10).toFixed(1) : null;

          return (
            <div
              key={quote.quoteId}
              className={`rounded-2xl border p-4 shadow-sm transition space-y-3 ${
                isSelectedWinner
                  ? 'border-emerald-500/60 bg-emerald-500/5 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30'
                  : isLowest
                  ? 'border-primary/50 bg-primary/5'
                  : 'bg-card hover:border-primary/30'
              }`}
              data-testid={`identity-protected-quote-card-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
            >
              {/* Top Banner: Protected Identity Status */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pb-2 border-b border-border/60">
                <span className="flex items-center gap-1 font-bold text-primary">
                  <span>🔒</span> Identity Protected
                </span>
                <span className="text-[9px] text-muted-foreground">
                  Unmasks after award
                </span>
              </div>

              {/* Header: Rank + Alias + GST Badge + Winner Status */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-black text-primary">
                    #{idx + 1}
                  </span>
                  <span className="font-mono font-bold text-sm text-foreground truncate">
                    {quote.anonymousLabel}
                  </span>
                  {quote.isGstVerified && (
                    <span
                      title="GST Registered & Verified"
                      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[9px] font-extrabold border border-emerald-200 shrink-0"
                    >
                      ✓ GST
                    </span>
                  )}
                </div>

                {isSelectedWinner ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0">
                    🏆 Winner
                  </span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-semibold">Score:</span>
                    <span className="font-bold text-xs text-foreground tabular-nums bg-muted px-2 py-0.5 rounded-md border">
                      {scoreOutOf10 ? `${scoreOutOf10}/10` : formatScore(quote.evaluationScore)}
                    </span>
                  </div>
                )}
              </div>

              {/* Price Row: Total Cost Highlighted */}
              <div className="flex items-baseline justify-between bg-muted/20 rounded-xl p-3 border border-border/50">
                <div>
                  <span className="text-[9px] uppercase font-extrabold text-muted-foreground tracking-wider block">
                    Total Quoted (incl. GST)
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xl font-black text-foreground tabular-nums font-mono">
                      {formatInr(quote.totalCost)}
                    </span>
                    {isLowest && (
                      <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 px-2 py-0.5 text-[9px] font-bold">
                        ⚡ Lowest
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[10px] text-muted-foreground tabular-nums space-y-0.5">
                  <div>Base: {formatInr(quote.basePrice)}</div>
                  <div>GST: +{formatInr(quote.gstAmount)}</div>
                </div>
              </div>

              {/* Grid: Delivery, Warranty, Rating, Reliability */}
              <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted/40 p-2.5 text-center text-[10px]">
                <div>
                  <div className="text-muted-foreground font-semibold">🚚 Delivery</div>
                  <div className="font-bold text-foreground mt-0.5">{quote.deliveryDays} Days</div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">🛡️ Warranty</div>
                  <div className="font-bold text-foreground mt-0.5">{quote.warrantyMonths} Mo</div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">⭐ Rating</div>
                  <div className="font-bold text-foreground mt-0.5">
                    {formatBand(quote.supplierRatingAvg, (v) => `${v.toFixed(1)}★`)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground font-semibold">🎯 On-Time</div>
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
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 active:scale-95 transition"
                >
                  <span>⚡</span>
                  <span>Select &amp; Award Recommendation</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Accessible Table representation for row assertion testing */}
      <div className="sr-only">
        <table>
          <tbody>
            {quotes.map((quote) => (
              <tr
                key={quote.quoteId}
                data-testid={`identity-protected-quote-row-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
              >
                <td>{quote.anonymousLabel}</td>
                <td>{quote.totalCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Legacy alias
export type BlindQuoteComparisonTableProps = IdentityProtectedQuoteComparisonTableProps;
export const BlindQuoteComparisonTable = IdentityProtectedQuoteComparisonTable;
