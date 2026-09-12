import { Link } from 'react-router-dom';
import { formatDateIST } from '@/lib/date-utils';
import { formatMoney, type PurchaseOrderSummary } from '../types/fulfillment';

export function PurchaseOrderList({
  orders,
  role,
  isLoading,
  error,
}: {
  orders: PurchaseOrderSummary[];
  role: 'buyer' | 'supplier';
  isLoading?: boolean;
  error?: string | null;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center space-y-3">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground font-medium">Loading Purchase Orders &amp; Ledger Records…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 text-center">
        <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/60 p-8 text-center space-y-2">
        <div className="text-2xl">📋</div>
        <p className="text-xs font-bold text-foreground">No Purchase Orders Found</p>
        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
          No orders match the current period or status filter. Try selecting &quot;All Time&quot; or switching filter tabs.
        </p>
        {role === 'buyer' && (
          <Link
            to="/requirements/new"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            + Create New Requirement
          </Link>
        )}
      </div>
    );
  }

  const base = role === 'buyer' ? '/purchase-orders' : '/supplier/purchase-orders';

  return (
    <ul className="divide-y rounded-lg border bg-card shadow-xs" data-testid="purchase-order-list">
      {orders.map((po) => {
        const isCancelled = po.status === 'CANCELLED';
        const isDisputed = po.workOrderStatus === 'DISPUTED';
        const progress = po.progressPercent ?? (po.isSettled ? 100 : 0);
        const isCompleted = po.isSettled || po.status === 'COMPLETED';

        let progressColor = 'bg-yellow-400';
        let progressTextColor = 'text-yellow-800';
        if (isCancelled) {
          progressColor = 'bg-red-400';
          progressTextColor = 'text-red-700';
        } else if (isDisputed) {
          progressColor = 'bg-amber-400';
          progressTextColor = 'text-amber-700';
        } else if (progress >= 100) {
          progressColor = 'bg-emerald-800'; // Dark Green
          progressTextColor = 'text-emerald-800';
        } else if (progress >= 75) {
          progressColor = 'bg-lime-500'; // Light Green
          progressTextColor = 'text-lime-800';
        } else if (progress >= 50) {
          progressColor = 'bg-blue-500'; // Blue
          progressTextColor = 'text-blue-700';
        } else if (progress >= 25) {
          progressColor = 'bg-yellow-400'; // Yellow
          progressTextColor = 'text-yellow-800';
        }

        return (
          <li
            key={po.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 transition ${
              isCancelled
                ? 'bg-red-50/20 hover:bg-red-50/40 opacity-90'
                : isDisputed
                ? 'bg-amber-50/20 hover:bg-amber-50/40'
                : 'hover:bg-muted/20'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-foreground text-xs sm:text-sm font-mono">{po.poNumber}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <p className={`font-semibold text-foreground text-xs sm:text-sm truncate max-w-full sm:max-w-md ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                  {po.rfqTitle}
                </p>
                {isCancelled ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-red-800 border border-red-300">
                    CANCELLED / NO-FAULT EXIT
                  </span>
                ) : isDisputed ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-800 border border-amber-300">
                    ⚠️ DISPUTED / UNDER AUDIT
                  </span>
                ) : isCompleted ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-800 border border-emerald-300">
                    100% SETTLED &amp; REMITTED
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-blue-800 border border-blue-300">
                    IN EXECUTION ({progress}%)
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                <span className={`font-semibold ${isCancelled ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {formatMoney(po.totalAmount, po.currency)}
                </span>
                {po.issuedAt && <span>· Issued {formatDateIST(po.issuedAt)}</span>}
                {po.acknowledgedAt && <span>· Accepted {formatDateIST(po.acknowledgedAt)}</span>}
                {isCancelled && <span className="text-red-600 font-medium">· Closed without penalty</span>}
              </div>

              {/* Progress Indicator */}
              <div className="mt-2 sm:mt-2.5 w-full sm:max-w-xs">
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold mb-1">
                  <span className="text-muted-foreground">
                    {isCancelled ? 'Status' : 'Execution Progress'}
                  </span>
                  <span className={progressTextColor}>
                    {isCancelled ? 'Terminated' : `${progress}%`}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                    style={{ width: isCancelled ? '100%' : `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end sm:justify-start gap-2 sm:gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/30">
              <Link
                to={`${base}/${po.id}`}
                className={`w-full sm:w-auto text-center rounded-md px-3 sm:px-3.5 py-1.5 text-xs font-semibold shadow-xs transition ${
                  isCancelled
                    ? 'border border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                    : isDisputed
                    ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : isCompleted
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isCancelled
                  ? 'View Exit Audit & Reason →'
                  : isDisputed
                  ? 'Resolve Dispute →'
                  : isCompleted
                  ? 'View Order & Audit →'
                  : role === 'supplier'
                  ? 'Update Milestones →'
                  : 'View PO & Inspection →'}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
