import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PurchaseOrderStatus } from '@otp/domain';
import {
  fetchPurchaseOrder,
  updatePurchaseOrderStatus,
} from '../api/purchase-orders';
import { createWorkOrder, fetchWorkOrderByPo, updateWorkOrderProgress } from '../api/work-orders';
import { DeliveryInspectionPanel } from '../components/DeliveryInspectionPanel';
import { InvoicePaymentPanel } from '../components/InvoicePaymentPanel';
import { PoActionButtons, StatusBadge } from '../components/FulfillmentStatus';
import { ProcurementStageNavigator, type CoreProcurementState } from '@/features/lifecycle';
import { formatMoney, type PurchaseOrderSummary, type WorkOrderSummary } from '../types/fulfillment';

function formatAddress(addr: unknown, city?: string | null): string {
  if (!addr && !city) return '';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object' && addr !== null) {
    const a = addr as Record<string, unknown>;
    const parts = [a.street || a.line1, a.line2, a.city || city, a.state, a.pincode || a.postal_code].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  return city || '';
}

export function PurchaseOrderDetailPage({
  poId,
  role,
}: {
  poId: string;
  role: 'buyer' | 'supplier';
}) {
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<PurchaseOrderSummary | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const requestedStage = searchParams.get('stage')?.toUpperCase();

  const load = useCallback(async () => {
    const cleanId = (poId || '').trim();
    if (!cleanId) {
      setIsLoading(false);
      setError('Invalid Purchase Order identifier.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const poResult = await fetchPurchaseOrder(cleanId);
      if (!poResult.ok) {
        setError(poResult.error);
        return;
      }
      setOrder(poResult.order);

      try {
        const woResult = await fetchWorkOrderByPo(poResult.order.id);
        if (woResult.ok) {
          setWorkOrder(woResult.workOrder);
        }
      } catch (woErr) {
        console.warn('Non-blocking work order fetch warning:', woErr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load purchase order';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (requestedStage === 'INVOICED' || requestedStage === 'SETTLED') {
      const el = document.getElementById('invoicing-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [requestedStage, workOrder]);

  async function handlePoAction(next: PurchaseOrderStatus) {
    const cleanId = (poId || '').trim();
    if (!cleanId) return;
    setBusy(true);
    setSuccess(null);
    try {
      const result = await updatePurchaseOrderStatus(cleanId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Auto-initialize execution work order when supplier accepts PO
      if (next === 'ACCEPTED' && !workOrder && order) {
        await createWorkOrder(cleanId, order.supplierId, 'Work order — ' + order.poNumber);
      }

      setSuccess(
        next === 'ACCEPTED'
          ? '✓ Purchase Order accepted! Delivery & fulfillment progress tracking is now live.'
          : `PO updated to ${next.replace(/_/g, ' ')}`
      );
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update PO status';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkOrder() {
    if (!order) return;
    const cleanId = (poId || '').trim();
    if (!cleanId) return;
    setBusy(true);
    try {
      const result = await createWorkOrder(
        cleanId,
        order.supplierId,
        'Work order — ' + order.poNumber,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess('Work order progress tracking initialized.');
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create work order';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleProgress(percent: number) {
    if (!workOrder) return;
    setBusy(true);
    try {
      const result = await updateWorkOrderProgress(workOrder.id, percent);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        percent === 100
          ? '✓ 100% Work completion reported! Buyer has been requested to inspect & acknowledge.'
          : `Progress set to ${percent}%.`,
      );
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update progress';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="zero-scroll-container p-4 max-w-7xl mx-auto w-full space-y-4">
        <div className="h-10 bg-muted/60 rounded-lg animate-pulse" />
        <div className="h-24 bg-card border rounded-lg p-4 animate-pulse space-y-2">
          <div className="h-4 bg-muted w-1/4 rounded" />
          <div className="h-6 bg-muted w-1/2 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-48 bg-card border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 max-w-xl mx-auto my-12 text-center rounded-xl border border-border bg-card shadow-sm space-y-4">
        <div className="text-4xl">📦</div>
        <h2 className="text-lg font-bold text-foreground">Purchase Order Not Found</h2>
        <p className="text-sm text-muted-foreground">{error ?? 'The requested purchase order could not be located or has not been generated yet.'}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
          >
            ↻ Retry Loading
          </button>
          <Link
            to={role === 'buyer' ? '/purchase-orders' : '/supplier/purchase-orders'}
            className="rounded-md border border-border bg-muted/40 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition inline-flex items-center"
          >
            ← View Orders & Reports
          </Link>
        </div>
      </div>
    );
  }

  const listPath = role === 'buyer' ? '/purchase-orders' : '/supplier/purchase-orders';

  const currentStage: CoreProcurementState = (() => {
    if (requestedStage === 'SETTLED' || requestedStage === 'INVOICED' || requestedStage === 'PO_ISSUED') {
      return requestedStage as CoreProcurementState;
    }
    // 7. Settled: Payment verified, Invoice paid, or PO / Work Order completed
    if (
      order.status === 'COMPLETED' ||
      order.isSettled ||
      order.paymentStatus === 'VERIFIED' ||
      order.invoiceStatus === 'PAID'
    ) {
      return 'SETTLED';
    }
    // 6. Invoiced: Invoice submitted or approved, or payment recorded, or delivery accepted
    if (
      order.invoiceStatus === 'SUBMITTED' ||
      order.invoiceStatus === 'APPROVED' ||
      order.paymentStatus === 'RECORDED' ||
      (workOrder?.progressPercent === 100 && workOrder.buyerAcceptedAt)
    ) {
      return 'INVOICED';
    }
    return 'PO_ISSUED';
  })();

  const activeLinearStep = (() => {
    if (
      order.status === 'COMPLETED' ||
      order.isSettled ||
      order.paymentStatus === 'VERIFIED' ||
      order.invoiceStatus === 'PAID'
    ) {
      return 15;
    }
    if (
      order.status === 'IN_PROGRESS' ||
      (workOrder && workOrder.progressPercent > 0) ||
      workOrder?.buyerAcceptedAt
    ) {
      return 14;
    }
    return 13;
  })();

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="purchase-order-detail">
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage={currentStage}
        orderTitle={order.rfqTitle || `Purchase Order ${order.poNumber}`}
        orderReference={order.poNumber}
        rfqId={order.rfqId}
        poId={order.id}
        role={role}
        backToUrl={listPath}
        backToLabel="All Purchase Orders"
      />

      {/* Header Bar */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
            Step {activeLinearStep} / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">{order.poNumber}</h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Total: <span className="text-foreground font-bold font-mono">{formatMoney(order.totalAmount, order.currency)}</span> · Vendor: {order.supplierName || 'Awarded Vendor'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition flex items-center gap-1 shadow-2xs"
            title="Print or Save as PDF"
            data-testid="print-po-button"
          >
            <span>🖨️</span>
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {error && (
        <div className="mt-1 rounded-md border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2 text-xs text-red-700 dark:text-red-300 shrink-0">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-1 rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-xs text-emerald-800 dark:text-emerald-300 shrink-0" data-testid="fulfillment-success">
          {success}
        </div>
      )}

      {/* Main Content Pane */}
      <div className="zero-scroll-pane mt-2 pb-20 sm:pb-12 space-y-2">
        {/* Direct Commercial Contract & GST Tax Compliance Parties */}
        <div className="rounded-lg border bg-card p-3 text-xs shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b pb-1.5">
            <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
              Direct Commercial Contract &amp; GST Compliance Parties
            </span>
            <span className="text-[10px] rounded bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 font-bold text-blue-700 dark:text-blue-300 border border-blue-200">
              Direct B2B Commercial Contract
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Buyer Organization (Bill To / Issuer) */}
            <div className="rounded-md border bg-muted/10 p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Bill To (Buyer Organization)</span>
                {order.buyerOrgType && (
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    {order.buyerOrgType}
                  </span>
                )}
              </div>
              <p className="font-bold text-foreground text-sm">{order.buyerOrgName || 'Buyer Organization'}</p>
              
              <div className="pt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Buyer GSTIN:</span>
                <span className="font-mono font-bold text-primary">
                  {order.buyerGstin ? order.buyerGstin : <span className="text-muted-foreground font-normal italic">Unregistered / Exempt</span>}
                </span>
              </div>
              {order.buyerGstin && (
                <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">
                  ✓ Eligible for GST Input Tax Credit (ITC) — Bill To this GSTIN
                </div>
              )}

              {(order.buyerContactPerson || order.buyerContactPhone || order.buyerContactEmail) && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t mt-1 space-y-0.5">
                  {order.buyerContactPerson && <div>Contact: <span className="text-foreground font-medium">{order.buyerContactPerson}</span></div>}
                  {order.buyerContactPhone && <div>Phone: <span className="text-foreground font-mono">{order.buyerContactPhone}</span></div>}
                  {order.buyerContactEmail && <div>Email: <span className="text-foreground">{order.buyerContactEmail}</span></div>}
                </div>
              )}

              {formatAddress(order.buyerAddress, order.buyerCity) && (
                <div className="text-[10px] text-muted-foreground pt-1 border-t mt-1">
                  Site / Delivery Address: <span className="text-foreground">{formatAddress(order.buyerAddress, order.buyerCity)}</span>
                </div>
              )}
            </div>

            {/* Awarded Supplier (Issued To / Vendor) */}
            <div className="rounded-md border bg-muted/10 p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Issued To (Awarded Vendor)</span>
                {order.supplierGstVerified && (
                  <span className="rounded bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200">
                    ✓ GST Verified
                  </span>
                )}
              </div>
              <p className="font-bold text-foreground text-sm">{order.supplierName || 'Awarded Vendor'}</p>
              {order.supplierLegalName && (
                <p className="text-[10px] text-muted-foreground">Legal: <span className="text-foreground">{order.supplierLegalName}</span></p>
              )}

              <div className="pt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Vendor GSTIN:</span>
                <span className="font-mono font-bold text-foreground">
                  {order.supplierGstin || 'Unregistered'}
                </span>
              </div>

              {(order.supplierPhone || order.supplierEmail) && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t mt-1 space-y-0.5">
                  {order.supplierPhone && <div>Phone: <span className="text-foreground font-mono">{order.supplierPhone}</span></div>}
                  {order.supplierEmail && <div>Email: <span className="text-foreground">{order.supplierEmail}</span></div>}
                </div>
              )}

              <div className="text-[10px] text-muted-foreground pt-1 border-t mt-1">
                Requirement: <span className="text-foreground font-medium">{order.rfqTitle}</span>
              </div>
            </div>
          </div>

          <div className="rounded bg-muted/30 border p-2 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <span>
              <strong>Direct Contract:</strong> This Purchase Order is a binding commercial contract directly between {order.buyerOrgName || 'Buyer'} and {order.supplierName || 'Supplier'}. Settlement occurs directly between parties.
            </span>
            <span className="font-semibold text-primary shrink-0">GST Verified ✓</span>
          </div>
        </div>

        {/* PO Lifecycle Actions */}
        <div className="rounded-lg border bg-card p-2.5 shadow-2xs">
          <PoActionButtons
            status={order.status}
            role={role}
            onAction={(n) => void handlePoAction(n)}
            disabled={busy}
          />
        </div>

        {/* Auto Create Work Order if missing */}
        {!workOrder && (
          <div className="rounded-lg border bg-card p-3 shadow-2xs">
            <p className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">Work Execution &amp; Progress</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Track milestone progress (0% → 100%) and mutual inspection acknowledgment.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreateWorkOrder()}
              className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'Initializing…' : 'Initialize Work Order Progress →'}
            </button>
          </div>
        )}

        {/* Work Order & 2-Way Progress Tracking */}
        {workOrder && (
          <section className="rounded-lg border bg-card p-3 shadow-2xs space-y-2.5" data-testid="work-order-section">
            <div className="flex items-center justify-between border-b pb-1.5">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">Work Execution &amp; Milestones</h2>
              <span className="text-[10px] text-muted-foreground">{workOrder.title}</span>
            </div>

            <div className="rounded-lg border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <StatusBadge status={workOrder.status} />
                  <span className="text-xs font-bold text-foreground font-mono">
                    {workOrder.progressPercent}% Complete
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {workOrder.progressPercent === 100
                    ? workOrder.buyerAcceptedAt
                      ? '✓ 100% Mutual Acknowledgment Complete'
                      : '100% Reported · Awaiting Buyer Sign-off'
                    : 'Milestone In Progress'}
                </span>
              </div>

              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 border">
                <div
                  className={`h-full transition-all duration-300 ${
                    workOrder.progressPercent >= 100
                      ? 'bg-emerald-600'
                      : workOrder.progressPercent >= 75
                      ? 'bg-lime-500'
                      : workOrder.progressPercent >= 50
                      ? 'bg-blue-500'
                      : workOrder.progressPercent >= 25
                      ? 'bg-yellow-400'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${workOrder.progressPercent}%` }}
                />
              </div>

              {/* Supplier Milestone Update Controls */}
              {role === 'supplier' && workOrder.status !== 'COMPLETED' && (
                <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Update:</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleProgress(25)}
                    className="rounded border border-yellow-400 bg-yellow-50 px-2 py-0.5 text-[10px] font-bold text-yellow-900 shadow-2xs hover:bg-yellow-100 disabled:opacity-50"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleProgress(50)}
                    className="rounded border border-blue-400 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-900 shadow-2xs hover:bg-blue-100 disabled:opacity-50"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleProgress(75)}
                    className="rounded border border-lime-500 bg-lime-50 px-2 py-0.5 text-[10px] font-bold text-lime-900 shadow-2xs hover:bg-lime-100 disabled:opacity-50"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleProgress(100)}
                    className="rounded bg-emerald-800 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-2xs hover:bg-emerald-900 disabled:opacity-50"
                  >
                    ✓ 100% Delivered
                  </button>
                </div>
              )}
            </div>

            {/* Delivery & Inspection Panel */}
            <DeliveryInspectionPanel
              workOrder={workOrder}
              role={role}
              onAccepted={() => void load()}
            />

            {/* Invoicing & Settlement Panel */}
            <div id="invoicing-section">
              <InvoicePaymentPanel
                workOrderId={workOrder.id}
                supplierId={order.supplierId}
                role={role}
                poAmount={order.totalAmount}
                deliveryAccepted={Boolean(workOrder.buyerAcceptedAt)}
                onUpdated={() => void load()}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
