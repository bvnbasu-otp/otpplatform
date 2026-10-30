import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { formatDateIST } from '@/lib/date-utils';
import { formatMoney, type PurchaseOrderSummary } from '../types/fulfillment';
import { fulfillmentChip, isPurchaseOrderComplete, paymentEvidenceLabel } from '../lib/po-lifecycle-present';

export interface PurchaseOrderListProps {
  orders: PurchaseOrderSummary[];
  role: 'buyer' | 'supplier';
  /** Customer buyer personas only. Internal operators must not receive this. */
  allowCreateRequirement?: boolean;
  isLoading?: boolean;
  error?: string | null;
}

export function PurchaseOrderList({
  orders,
  role,
  allowCreateRequirement = false,
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
        {allowCreateRequirement && (
          <Link
            to="/intake"
            data-testid="po-empty-create-requirement"
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
        const progress = po.progressPercent ?? 0;
        const isCompleted = isPurchaseOrderComplete(po.status);
        const chip = fulfillmentChip(po);
        const paymentLabel = paymentEvidenceLabel(po);

        let progressColor = 'bg-yellow-400';
        let progressTextColor = 'text-yellow-800 dark:text-yellow-300';
        if (isCancelled) {
          progressColor = 'bg-red-500';
          progressTextColor = 'text-red-700 dark:text-red-300';
        } else if (isDisputed) {
          progressColor = 'bg-amber-500';
          progressTextColor = 'text-amber-700 dark:text-amber-300';
        } else if (isCompleted) {
          progressColor = 'bg-emerald-600';
          progressTextColor = 'text-emerald-700 dark:text-emerald-300';
        } else if (progress >= 50) {
          progressColor = 'bg-blue-600';
          progressTextColor = 'text-blue-700 dark:text-blue-300';
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
                  <span className="font-mono font-black text-foreground text-xs bg-muted/60 px-2 py-0.5 rounded" data-otp-canonical="true">
                    {po.poNumber}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold border ${chip.className}`} data-testid="po-list-status">
                    {chip.label}
                  </span>
                  {paymentLabel && (
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold border border-border bg-muted text-muted-foreground" data-testid="po-list-payment-evidence">
                      {paymentLabel}
                    </span>
                  )}
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
              <span>Vendor: <strong className="text-foreground" data-otp-canonical="true">{po.supplierName || 'Awarded Vendor'}</strong></span>
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

              {/* 4-Stage Visual Milestone Progression */}
              <div className="grid grid-cols-4 gap-1 pt-1 text-[10px] text-center font-bold">
                <div
                  className={`p-1 rounded-lg border ${
                    isCancelled
                      ? 'bg-muted/40 border-border text-muted-foreground'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  <span>1. Confirmed</span>
                </div>
                <div
                  className={`p-1 rounded-lg border ${
                    isCancelled
                      ? 'bg-muted/40 border-border text-muted-foreground'
                      : progress >= 30
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : progress > 0
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <span>2. In-Transit</span>
                </div>
                <div
                  className={`p-1 rounded-lg border ${
                    isCancelled
                      ? 'bg-muted/40 border-border text-muted-foreground'
                      : progress >= 70
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : progress >= 30
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <span>3. Execution</span>
                </div>
                <div
                  className={`p-1 rounded-lg border ${
                    isCompleted
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : progress >= 70
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/40 border-border text-muted-foreground'
                  }`}
                >
                  <span>4. Paid</span>
                </div>
              </div>
            </div>

            {/* Quick Contact & Bottom Action */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/40">
              <div className="flex items-center gap-1.5 flex-wrap">
                {po.supplierPhone ? (
                  <>
                    <a
                      href={`tel:${po.supplierPhone}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-bold transition min-h-[36px]"
                      title={`Call ${po.supplierName || 'supplier'}`}
                    >
                      <Icon name="call" size={14} className="text-emerald-600" />
                      <span>Call</span>
                    </a>
                    <a
                      href={`https://wa.me/${po.supplierPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Hi ${po.supplierName || ''}, regarding OTP Purchase Order #${po.poNumber}:`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold transition min-h-[36px]"
                      title="WhatsApp Chat with supplier"
                    >
                      <Icon name="chat" size={14} className="text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                ) : null}
              </div>

              <Link
                to={`${base}/${po.id}`}
                className={`w-full sm:w-auto min-h-[40px] text-center inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-black shadow-xs transition mobile-touch-target ${
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
                  : 'View Order Details →'}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
