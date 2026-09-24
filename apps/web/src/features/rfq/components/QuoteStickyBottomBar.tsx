import { Link } from 'react-router-dom';
import type { IdentityProtectedQuote } from '@otp/domain';

export interface QuoteStickyBottomBarProps {
  rfqId: string;
  selectedQuote: IdentityProtectedQuote | null;
  rfqStatus: string | null;
  isSoloBuyer?: boolean;
  hasCommitteeVote?: boolean;
  onCloseQuotingAndEvaluate?: () => void;
  busy?: boolean;
  revealedWinnerPoId?: string | null;
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

export function QuoteStickyBottomBar({
  rfqId,
  selectedQuote,
  rfqStatus,
  isSoloBuyer = false,
  hasCommitteeVote = false,
  onCloseQuotingAndEvaluate,
  busy = false,
}: QuoteStickyBottomBarProps) {
  const isAwarded = rfqStatus === 'AWARDED';
  const isEvaluating = rfqStatus === 'EVALUATING' || rfqStatus === 'CLOSED';
  const isQuoting = !isAwarded && !isEvaluating;

  // Derive target URL based on state
  const committeeUrl = selectedQuote
    ? `/rfq/${rfqId}/committee?quote=${selectedQuote.quoteId}`
    : `/rfq/${rfqId}/committee`;

  const awardUrl = selectedQuote
    ? `/rfq/${rfqId}/award?quote=${selectedQuote.quoteId}`
    : `/rfq/${rfqId}/award`;

  return (
    <div
      className="sticky bottom-0 z-40 mt-auto bg-card/95 backdrop-blur-md border-t border-border shadow-2xl px-3 sm:px-6 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      data-testid="quote-comparison-sticky-bar"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Left: Selected Candidate Info */}
        <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
          {selectedQuote ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-black">
                ✓
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Selected:
                  </span>
                  <span className="font-mono font-bold text-xs text-foreground truncate">
                    {selectedQuote.anonymousLabel}
                  </span>
                  <span className="font-mono font-black text-xs text-primary tabular-nums">
                    {formatInr(selectedQuote.totalCost)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  ⚡ {selectedQuote.deliveryDays}d TAT · 🛡️ {selectedQuote.warrantyMonths}m Warranty · ★ {selectedQuote.evaluationScore != null ? `${(selectedQuote.evaluationScore / 10).toFixed(1)}/10` : '—'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-base">👆</span>
              <span>Select a candidate quote above to proceed</span>
            </div>
          )}
        </div>

        {/* Right: Single Obvious Primary Action (Strict Invariant: Never show competing primary CTAs) */}
        <div className="flex items-center gap-2 shrink-0">
          {isAwarded ? (
            <Link
              to="/purchase-orders"
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 transition mobile-touch-target"
              data-testid="primary-action-view-po"
            >
              <span>📋</span>
              <span>View Digital Purchase Order →</span>
            </Link>
          ) : isQuoting ? (
            <button
              type="button"
              disabled={busy}
              onClick={onCloseQuotingAndEvaluate}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
              data-testid="close-quoting-evaluate-button"
            >
              <span>💬</span>
              <span>{busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}</span>
            </button>
          ) : isSoloBuyer ? (
            <Link
              to={awardUrl}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-800 active:scale-98 transition mobile-touch-target"
              data-testid="proceed-to-award-button"
            >
              <span>🏆</span>
              <span>Proceed to Award →</span>
            </Link>
          ) : hasCommitteeVote ? (
            <Link
              to={committeeUrl}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 transition mobile-touch-target"
              data-testid="proceed-to-evaluation-room-button"
            >
              <span>🗳️</span>
              <span>Cast Committee Vote →</span>
            </Link>
          ) : (
            <Link
              to={committeeUrl}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 transition mobile-touch-target"
              data-testid="proceed-to-evaluation-room-button"
            >
              <span>⚖️</span>
              <span>Proceed to Committee Vote →</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
