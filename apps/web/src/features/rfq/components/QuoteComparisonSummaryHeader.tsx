export interface QuoteComparisonSummaryHeaderProps {
  rfqTitle?: string;
  location?: string;
  budgetTarget?: number | null;
  quotesCount: number;
  minQuotesRequired?: number;
  rfqStatus?: string | null;
  lowestPrice?: number | null;
  fastestTat?: number | null;
  longestWarranty?: number | null;
  highestScore?: number | null;
}

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

export function QuoteComparisonSummaryHeader({
  rfqTitle = 'Procurement Requirement',
  location,
  budgetTarget,
  quotesCount,
  minQuotesRequired = 3,
  rfqStatus,
  lowestPrice,
  fastestTat,
  longestWarranty,
  highestScore,
}: QuoteComparisonSummaryHeaderProps) {
  const quorumMet = quotesCount >= minQuotesRequired;
  const isAwarded = rfqStatus === 'AWARDED';

  return (
    <div className="space-y-2.5" data-testid="quote-comparison-summary-header">
      {/* 1. Header Requirement Title & Location / Budget Target */}
      <div className="rounded-2xl border bg-card p-3.5 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-md bg-teal-100 dark:bg-teal-950/60 px-2 py-0.5 text-[10px] font-extrabold text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
                Step 6 / 15 · Evaluation
              </span>
              {location && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <span>📍</span>
                  <span className="truncate">{location}</span>
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-black text-foreground tracking-tight truncate">
              {rfqTitle}
            </h1>
          </div>

          {budgetTarget != null && budgetTarget > 0 && (
            <div className="flex items-center sm:flex-col sm:items-end justify-between border-t sm:border-t-0 pt-1 sm:pt-0 shrink-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Budget Target
              </span>
              <span className="font-mono font-black text-xs sm:text-sm text-foreground tabular-nums">
                {formatInr(budgetTarget)}
              </span>
            </div>
          )}
        </div>

        {/* 2. Live Quote Count Banner & Identity Protection Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/60">
          {/* Quote Count & Quorum Banner */}
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 px-3 py-2 text-xs">
            <span className="text-base shrink-0">
              {isAwarded ? '🏆' : quorumMet ? '🟢' : '🟡'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-extrabold text-emerald-950 dark:text-emerald-200 truncate">
                  {quotesCount} Competitive {quotesCount === 1 ? 'Quote' : 'Quotes'} Received
                </span>
                <span className="rounded-full bg-emerald-200/70 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 px-1.5 py-0.2 text-[9px] font-black shrink-0">
                  {quorumMet ? `Quorum Met (${quotesCount}/${minQuotesRequired})` : `Quorum: ${quotesCount}/${minQuotesRequired}`}
                </span>
              </div>
              <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80 leading-tight truncate">
                {isAwarded
                  ? 'Evaluation completed · Winning supplier selected and contract issued'
                  : quorumMet
                  ? 'Ready for evaluation scoring, technical review, and committee decision'
                  : `Awaiting ${minQuotesRequired - quotesCount} more quote(s) for formal quorum`}
              </p>
            </div>
          </div>

          {/* Cryptographic Identity Protection Banner */}
          <div className="flex items-center gap-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 px-3 py-2 text-xs">
            <span className="text-base shrink-0">🔒</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-extrabold text-blue-950 dark:text-blue-200 truncate">
                  Identities Cryptographically Sealed
                </span>
                <span className="rounded-full bg-blue-200/70 dark:bg-blue-900/80 text-blue-900 dark:text-blue-200 px-1.5 py-0.2 text-[9px] font-black shrink-0">
                  Zero Bias
                </span>
              </div>
              <p className="text-[10px] text-blue-800/80 dark:text-blue-300/80 leading-tight truncate">
                Supplier names, GSTINs, and contacts unmask only after formal contract award
              </p>
            </div>
          </div>
        </div>

        {/* 3. Quick Glance Comparative Benchmark Strip (if quotes available) */}
        {quotesCount > 0 && (
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted/40 p-2 text-center text-[10px] border border-border/40">
            <div className="space-y-0.5">
              <span className="text-muted-foreground font-semibold block text-[9px]">L1 Best Price</span>
              <span className="font-mono font-black text-xs text-foreground block truncate">
                {formatInr(lowestPrice)}
              </span>
            </div>
            <div className="space-y-0.5 border-l border-border/50">
              <span className="text-muted-foreground font-semibold block text-[9px]">Fastest Delivery</span>
              <span className="font-bold text-xs text-foreground block truncate">
                {fastestTat != null ? `⚡ ${fastestTat} Days` : '—'}
              </span>
            </div>
            <div className="space-y-0.5 border-l border-border/50">
              <span className="text-muted-foreground font-semibold block text-[9px]">Best Warranty</span>
              <span className="font-bold text-xs text-foreground block truncate">
                {longestWarranty != null ? `🛡️ ${longestWarranty} Mo` : '—'}
              </span>
            </div>
            <div className="space-y-0.5 border-l border-border/50">
              <span className="text-muted-foreground font-semibold block text-[9px]">Top Merit Score</span>
              <span className="font-bold text-xs text-emerald-700 dark:text-emerald-400 block truncate">
                {highestScore != null ? `★ ${(highestScore / 10).toFixed(1)}/10` : '—'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
