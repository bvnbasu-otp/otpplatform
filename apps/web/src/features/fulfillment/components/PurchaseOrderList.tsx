import { Link } from 'react-router-dom';
import { formatDateIST } from '@/lib/date-utils';
import { formatMoney, type PurchaseOrderSummary } from '../types/fulfillment';

export interface PurchaseOrderListProps {
  orders: PurchaseOrderSummary[];
  role: 'buyer' | 'supplier';
  isLoading?: boolean;
  error?: string | null;
}

export function PurchaseOrderList({
  orders,
  role,
  isLoading,
  error,
}: PurchaseOrderListProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-xs text-muted-foreground font-medium">Loading Purchase Orders &amp; Ledger Records…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-4 text-center">
        <p className="text-xs text-red-600 dark:text-red-400 font-semibold">⚠️ {error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center space-y-3">
        <div className="text-3xl">📋</div>
        <p className="text-sm font-bold text-foreground">No Purchase Orders Found</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          No orders match the current period or status filter. Try selecting &quot;All Time&quot; or switching filter tabs.
        </p>
        {role === 'buyer' && (
          <Link
            to="/requirements/new"
            className="mt-2 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 mobile-touch-target"
          >
            + Create New Requirement
          </Link>
        )}
      </div>
    );
  }

  const base = role === 'buyer' ? '/purchase-orders' : '/supplier/purchase-orders';

  return (
    <ul className="divide-y divide-border/60 rounded-2xl border bg-card shadow-xs overflow-hidden" data-testid="purchase-order-list">
      {orders.map((po) => {
        const isCancelled = po.status === 'CANCELLED';
        const isDisputed = po.workOrderStatus === 'DISPUTED';
        const progress = po.progressPercent ?? (po.isSettled ? 100 : 0);
        const isCompleted = po.isSettled || po.status === 'COMPLETED';

        let progressColor = 'bg-yellow-400';
        let progressTextColor = 'text-yellow-800 dark:text-yellow-300';
        let fulfillmentChip = { label: '🟡 In Production', class: 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border-yellow-300' };

        if (isCancelled) {
          progressColor = 'bg-red-500';
          progressTextColor = 'text-red-700 dark:text-red-300';
          fulfillmentChip = { label: '🚫 Cancelled', class: 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300' };
        } else if (isDisputed) {
          progressColor = 'bg-amber-500';
          progressTextColor = 'text-amber-700 dark:text-amber-300';
          fulfillmentChip = { label: '⚠️ Under Audit', class: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' };
        } else if (isCompleted || progress >= 100) {
          progressColor = 'bg-emerald-600';
          progressTextColor = 'text-emerald-700 dark:text-emerald-300';
          fulfillmentChip = { label: '✅ Delivered & Settled', class: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300' };
        } else if (progress >= 50) {
          progressColor = 'bg-blue-600';
          progressTextColor = 'text-blue-700 dark:text-blue-300';
          fulfillmentChip = { label: '🚚 In Transit', class: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300' };
        }

        return (
          <li
            key={po.id}
            className={`p-3.5 sm:p-4 transition space-y-2.5 ${
              isCancelled
                ? 'bg-red-50/20 hover:bg-red-50/40 opacity-90'
                : isDisputed
                ? 'bg-amber-50/20 hover:bg-amber-50/40'
                : 'hover:bg-muted/20'
            }`}
          >
            {/* Header row: PO number + Total Value + State chip */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-black text-foreground text-xs bg-muted/60 px-2 py-0.5 rounded">
                    {po.poNumber}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${fulfillmentChip.class}`}>
                    {fulfillmentChip.label}
                  </span>
                </div>
                <h4 className={`font-bold text-foreground text-xs sm:text-sm mt-1 truncate ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>
                  {po.rfqTitle}
                </h4>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] text-muted-foreground block font-bold">Total Value</span>
                <span className="font-mono font-black text-foreground text-xs sm:text-sm">
                  {formatMoney(po.totalAmount, po.currency)}
                </span>
              </div>
            </div>

            {/* Entity metadata & GSTIN */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t border-border/40 pt-2">
              <span>Vendor: <strong className="text-foreground">{po.supplierName || 'Awarded Vendor'}</strong></span>
              {po.supplierGstin && <span>· GSTIN: <strong className="font-mono text-foreground">{po.supplierGstin}</strong></span>}
              {po.issuedAt && <span>· Issued: {formatDateIST(po.issuedAt)}</span>}
            </div>

            {/* Progress Indicator */}
            <div className="w-full space-y-1">
              <div className="flex items-center justify-between text-[10px] font-semibold">
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

            {/* Bottom Action */}
            <div className="pt-1 flex items-center justify-end">
              <Link
                to={`${base}/${po.id}`}
                className={`w-full sm:w-auto min-h-[44px] text-center inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-black shadow-xs transition mobile-touch-target ${
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
                  ? 'View Digital PO & Ledger →'
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
