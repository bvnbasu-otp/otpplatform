import type { IdentityProtectedQuote } from '@otp/domain';

export interface QuoteCard4PillarProps {
  quote: IdentityProtectedQuote;
  rankIndex: number;
  isLowestPrice: boolean;
  isFastestTat: boolean;
  isLongestWarranty: boolean;
  isTopScore: boolean;
  lowestPriceAmount: number;
  isSelected: boolean;
  onSelect: (quote: IdentityProtectedQuote) => void;
  onOpenBoq: (quote: IdentityProtectedQuote) => void;
  rfqStatus?: string | null;
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

function formatBand(
  value: number | null | undefined,
  render: (value: number) => string,
): string {
  return value === null || value === undefined ? '—' : render(value);
}

export function QuoteCard4Pillar({
  quote,
  rankIndex,
  isLowestPrice,
  isFastestTat,
  isLongestWarranty,
  isTopScore,
  lowestPriceAmount,
  isSelected,
  onSelect,
  onOpenBoq,
  rfqStatus,
}: QuoteCard4PillarProps) {
  const isSelectedWinner = quote.status === 'SELECTED' || rfqStatus === 'AWARDED';
  const scoreOutOf10 = quote.evaluationScore != null ? (quote.evaluationScore / 10).toFixed(1) : null;
  const priceDelta = quote.totalCost - lowestPriceAmount;
  const percentDelta = lowestPriceAmount > 0 ? Math.round((priceDelta / lowestPriceAmount) * 100) : 0;
  const paymentDays = quote.paymentTermsDays ?? 30;

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={() => onSelect(quote)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onSelect(quote);
        }
      }}
      className={`relative rounded-2xl border p-3.5 sm:p-4 shadow-sm transition cursor-pointer select-none space-y-3.5 focus:outline-none focus:ring-2 focus:ring-primary ${
        isSelected
          ? 'border-primary ring-2 ring-primary/50 bg-primary/[0.03] dark:bg-primary/[0.08] shadow-md'
          : isLowestPrice
          ? 'border-emerald-500/50 bg-card hover:border-emerald-500/80 hover:shadow-xs'
          : 'border-border bg-card hover:border-primary/40 hover:shadow-xs'
      }`}
      data-testid={`identity-protected-quote-card-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
    >
      {/* 1. Header: Cryptographic Seal & Live Status */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 font-bold text-primary">
          <span>🔒</span>
          <span>Supplier Identity Protected</span>
        </div>
        <span className="text-[9px] text-muted-foreground font-medium">
          Cryptographically Sealed
        </span>
      </div>

      {/* 2. Supplier Alias + Rank + Selection Radio + Badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Radio Indicator */}
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 bg-card'
            }`}
          >
            {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-5 px-1.5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-foreground border">
                #{rankIndex + 1}
              </span>
              <span className="font-mono font-black text-sm text-foreground truncate">
                {quote.anonymousLabel}
              </span>
              <span
                title="🔒 Identity Protected: Supplier identity is sealed until mutual award to ensure unbiased evaluation."
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[9px] font-bold shrink-0 cursor-help"
              >
                <span>🔒</span>
                <span>Shielded</span>
              </span>
              {quote.isGstVerified && (
                <span
                  title="GST Registered & Verified"
                  className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[9px] font-black border border-emerald-300 dark:border-emerald-800 shrink-0"
                >
                  ✓ GST
                </span>
              )}
            </div>
            {quote.experienceBand && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Track Record: {quote.experienceBand} completed orders
              </p>
            )}
          </div>
        </div>

        {/* Hero Score or Winner Badge */}
        {isSelectedWinner ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 text-[10px] font-black text-emerald-800 dark:text-emerald-300 border border-emerald-300 shrink-0">
            🏆 Winner
          </span>
        ) : isTopScore && scoreOutOf10 ? (
          <div className="flex flex-col items-end shrink-0">
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[9px] font-black">
              ★ Top Merit
            </span>
          </div>
        ) : null}
      </div>

      {/* 3. 4-PILLAR STAT GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Pillar 1: ₹ Total Cost */}
        <div
          className={`rounded-xl p-2.5 border transition ${
            isLowestPrice
              ? 'bg-emerald-500/10 border-emerald-500/40 dark:bg-emerald-950/30'
              : 'bg-muted/30 border-border/60'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground tracking-wider">
              💰 Total Cost
            </span>
            {isLowestPrice && (
              <span className="rounded-full bg-emerald-600 text-white px-1.5 py-0.2 text-[8px] font-black shrink-0">
                L1 Best Price
              </span>
            )}
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-foreground tabular-nums font-mono block">
              {formatInr(quote.totalCost)}
            </span>
            <span className="text-[9px] text-muted-foreground block truncate">
              Base: {formatInr(quote.basePrice)} + GST
            </span>
          </div>
        </div>

        {/* Pillar 2: Delivery TAT */}
        <div
          className={`rounded-xl p-2.5 border transition ${
            isFastestTat
              ? 'bg-amber-500/10 border-amber-500/40 dark:bg-amber-950/30'
              : 'bg-muted/30 border-border/60'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground tracking-wider">
              ⚡ Delivery TAT
            </span>
            {isFastestTat && (
              <span className="rounded-full bg-amber-600 text-white px-1.5 py-0.2 text-[8px] font-black shrink-0">
                Fastest TAT
              </span>
            )}
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-foreground tabular-nums block">
              {quote.deliveryDays} Days
            </span>
            <span className="text-[9px] text-muted-foreground block truncate">
              Guaranteed Turnaround
            </span>
          </div>
        </div>

        {/* Pillar 3: Warranty SLA */}
        <div
          className={`rounded-xl p-2.5 border transition ${
            isLongestWarranty
              ? 'bg-blue-500/10 border-blue-500/40 dark:bg-blue-950/30'
              : 'bg-muted/30 border-border/60'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground tracking-wider">
              🛡️ Warranty SLA
            </span>
            {isLongestWarranty && (
              <span className="rounded-full bg-blue-600 text-white px-1.5 py-0.2 text-[8px] font-black shrink-0">
                Best Warranty
              </span>
            )}
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-foreground tabular-nums block">
              {quote.warrantyMonths} Months
            </span>
            <span className="text-[9px] text-muted-foreground block truncate">
              Replacement SLA
            </span>
          </div>
        </div>

        {/* Pillar 4: Merit Score */}
        <div
          className={`rounded-xl p-2.5 border transition ${
            isTopScore
              ? 'bg-emerald-500/10 border-emerald-500/40 dark:bg-emerald-950/30'
              : 'bg-muted/30 border-border/60'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] uppercase font-extrabold text-muted-foreground tracking-wider">
              ★ Merit Score
            </span>
            <span className="text-[8px] font-bold text-muted-foreground">Weighted</span>
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums block">
              {scoreOutOf10 ? `${scoreOutOf10} / 10` : '—'}
            </span>
            <span className="text-[9px] text-muted-foreground block truncate">
              {formatBand(quote.pastPerformanceScore, (v) => `${v}% on-time`)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Quick Difference Highlights & Reliability Tag Row */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        {/* Price Difference Tag */}
        {isLowestPrice ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 font-bold border border-emerald-200 dark:border-emerald-800">
            <span>🏆</span> Lowest Price Quoted
          </span>
        ) : priceDelta > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-0.5 font-semibold border">
            <span>+{formatInr(priceDelta)}</span>
            <span className="text-muted-foreground font-normal">(+{percentDelta}% vs L1)</span>
          </span>
        ) : null}

        {/* Spec Match Pill */}
        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 px-2 py-0.5 font-semibold border border-teal-200 dark:border-teal-800">
          <span>✓</span> 100% Spec Match
        </span>

        {/* Payment Terms Pill */}
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-semibold text-foreground border">
          <span>💳</span> Payment: {paymentDays}-Day Net
        </span>

        {/* Rating Band */}
        {quote.supplierRatingAvg != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 font-semibold border border-amber-200 dark:border-amber-800">
            <span>★</span> {quote.supplierRatingAvg.toFixed(1)} Rating Band
          </span>
        )}

        {/* On-Time Band */}
        {quote.pastPerformanceScore != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 font-semibold border border-blue-200 dark:border-blue-800">
            <span>🎯</span> {quote.pastPerformanceScore}% On-Time Record
          </span>
        )}
      </div>

      {/* 5. Progressive Disclosure & Selection Actions */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        {/* BoQ Sheet Trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBoq(quote);
          }}
          className="flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted active:scale-95 transition mobile-touch-target"
          aria-label={`View BoQ and specifications for ${quote.anonymousLabel}`}
        >
          <span>📄</span>
          <span>View BoQ &amp; Specs</span>
          <span className="text-muted-foreground text-[10px]">▾</span>
        </button>

        {/* Selection Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(quote);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition mobile-touch-target ${
            isSelected
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'border border-primary/30 text-primary hover:bg-primary/10 active:scale-95'
          }`}
        >
          <span>{isSelected ? '✓' : '○'}</span>
          <span>{isSelected ? 'Selected Candidate' : 'Select Candidate'}</span>
        </button>
      </div>
    </div>
  );
}
