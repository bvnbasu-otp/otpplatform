import { formatDateTimeIST } from '@/lib/date-utils';
import type { SupplierPerformanceSummary } from '../api/fetch-supplier-performance';

interface SupplierPerformanceSectionProps {
  performance: SupplierPerformanceSummary | null;
  isLoading: boolean;
}

const RATING_DESCRIPTIONS: Record<number, string> = {
  5: 'Exceptional (Exceeded Expectations)',
  4: 'Very Good (High Quality & On-time)',
  3: 'Satisfactory (Met Specs)',
  2: 'Needs Improvement',
  1: 'Non-compliant',
};

export function SupplierPerformanceSection({
  performance,
  isLoading,
}: SupplierPerformanceSectionProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-xs text-muted-foreground">Loading Performance Score and Buyer Reviews…</p>
      </div>
    );
  }

  if (!performance) return null;

  const ratingAvg = performance.ratingAvg;
  const isTopRated = ratingAvg >= 4.5;
  const totalReviews = performance.totalReviews;

  return (
    <section id="supplier-performance-reviews" className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">
              Buyer Ratings, Reviews &amp; Performance Scorecard
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isTopRated
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-blue-100 text-blue-900 border border-blue-300'
              }`}
            >
              {isTopRated ? '⭐ Top Rated Supplier' : '✓ Verified Supplier'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Verified ratings and review feedback submitted by buyers upon 100% work order completion and inspection sign-off.
          </p>
        </div>

        {/* Big Rating Badge */}
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50/70 px-4 py-2.5 shadow-xs">
          <div className="text-center">
            <span className="text-2xl font-black text-amber-900">{ratingAvg.toFixed(1)}</span>
            <span className="text-xs font-semibold text-amber-800"> / 5.0</span>
            <div className="mt-0.5 flex items-center justify-center gap-0.5 text-amber-500 text-sm">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className={star <= Math.round(ratingAvg) ? 'text-amber-500' : 'text-slate-300'}>
                  ★
                </span>
              ))}
            </div>
          </div>
          <div className="border-l border-amber-200 pl-3 text-left">
            <p className="text-xs font-bold text-amber-950">
              {totalReviews > 0 ? `${totalReviews} Buyer Review${totalReviews > 1 ? 's' : ''}` : 'Platform Merit Score'}
            </p>
            <p className="text-[11px] text-amber-800">
              {performance.completedJobs} Verified Order{performance.completedJobs === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Rating Breakdown + How Ratings Impact Winning Quotes */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Left: Star Distribution Breakdown */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <h3 className="text-xs font-bold text-foreground">Rating Distribution (100% Inspection Sign-offs)</h3>
          <div className="mt-3 space-y-2">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = performance.ratingBreakdown[stars as keyof typeof performance.ratingBreakdown] || 0;
              const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : stars === 5 ? 100 : 0;
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-medium text-muted-foreground">{stars} Star{stars > 1 ? 's' : ''}</span>
                  <div className="h-2.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        stars >= 4 ? 'bg-amber-400' : stars === 3 ? 'bg-blue-400' : 'bg-slate-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold text-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: How Ratings Help Win Future Quotes */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground">
          <h3 className="font-bold text-primary flex items-center gap-1.5">
            <span>💡</span> How Ratings Boost Your Win Rate on Upcoming Quotes
          </h3>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <span className="text-primary font-bold">1.</span>
              <span><strong>Smart Discovery Match:</strong> Higher rated suppliers receive automatic invitation priority in new RFQ broadcasts.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary font-bold">2.</span>
              <span><strong>Fair Anonymous Comparison Scoring:</strong> Your verified rating adds directly to your objective merit score in the Evaluation &amp; Committee Voting Room.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary font-bold">3.</span>
              <span><strong>Improvement Tip:</strong> Update work order milestones promptly and maintain on-time delivery to consistently earn 5-star sign-offs.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Verified Buyer Reviews Feed */}
      <div className="mt-6">
        <h3 className="text-xs font-bold text-foreground mb-3">
          Recent Buyer Inspection Feedback &amp; Review Observations
        </h3>

        {performance.reviews.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">No completed work order reviews recorded yet</p>
            <p className="mt-1">
              When buyers complete 100% delivery inspection and sign-off on your active work orders, their star ratings and review feedback will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {performance.reviews.map((rev, idx) => (
              <div
                key={rev.workOrderId || idx}
                className="rounded-lg border bg-card p-4 shadow-2xs hover:border-primary/40 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center text-amber-500 text-sm">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className={star <= rev.rating ? 'text-amber-500' : 'text-slate-300'}>
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 border border-amber-300">
                      {rev.rating}.0 / 5.0
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {RATING_DESCRIPTIONS[rev.rating] ?? 'Verified Rating'}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTimeIST(rev.buyerAcceptedAt)}
                  </span>
                </div>

                <div className="mt-2.5 rounded-md border border-slate-100 bg-muted/30 p-2.5 text-xs text-foreground">
                  <strong className="text-xs font-semibold text-foreground">Buyer Review: </strong>
                  <span className="text-muted-foreground">"{rev.reviewText}"</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span>PO Reference: <strong className="text-foreground">{rev.poNumber}</strong></span>
                  <span>•</span>
                  <span>Scope: <strong className="text-foreground">{rev.rfqTitle}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
