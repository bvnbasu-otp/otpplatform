import { Link } from 'react-router-dom';
import { formatDateIST } from '@/lib/date-utils';
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
    return <p className="text-sm text-muted-foreground">Loading Invitations…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">No RFQ invitations yet.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border bg-card shadow-xs" data-testid="supplier-invitation-list">
      {invitations.map((inv) => {
        const isAwarded = inv.rfqStatus === 'AWARDED' || inv.rfqStatus === 'CLOSED';
        const isEvaluation = inv.rfqStatus === 'EVALUATING';
        const isQuoted = inv.status === 'QUOTED';

        const matchedPo = purchaseOrders?.find((po) => po.rfqId === inv.rfqId);

        return (
          <li key={inv.invitationId} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/20 transition">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-foreground text-sm">{inv.rfqTitle}</p>
                {matchedPo?.status === 'ISSUED' ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-900 border border-blue-400 animate-pulse">
                    ⚡ AWARDED TO YOU · PO ISSUED
                  </span>
                ) : matchedPo?.isSettled || matchedPo?.status === 'COMPLETED' ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                    🎉 AWARDED TO YOU · 100% SETTLED
                  </span>
                ) : matchedPo ? (
                  <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-300">
                    🎉 AWARDED TO YOU · IN EXECUTION ({matchedPo.progressPercent}%)
                  </span>
                ) : isAwarded ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-300">
                    CONCLUDED (NOT AWARDED)
                  </span>
                ) : isEvaluation ? (
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-300">
                    UNDER EVALUATION
                  </span>
                ) : isQuoted ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-300">
                    QUOTE SUBMITTED
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                    NEW INVITATION
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {inv.publicRef && <>{inv.publicRef} · </>}
                {inv.buyerDisplayName} · you are <strong>{inv.anonymousLabel}</strong> · Deadline: {formatDateIST(inv.quoteDeadline)}
                {isAwarded && !matchedPo && <span className="block mt-0.5 text-[11px] text-muted-foreground italic">Another competitive quote was awarded for this contract.</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {matchedPo ? (
                matchedPo.status === 'ISSUED' ? (
                  <Link
                    to={`/supplier/purchase-orders/${matchedPo.id}`}
                    className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
                  >
                    ⚡ Accept PO ({formatMoney(matchedPo.totalAmount, matchedPo.currency)}) →
                  </Link>
                ) : (
                  <Link
                    to={`/supplier/purchase-orders/${matchedPo.id}`}
                    className="rounded-md bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition"
                  >
                    Manage Work Order →
                  </Link>
                )
              ) : isAwarded ? (
                <Link
                  to={`/supplier/rfq/${inv.rfqId}`}
                  className="rounded-md border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground transition"
                >
                  View Closed RFQ →
                </Link>
              ) : (
                <Link
                  to={`/supplier/rfq/${inv.rfqId}`}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-semibold shadow-xs transition ${
                    isQuoted
                      ? 'border bg-card text-foreground hover:bg-muted'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isQuoted ? 'View Quote Details →' : 'Submit Quote →'}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
