import React from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatMoney, type PurchaseOrderSummary, type WorkOrderSummary } from '../types/fulfillment';

export interface OrderTrackingTimelineProps {
  order: PurchaseOrderSummary;
  workOrder?: WorkOrderSummary | null;
  role?: 'buyer' | 'supplier';
  onViewInvoice?: () => void;
}

export function OrderTrackingTimeline({
  order,
  workOrder,
  role = 'buyer',
  onViewInvoice,
}: OrderTrackingTimelineProps) {
  const progressPercent = workOrder?.progressPercent ?? order.progressPercent ?? (order.status === 'COMPLETED' ? 100 : 0);
  const isCompleted = order.status === 'COMPLETED' || workOrder?.status === 'COMPLETED';
  const hasInvoices = Boolean(order.invoiceStatus && order.invoiceStatus !== 'NONE');
  const isPaid = order.isSettled || order.paymentStatus === 'PAID' || isCompleted;

  // Determine active step index (0-based)
  // 0: Work Order Created, 1: Work in Progress, 2: Completion Update, 3: Invoice, 4: Payment
  const activeStep = isPaid
    ? 4
    : hasInvoices
    ? 3
    : progressPercent >= 100
    ? 2
    : progressPercent > 0
    ? 1
    : 1; // Work in progress default when PO is issued

  const steps = [
    {
      id: 'work_order_created',
      title: 'Work Order Created',
      description: 'Order confirmed and contract scope locked',
      status: 'COMPLETED' as const,
      badge: '✓ Done',
      time: order.issuedAt ? 'Confirmed' : 'Issued',
    },
    {
      id: 'work_in_progress',
      title: 'Work in Progress',
      description: 'On-site execution and materials deployment',
      status: activeStep > 1 ? ('COMPLETED' as const) : activeStep === 1 ? ('ACTIVE' as const) : ('PENDING' as const),
      badge: activeStep > 1 ? '✓ Done' : '⚡ Active',
      time: progressPercent > 0 ? `${progressPercent}% completed` : 'Started',
    },
    {
      id: 'completion_update',
      title: 'Completion Update',
      description: 'Quality inspection and execution sign-off',
      status: activeStep > 2 ? ('COMPLETED' as const) : activeStep === 2 ? ('ACTIVE' as const) : ('PENDING' as const),
      badge: activeStep > 2 ? '✓ Verified' : activeStep === 2 ? '⚡ In Review' : '⏳ Pending',
      time: workOrder?.buyerAcceptedAt ? 'Signed off' : progressPercent >= 100 ? 'Ready for sign-off' : 'Pending completion',
    },
    {
      id: 'invoice',
      title: 'Invoice',
      description: 'Statutory GST tax invoice and commercial validation',
      status: activeStep > 3 ? ('COMPLETED' as const) : activeStep === 3 ? ('ACTIVE' as const) : ('PENDING' as const),
      badge: activeStep > 3 ? '✓ Invoiced' : activeStep === 3 ? '⚡ Generated' : '⏳ Pending',
      time: hasInvoices ? 'Bill generated' : 'Upon completion',
    },
    {
      id: 'payment',
      title: 'Payment',
      description: 'Direct bilateral payment settlement',
      status: activeStep >= 4 ? ('COMPLETED' as const) : ('PENDING' as const),
      badge: isPaid ? '✓ Settled' : '⏳ Pending',
      time: isPaid ? '100% Settled' : 'Final step',
    },
  ];

  const vendorPhone = order.supplierPhone || '+91 98450 12345';
  const cleanPhone = vendorPhone.replace(/[^0-9]/g, '');

  return (
    <div
      className="rounded-3xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs space-y-4 text-left"
      data-testid="screen-9-order-tracking"
    >
      {/* 1. Order Summary Card matching Screen 9 */}
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3">
          <div className="min-w-0">
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider block">
              {order.poNumber || 'Work Order'}
            </span>
            <h2 className="text-base sm:text-lg font-black text-foreground truncate mt-0.5">
              {order.rfqTitle || 'Plumbing Services'}
            </h2>
            <p className="text-xs font-semibold text-primary mt-0.5">
              {order.supplierName || 'AquaFix Services'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Amount</span>
            <span className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400">
              {formatMoney(order.totalAmount, order.currency)}
            </span>
          </div>
        </div>

        {/* 1-Tap Quick Action Buttons (Call & WhatsApp) matching Screen 9 */}
        <div className="flex items-center gap-2 pt-1">
          <a
            href={`tel:${vendorPhone}`}
            className="flex-1 min-h-[44px] rounded-xl bg-card border border-border/80 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            aria-label="Call supplier"
          >
            <Icon name="call" size={16} className="text-primary" />
            <span>Call</span>
          </a>
          <a
            href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
              `Hello ${order.supplierName || 'Team'}, regarding Order ${order.poNumber}...`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
            aria-label="WhatsApp supplier"
          >
            <Icon name="chat" size={16} className="text-white" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {/* 2. Vertical 5-Step Milestone Timeline matching Screen 9 */}
      <div className="space-y-3 pt-1">
        <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Order Milestones:
        </h3>

        <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {steps.map((s, idx) => {
            const isDone = s.status === 'COMPLETED';
            const isActive = s.status === 'ACTIVE';

            return (
              <div key={s.id} className="relative group" data-testid={`order-tracking-step-${idx + 1}`}>
                {/* Milestone Bullet connected with line */}
                <div
                  className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black border transition ${
                    isDone
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : isActive
                      ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/20 animate-pulse'
                      : 'bg-card text-muted-foreground border-border'
                  }`}
                >
                  {isDone ? '✓' : idx + 1}
                </div>

                {/* Milestone Content */}
                <div
                  className={`rounded-xl border p-3 transition space-y-1 ${
                    isActive
                      ? 'border-primary/50 bg-primary/5 shadow-2xs'
                      : isDone
                      ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                      : 'border-border/60 bg-muted/20 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-foreground">{s.title}</h4>
                    <span
                      className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                        isDone
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                          : isActive
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {s.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {s.description}
                  </p>
                  <span className="text-[10px] font-semibold text-muted-foreground block pt-0.5">
                    · {s.time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
