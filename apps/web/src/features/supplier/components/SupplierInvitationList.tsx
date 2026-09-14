import { Link } from 'react-router-dom';
import { formatDateIST, formatDeadlineCountdown } from '@/lib/date-utils';
import type { SupplierInvitation } from '../types/supplier-quote';
import { formatMoney, type PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';

export function SupplierInvitationList({
  invitations,
  purchaseOrders,
  isLoading,
  error,
}: {
  invitations: SupplierInvitation[];
  purchaseOrders?: PurchaseOrderSummary[];
  isLoading?: boolean;
  error?: string | null;
}) {
  if (isLoading) {
    return (
      <div className="py-8 text-center space-y-2">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs font-semibold text-muted-foreground">Loading RFQ Opportunities…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-600 dark:text-red-300 font-medium">
        ⚠️ {error}
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">No RFQ invitations yet.</p>
        <p className="mt-1">When buyers publish sourcing requirements matching your category, opportunities will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="supplier-invitation-list">
      {invitations.map((inv) => {
        const isAwarded = inv.rfqStatus === 'AWARDED' || inv.rfqStatus === 'CLOSED';
        const isEvaluation = inv.rfqStatus === 'EVALUATING';
        const isQuoted = inv.status === 'QUOTED';
        const isCancelled = inv.rfqStatus === 'CANCELLED';

        const matchedPo = purchaseOrders?.find((po) => po.rfqId === inv.rfqId);
        const countdown = formatDeadlineCountdown(inv.quoteDeadline);

        return (
          <article
            key={inv.invitationId}
            className={`rounded-2xl border p-3.5 sm:p-4 transition-all shadow-xs ${
              matchedPo?.status === 'ISSUED'
                ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-400/40'
                : isQuoted
                ? 'border-border/80 bg-card hover:border-primary/40'
                : !isAwarded && !isCancelled
                ? 'border-amber-400/60 bg-gradient-to-br from-card via-amber-500/5 to-card hover:border-amber-500'
                : 'border-border/60 bg-muted/15'
            }`}
          >
            {/* Top Row: Ref Badge, Status & Deadline Countdown */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {inv.publicRef && (
                  <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                    {inv.publicRef}
                  </span>
                )}
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold truncate">
                  🛡️ {inv.anonymousLabel}
                </span>
              </div>

              {/* Status / Urgency Badge */}
              <div className="flex items-center gap-1.5 shrink-0">
                {matchedPo?.status === 'ISSUED' ? (
                  <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 border border-blue-400 px-2.5 py-0.5 text-[10px] font-extrabold animate-pulse">
                    ⚡ PO ISSUED
                  </span>
                ) : matchedPo?.isSettled || matchedPo?.status === 'COMPLETED' ? (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border border-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                    🏁 SETTLED
                  </span>
                ) : matchedPo ? (
                  <span className="rounded-full bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-300 border border-teal-400 px-2 py-0.5 text-[10px] font-bold">
                    📦 IN WORK ({matchedPo.progressPercent}%)
                  </span>
                ) : isCancelled ? (
                  <span className="rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 px-2 py-0.5 text-[10px] font-bold">
                    CANCELLED
                  </span>
                ) : isAwarded ? (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 px-2 py-0.5 text-[10px] font-bold">
                    CONCLUDED
                  </span>
                ) : isEvaluation ? (
                  <span className="rounded-full bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 border border-purple-300 px-2 py-0.5 text-[10px] font-bold">
                    ⚖️ EVALUATING
                  </span>
                ) : isQuoted ? (
                  <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border border-blue-300 px-2 py-0.5 text-[10px] font-bold">
                    ✓ QUOTE SUBMITTED
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-400 px-2.5 py-0.5 text-[10px] font-extrabold">
                    ⚡ ACTION REQUIRED
                  </span>
                )}
              </div>
            </div>

            {/* Main Content: Title, Category, Location, Deadline Countdown */}
            <div className="mt-2.5 space-y-2">
              <div>
                <h3 className="font-extrabold text-sm text-foreground leading-snug">
                  {inv.rfqTitle}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground/80">Buyer: {inv.buyerDisplayName}</span>
                  <span>•</span>
                  <span>Invited: {formatDateIST(inv.invitedAt)}</span>
                </p>
              </div>

              {/* Deadline & Opportunity Metadata Bar */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Submission Deadline:
                  </span>
                  <span className="font-semibold text-foreground truncate block">
                    {formatDateIST(inv.quoteDeadline) || 'Standard Window'}
                  </span>
                </div>

                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Deadline Countdown:
                  </span>
                  <span
                    className={`font-mono font-bold text-xs truncate block ${
                      countdown.isPassed
                        ? 'text-muted-foreground'
                        : countdown.isUrgent
                        ? 'text-amber-700 dark:text-amber-400 font-black animate-pulse'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    ⏱️ {countdown.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Prominent Touch CTA Button */}
            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
                {isQuoted ? 'Quote recorded under sealed evaluation' : 'Zero commission · Neutral quote review'}
              </span>

              <div className="w-full sm:w-auto">
                {matchedPo ? (
                  matchedPo.status === 'ISSUED' ? (
                    <Link
                      to={`/supplier/purchase-orders/${matchedPo.id}`}
                      className="w-full sm:w-auto min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target"
                    >
                      <span>⚡ Accept PO ({formatMoney(matchedPo.totalAmount, matchedPo.currency)}) →</span>
                    </Link>
                  ) : (
                    <Link
                      to={`/supplier/purchase-orders/${matchedPo.id}`}
                      className="w-full sm:w-auto min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target"
                    >
                      <span>Manage Work Order →</span>
                    </Link>
                  )
                ) : isAwarded || isCancelled ? (
                  <Link
                    to={`/supplier/rfq/${inv.rfqId}`}
                    className="w-full sm:w-auto min-h-[44px] rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition flex items-center justify-center gap-1.5 mobile-touch-target"
                  >
                    <span>View RFQ Summary →</span>
                  </Link>
                ) : (
                  <Link
                    to={`/supplier/rfq/${inv.rfqId}`}
                    className={`w-full sm:w-auto min-h-[44px] rounded-xl px-4 py-2 text-xs font-extrabold shadow-md transition flex items-center justify-center gap-1.5 active:scale-98 mobile-touch-target ${
                      isQuoted
                        ? 'border border-border bg-card text-foreground hover:bg-muted'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    <span>{isQuoted ? '✏️ View & Revise Quote →' : '⚡ Submit Quote →'}</span>
                  </Link>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
