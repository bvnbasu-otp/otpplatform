import React from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@/features/fulfillment/types/fulfillment';

interface SupplierOrdersSummaryCardProps {
  activeCount: number;
  totalAmount: number;
  pendingAcceptanceCount: number;
  completedCount: number;
  ratingAvg?: number;
}

export function SupplierOrdersSummaryCard({
  activeCount,
  totalAmount,
  pendingAcceptanceCount,
  completedCount,
  ratingAvg,
}: SupplierOrdersSummaryCardProps) {
  return (
    <article
      className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 space-y-3 shadow-2xs"
      data-testid="supplier-orders-summary-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-foreground">Active Orders &amp; Fulfillment</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Direct settlement purchase orders</p>
        </div>

        {ratingAvg !== undefined && ratingAvg > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 shrink-0">
            ⭐ {ratingAvg.toFixed(1)} Rating
          </span>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-muted/30 border border-border/60 text-center select-none text-xs">
        <div>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Active Orders</span>
          <span className="text-sm font-black text-primary block mt-0.5">{activeCount}</span>
        </div>
        <div className="border-x border-border/60 px-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Total Volume</span>
          <span className="text-sm font-bold text-foreground block mt-0.5 truncate">
            {totalAmount > 0 ? formatMoney(totalAmount) : '₹0'}
          </span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Completed</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">{completedCount}</span>
        </div>
      </div>

      {pendingAcceptanceCount > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-100/60 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border border-blue-300/60 dark:border-blue-800/60 text-xs font-semibold">
          <span>⚡</span>
          <span>{pendingAcceptanceCount} purchase {pendingAcceptanceCount === 1 ? 'order requires' : 'orders require'} acceptance</span>
        </div>
      )}

      {/* Action CTA: Min 48px touch target */}
      <div className="pt-0.5">
        <Link
          to="/supplier/purchase-orders"
          className="min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 mobile-touch-target"
        >
          <span>View Orders Ledger</span>
          <span>→</span>
        </Link>
      </div>
    </article>
  );
}
